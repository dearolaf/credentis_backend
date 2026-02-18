const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const MockBlockchain = require('../utils/blockchain');
const { mockPQQCheck, apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/onboarding/partners - List partners / prospective partners
 */
router.get('/partners', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const partners = db.prepare(`
      SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.company_name, u.company_registration, u.is_verified, u.created_at,
        (SELECT COUNT(*) FROM project_delegations pd WHERE pd.delegatee_id = u.id AND pd.status = 'approved') as active_delegations,
        (SELECT pq.status FROM pqq_submissions pq WHERE pq.company_id = u.id ORDER BY pq.created_at DESC LIMIT 1) as latest_pqq_status
      FROM users u
      WHERE u.role IN ('contractor', 'subcontractor')
      ORDER BY u.company_name
    `).all();

    return apiResponse(res, 200, partners, 'Partners retrieved');
  } catch (error) {
    console.error('Get partners error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/onboarding/invite - Invite a prospective partner
 */
router.post('/invite', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const { email, role, company_name } = req.body;

    if (!email || !role || !company_name) {
      return apiResponse(res, 400, null, 'email, role, and company_name required');
    }

    // Check if already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return apiResponse(res, 409, null, 'User already registered');
    }

    // For PoC, create a placeholder user
    const id = uuidv4();
    const bcrypt = require('bcryptjs');
    const password_hash = bcrypt.hashSync('Welcome123!', 10);
    const did = MockBlockchain.createDID(id);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, first_name, last_name, company_name, did, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, email, password_hash, role, 'Invited', 'Partner', company_name, did);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'partner_invited', 'user', id, JSON.stringify({ email, role, company_name }));

    return apiResponse(res, 201, { id, email, role, company_name }, 'Partner invited');
  } catch (error) {
    console.error('Invite partner error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/onboarding/pqq - Submit PQQ
 */
router.post('/pqq', authenticate, requireRole('contractor', 'subcontractor'), (req, res) => {
  try {
    const { project_id, company_profile, documents, financial_status, compliance_status, additional_info, employee_count, references } = req.body;

    const id = uuidv4();

    // Use provided data or run mock PQQ checks
    let financialData, complianceData;
    if (financial_status) {
      financialData = typeof financial_status === 'string' ? financial_status : JSON.stringify(financial_status);
      complianceData = typeof compliance_status === 'string' ? compliance_status : JSON.stringify(compliance_status || {});
    } else {
      const pqqResult = mockPQQCheck(company_profile);
      financialData = JSON.stringify(pqqResult.financialHealth);
      complianceData = JSON.stringify(pqqResult.complianceFlags);
    }

    db.prepare(`
      INSERT INTO pqq_submissions (id, company_id, project_id, submitted_by, status, company_profile, financial_status, compliance_status, documents)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, project_id, req.user.id, 'under_review',
      JSON.stringify(company_profile || { additional_info, employee_count, references }),
      financialData, complianceData,
      JSON.stringify(documents || []));

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'pqq_submitted', pqqId: id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'pqq_submitted', 'pqq', id,
      JSON.stringify({ submittedBy: req.user.id }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 201, { id, status: 'under_review' }, 'PQQ submitted');
  } catch (error) {
    console.error('Submit PQQ error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/pqq - List PQQ submissions
 */
router.get('/pqq', authenticate, (req, res) => {
  try {
    let pqqs;
    if (req.user.role === 'client' || req.user.role === 'admin') {
      pqqs = db.prepare(`
        SELECT pq.*, u.company_name, u.first_name, u.last_name
        FROM pqq_submissions pq
        JOIN users u ON u.id = pq.company_id
        ORDER BY pq.created_at DESC
      `).all();
    } else {
      pqqs = db.prepare(`
        SELECT * FROM pqq_submissions WHERE company_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
    }

    return apiResponse(res, 200, pqqs, 'PQQ submissions retrieved');
  } catch (error) {
    console.error('Get PQQs error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/onboarding/pqq/:id/review - Review PQQ submission
 */
router.put('/pqq/:id/review', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const { status, review_notes } = req.body;
    const validStatuses = ['approved', 'rejected'];

    if (!validStatuses.includes(status)) {
      return apiResponse(res, 400, null, `Status must be: ${validStatuses.join(', ')}`);
    }

    db.prepare(`
      UPDATE pqq_submissions SET status = ?, reviewed_by = ?, review_notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, req.user.id, review_notes, req.params.id);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'pqq_reviewed', 'pqq', req.params.id, JSON.stringify({ status, review_notes }));

    return apiResponse(res, 200, null, `PQQ ${status}`);
  } catch (error) {
    console.error('Review PQQ error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/tasks - Task queue for outstanding actions
 */
router.get('/tasks', authenticate, (req, res) => {
  try {
    const tasks = [];

    // Pending PQQ reviews (for clients)
    if (['client', 'admin'].includes(req.user.role)) {
      const pendingPQQs = db.prepare("SELECT COUNT(*) as count FROM pqq_submissions WHERE status = 'under_review'").get();
      if (pendingPQQs.count > 0) {
        tasks.push({ type: 'pqq_review', count: pendingPQQs.count, priority: 'high', label: 'PQQ submissions awaiting review' });
      }
    }

    // Pending delegations (for clients)
    if (['client', 'admin'].includes(req.user.role)) {
      const pendingDelegations = db.prepare("SELECT COUNT(*) as count FROM project_delegations WHERE status = 'pending'").get();
      if (pendingDelegations.count > 0) {
        tasks.push({ type: 'delegation_approval', count: pendingDelegations.count, priority: 'high', label: 'Delegations awaiting approval' });
      }
    }

    // Pending worker approvals
    if (['client', 'contractor', 'subcontractor'].includes(req.user.role)) {
      const pendingWorkers = db.prepare("SELECT COUNT(*) as count FROM project_assignments WHERE status = 'pending'").get();
      if (pendingWorkers.count > 0) {
        tasks.push({ type: 'worker_approval', count: pendingWorkers.count, priority: 'medium', label: 'Professional applications pending' });
      }
    }

    // Expiring credentials
    const expiringCreds = db.prepare(`
      SELECT COUNT(*) as count FROM credentials
      WHERE expiry_date IS NOT NULL AND expiry_date <= datetime('now', '+30 days') AND status = 'valid'
    `).get();
    if (expiringCreds.count > 0) {
      tasks.push({ type: 'credential_expiry', count: expiringCreds.count, priority: 'medium', label: 'Credentials expiring within 30 days' });
    }

    // Consent requests
    if (req.user.role === 'worker') {
      const pendingConsent = db.prepare("SELECT COUNT(*) as count FROM data_access_requests WHERE target_user_id = ? AND status = 'pending'").get(req.user.id);
      if (pendingConsent.count > 0) {
        tasks.push({ type: 'consent_request', count: pendingConsent.count, priority: 'high', label: 'Data access requests pending' });
      }
    }

    return apiResponse(res, 200, tasks, 'Task queue retrieved');
  } catch (error) {
    console.error('Get tasks error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
