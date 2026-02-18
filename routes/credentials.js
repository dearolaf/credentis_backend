const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const MockBlockchain = require('../utils/blockchain');
const { mockSafePassCheck, apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/credentials - Get user's credentials
 */
router.get('/', authenticate, (req, res) => {
  try {
    const workerId = req.query.worker_id || req.user.id;

    // Workers can only see their own, others can see assigned workers
    if (req.user.role === 'worker' && workerId !== req.user.id) {
      return apiResponse(res, 403, null, 'Cannot view other professionals\' credentials');
    }

    const credentials = db.prepare(`
      SELECT * FROM credentials WHERE worker_id = ? ORDER BY created_at DESC
    `).all(workerId);

    // Get worker's project assignments to associate credentials with projects
    const assignments = db.prepare(`
      SELECT pa.project_id, p.title as project_title, pa.status
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.worker_id = ? AND pa.status IN ('active', 'approved', 'completed')
      ORDER BY pa.created_at DESC
    `).all(workerId);

    // Add compliance status and project association to each credential
    const enrichedCreds = credentials.map((cred, index) => {
      const compliance = cred.expiry_date
        ? mockSafePassCheck(cred.expiry_date)
        : { status: 'valid', color: 'green' };

      // Associate credentials with projects round-robin style for demo clarity
      const assignment = assignments.length > 0 ? assignments[index % assignments.length] : null;

      return {
        ...cred,
        compliance_status: compliance,
        project_id: assignment ? assignment.project_id : null,
        project_title: assignment ? assignment.project_title : null,
      };
    });

    return apiResponse(res, 200, enrichedCreds, 'Credentials retrieved');
  } catch (error) {
    console.error('Get credentials error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/credentials/:id - Get credential detail
 */
router.get('/:id', authenticate, (req, res) => {
  try {
    const credential = db.prepare('SELECT * FROM credentials WHERE id = ?').get(req.params.id);
    if (!credential) return apiResponse(res, 404, null, 'Credential not found');

    // Verify on blockchain
    const verification = MockBlockchain.verifyCredential(credential.vc_hash);

    return apiResponse(res, 200, { ...credential, blockchain_verification: verification }, 'Credential retrieved');
  } catch (error) {
    console.error('Get credential error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/credentials - Upload/create a new credential
 */
router.post('/', authenticate, (req, res) => {
  try {
    const { type, title, issuer, issue_date, expiry_date, data } = req.body;

    if (!type || !title) return apiResponse(res, 400, null, 'Type and title required');

    const workerId = req.user.role === 'worker' ? req.user.id : req.body.worker_id;
    if (!workerId) return apiResponse(res, 400, null, 'Professional ID required');

    // Create VC
    const worker = db.prepare('SELECT * FROM users WHERE id = ?').get(workerId);
    const vcResult = MockBlockchain.createVC(
      type,
      { id: worker.id, did: worker.did },
      { id: 'credentis-platform', name: issuer || 'Credentis Platform' },
      { type, title, ...(data || {}) }
    );

    const id = uuidv4();
    db.prepare(`
      INSERT INTO credentials (id, worker_id, type, title, issuer, issue_date, expiry_date, status, data, vc_hash, blockchain_tx, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?, 1)
    `).run(id, workerId, type, title, issuer || 'Credentis Platform', issue_date || new Date().toISOString(),
      expiry_date, JSON.stringify({ ...data, vc: vcResult.vc }), vcResult.vcHash, vcResult.blockchainTx);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'credential_issued', 'credential', id,
      JSON.stringify({ type, title, workerId }),
      vcResult.blockchainTx, vcResult.vcHash);

    const credential = db.prepare('SELECT * FROM credentials WHERE id = ?').get(id);
    return apiResponse(res, 201, credential, 'Credential created');
  } catch (error) {
    console.error('Create credential error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/credentials/:id/verify - Verify credential on blockchain
 */
router.post('/:id/verify', authenticate, (req, res) => {
  try {
    const credential = db.prepare('SELECT * FROM credentials WHERE id = ?').get(req.params.id);
    if (!credential) return apiResponse(res, 404, null, 'Credential not found');

    const verification = MockBlockchain.verifyCredential(credential.vc_hash);
    const expiryCheck = credential.expiry_date ? mockSafePassCheck(credential.expiry_date) : null;

    return apiResponse(res, 200, { verification, expiryCheck }, 'Credential verified');
  } catch (error) {
    console.error('Verify credential error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/credentials/:id/revoke - Revoke a credential
 */
router.put('/:id/revoke', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    db.prepare("UPDATE credentials SET status = 'revoked', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'credential_revoked', credentialId: req.params.id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'credential_revoked', 'credential', req.params.id,
      JSON.stringify({ revokedBy: req.user.id }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 200, null, 'Credential revoked');
  } catch (error) {
    console.error('Revoke credential error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
