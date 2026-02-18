const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireProjectAccess } = require('../middleware/rbac');
const MockBlockchain = require('../utils/blockchain');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/projects - List projects (filtered by role)
 */
router.get('/', authenticate, (req, res) => {
  try {
    let projects;
    const { status, sector } = req.query;

    if (req.user.role === 'client') {
      projects = db.prepare(`
        SELECT p.*, 
          (SELECT COUNT(*) FROM project_assignments pa WHERE pa.project_id = p.id AND pa.status IN ('approved','active')) as worker_count,
          (SELECT COUNT(*) FROM project_delegations pd WHERE pd.project_id = p.id AND pd.status = 'approved') as delegation_count
        FROM projects p WHERE p.client_id = ? ORDER BY p.created_at DESC
      `).all(req.user.id);
    } else if (req.user.role === 'contractor' || req.user.role === 'subcontractor') {
      projects = db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM project_assignments pa WHERE pa.project_id = p.id AND pa.status IN ('approved','active')) as worker_count
        FROM projects p
        INNER JOIN project_delegations pd ON pd.project_id = p.id
        WHERE pd.delegatee_id = ? AND pd.status = 'approved'
        ORDER BY p.created_at DESC
      `).all(req.user.id);
    } else if (req.user.role === 'worker') {
      // Workers see public active projects + their assigned projects
      projects = db.prepare(`
        SELECT DISTINCT p.*,
          pa.status as assignment_status,
          pa.endorsement_status
        FROM projects p
        LEFT JOIN project_assignments pa ON pa.project_id = p.id AND pa.worker_id = ?
        WHERE p.status = 'active' OR pa.worker_id IS NOT NULL
        ORDER BY p.created_at DESC
      `).all(req.user.id);
    } else {
      projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
    }

    return apiResponse(res, 200, projects, 'Projects retrieved');
  } catch (error) {
    console.error('Get projects error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/projects/:projectId - Get project details
 */
router.get('/:projectId', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');

    // Get delegations
    const delegations = db.prepare(`
      SELECT pd.*, u.first_name, u.last_name, u.company_name, u.role
      FROM project_delegations pd
      JOIN users u ON u.id = pd.delegatee_id
      WHERE pd.project_id = ?
    `).all(project.id);

    // Get workers
    const workers = db.prepare(`
      SELECT pa.*, u.first_name, u.last_name, u.nationality, u.did
      FROM project_assignments pa
      JOIN users u ON u.id = pa.worker_id
      WHERE pa.project_id = ?
    `).all(project.id);

    // Get client info
    const client = db.prepare('SELECT id, first_name, last_name, company_name FROM users WHERE id = ?').get(project.client_id);

    return apiResponse(res, 200, { ...project, delegations, workers, client }, 'Project details retrieved');
  } catch (error) {
    console.error('Get project error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects - Create a new Verified Project (Client only)
 */
router.post('/', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const { title, description, sector, location, country, start_date, end_date, compliance_requirements, privacy_settings, max_workers } = req.body;

    if (!title) return apiResponse(res, 400, null, 'Project title required');

    const id = uuidv4();
    const complianceJSON = JSON.stringify(compliance_requirements || ['SafePass', 'Site Induction']);
    const privacyJSON = JSON.stringify(privacy_settings || { public: true });

    db.prepare(`
      INSERT INTO projects (id, title, description, client_id, sector, location, country, start_date, end_date, status, compliance_requirements, privacy_settings, max_workers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(id, title, description, req.user.id, sector || 'construction', location, country || 'Ireland', start_date, end_date, complianceJSON, privacyJSON, max_workers || 100);

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'project_created', projectId: id, clientId: req.user.id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'project_created', 'project', id, JSON.stringify({ title, sector }), blockchainResult.transactionId, blockchainResult.dataHash);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return apiResponse(res, 201, project, 'Project created successfully');
  } catch (error) {
    console.error('Create project error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects/:projectId/delegate - Delegate project to contractor/subcontractor
 */
router.post('/:projectId/delegate', authenticate, requireRole('client', 'contractor'), (req, res) => {
  try {
    const { delegatee_id, scope } = req.body;
    const projectId = req.params.projectId;

    if (!delegatee_id) return apiResponse(res, 400, null, 'Delegatee ID required');

    const delegatee = db.prepare('SELECT * FROM users WHERE id = ? AND role IN (?, ?)').get(delegatee_id, 'contractor', 'subcontractor');
    if (!delegatee) return apiResponse(res, 404, null, 'Delegatee not found or invalid role');

    const id = uuidv4();
    const status = req.user.role === 'client' ? 'approved' : 'pending'; // Client approval auto, contractor needs client approval

    db.prepare(`
      INSERT INTO project_delegations (id, project_id, delegator_id, delegatee_id, delegatee_role, scope, status, approved_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, req.user.id, delegatee_id, delegatee.role, JSON.stringify(scope || {}), status, status === 'approved' ? req.user.id : null);

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'project_delegated', projectId, delegateeId: delegatee_id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'project_delegated', 'project_delegation', id,
      JSON.stringify({ projectId, delegateeId: delegatee_id, role: delegatee.role }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 201, { id, projectId, delegatee_id, status }, 'Delegation created');
  } catch (error) {
    console.error('Delegate error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/projects/:projectId/delegations/:delegationId/status - Approve/reject delegation
 */
router.put('/:projectId/delegations/:delegationId/status', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const { status } = req.body;
    const { delegationId } = req.params;

    if (!['approved', 'rejected'].includes(status)) {
      return apiResponse(res, 400, null, 'Status must be approved or rejected');
    }

    const delegation = db.prepare('SELECT * FROM project_delegations WHERE id = ?').get(delegationId);
    if (!delegation) return apiResponse(res, 404, null, 'Delegation not found');

    db.prepare("UPDATE project_delegations SET status = ?, approved_by = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, status === 'approved' ? req.user.id : null, delegationId);

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: `delegation_${status}`, delegationId });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, `delegation_${status}`, 'project_delegation', delegationId,
      JSON.stringify({ projectId: req.params.projectId, delegateeId: delegation.delegatee_id }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 200, { delegationId, status }, `Delegation ${status}`);
  } catch (error) {
    console.error('Update delegation error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects/:projectId/apply - Worker applies for project
 */
router.post('/:projectId/apply', authenticate, requireRole('worker'), (req, res) => {
  try {
    const { role_on_project, start_date, end_date, supporting_info } = req.body;
    const projectId = req.params.projectId;

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND status = ?').get(projectId, 'active');
    if (!project) return apiResponse(res, 404, null, 'Project not found or not active');

    // Check if already assigned
    const existing = db.prepare('SELECT id FROM project_assignments WHERE project_id = ? AND worker_id = ? AND status NOT IN (?, ?)').get(projectId, req.user.id, 'rejected', 'revoked');
    if (existing) return apiResponse(res, 409, null, 'Already applied to this project');

    const id = uuidv4();
    db.prepare(`
      INSERT INTO project_assignments (id, project_id, worker_id, assigned_by, role_on_project, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(id, projectId, req.user.id, req.user.id, role_on_project || 'worker', start_date, end_date);

    // Audit (blockchain-anchored)
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'project_application', projectId, workerId: req.user.id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'project_application', 'project_assignment', id,
      JSON.stringify({ projectId, role: role_on_project }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 201, { id, projectId, status: 'pending' }, 'Application submitted');
  } catch (error) {
    console.error('Apply error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/projects/:projectId/assignments/:assignmentId/endorse - Endorse worker participation
 */
router.put('/:projectId/assignments/:assignmentId/endorse', authenticate, requireRole('client', 'contractor', 'subcontractor'), (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = db.prepare('SELECT * FROM project_assignments WHERE id = ?').get(assignmentId);
    if (!assignment) return apiResponse(res, 404, null, 'Assignment not found');

    // Create Project Participation VC
    const worker = db.prepare('SELECT * FROM users WHERE id = ?').get(assignment.worker_id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(assignment.project_id);
    
    const vcResult = MockBlockchain.createVC(
      'ProjectParticipationCredential',
      { id: worker.id, did: worker.did },
      { id: req.user.id, did: req.user.did, name: `${req.user.first_name} ${req.user.last_name}` },
      { projectId: project.id, projectTitle: project.title, role: assignment.role_on_project, endorsedBy: req.user.id }
    );

    db.prepare(`
      UPDATE project_assignments
      SET status = 'active', endorsement_status = 'endorsed', endorsed_by = ?, endorsed_at = datetime('now'), project_vc_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(req.user.id, vcResult.vcHash, assignmentId);

    // Store VC as credential
    const credId = uuidv4();
    db.prepare(`
      INSERT INTO credentials (id, worker_id, type, title, issuer, issue_date, status, data, vc_hash, blockchain_tx, is_verified)
      VALUES (?, ?, ?, ?, ?, datetime('now'), 'valid', ?, ?, ?, 1)
    `).run(credId, worker.id, 'ProjectParticipation', `Project: ${project.title}`, `${req.user.first_name} ${req.user.last_name}`,
      JSON.stringify(vcResult.vc), vcResult.vcHash, vcResult.blockchainTx);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'worker_endorsed', 'project_assignment', assignmentId,
      JSON.stringify({ workerId: worker.id, projectId: project.id }),
      vcResult.blockchainTx, vcResult.vcHash);

    return apiResponse(res, 200, { assignment: assignmentId, vc: vcResult.vc, blockchainTx: vcResult.blockchainTx }, 'Professional endorsed successfully');
  } catch (error) {
    console.error('Endorse error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/projects/:projectId/assignments/:assignmentId/status - Update assignment status
 */
router.put('/:projectId/assignments/:assignmentId/status', authenticate, requireRole('client', 'contractor', 'subcontractor'), (req, res) => {
  try {
    const { status } = req.body;
    const { assignmentId } = req.params;
    const validStatuses = ['approved', 'rejected', 'revoked', 'completed'];

    if (!validStatuses.includes(status)) {
      return apiResponse(res, 400, null, `Invalid status. Must be: ${validStatuses.join(', ')}`);
    }

    db.prepare('UPDATE project_assignments SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, assignmentId);

    return apiResponse(res, 200, { assignmentId, status }, 'Assignment status updated');
  } catch (error) {
    console.error('Update assignment error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/projects/:projectId/workers - Get project workers
 */
router.get('/:projectId/workers', authenticate, (req, res) => {
  try {
    const workers = db.prepare(`
      SELECT pa.*, u.first_name, u.last_name, u.email, u.nationality, u.did, u.is_verified,
        (SELECT COUNT(*) FROM credentials c WHERE c.worker_id = u.id AND c.status = 'valid') as valid_credentials,
        (SELECT COUNT(*) FROM badges b WHERE b.worker_id = u.id) as badge_count
      FROM project_assignments pa
      JOIN users u ON u.id = pa.worker_id
      WHERE pa.project_id = ?
      ORDER BY pa.created_at DESC
    `).all(req.params.projectId);

    return apiResponse(res, 200, workers, 'Professionals retrieved');
  } catch (error) {
    console.error('Get workers error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
