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
 * GET /api/projects/:projectId/dar - List DAR requirements for project (cascading: client → contractor → subs)
 */
router.get('/:projectId/dar', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT id, client_id FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    const canSee = req.user.role === 'admin' || project.client_id === req.user.id ||
      db.prepare('SELECT 1 FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(req.params.projectId, req.user.id, 'approved');
    if (!canSee) return apiResponse(res, 403, null, 'Access denied');

    const rows = db.prepare(`
      SELECT d.id, d.project_id, d.added_by_id, d.requirement_key, d.label, d.sort_order, d.created_at,
        u.role as added_by_role, u.company_name as added_by_company
      FROM project_dar_requirements d
      JOIN users u ON u.id = d.added_by_id
      WHERE d.project_id = ?
      ORDER BY
        CASE WHEN u.role = 'client' THEN 1 WHEN u.role = 'contractor' THEN 2 ELSE 3 END,
        d.sort_order, d.created_at
    `).all(req.params.projectId);
    return apiResponse(res, 200, rows, 'DAR requirements retrieved');
  } catch (error) {
    console.error('Get DAR error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects/:projectId/dar - Add DAR requirement (client / contractor / sub by chain of authority)
 */
router.post('/:projectId/dar', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { requirement_key, label } = req.body;
    if (!requirement_key || !label) return apiResponse(res, 400, null, 'requirement_key and label required');

    const project = db.prepare('SELECT id, client_id FROM projects WHERE id = ?').get(req.params.projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');

    let canAdd = false;
    if (req.user.role === 'admin') canAdd = true;
    else if (req.user.role === 'client' && project.client_id === req.user.id) canAdd = true;
    else if (req.user.role === 'contractor' || req.user.role === 'subcontractor') {
      const del = db.prepare('SELECT 1 FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(req.params.projectId, req.user.id, 'approved');
      if (del) canAdd = true;
    }
    if (!canAdd) return apiResponse(res, 403, null, 'You cannot add DAR requirements to this project');

    const id = uuidv4();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM project_dar_requirements WHERE project_id = ?').get(req.params.projectId);
    db.prepare(`
      INSERT INTO project_dar_requirements (id, project_id, added_by_id, requirement_key, label, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.params.projectId, req.user.id, requirement_key, label, maxOrder?.next_order || 1);

    const row = db.prepare(`
      SELECT d.*, u.role as added_by_role, u.company_name as added_by_company
      FROM project_dar_requirements d JOIN users u ON u.id = d.added_by_id WHERE d.id = ?
    `).get(id);
    return apiResponse(res, 201, row, 'DAR requirement added');
  } catch (error) {
    console.error('Add DAR error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects - Create a new Verified Project (Client only)
 */
router.post('/', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const { title, description, sector, location, country, start_date, end_date, compliance_requirements, privacy_settings, max_workers, pqq_template_id, pqq_due_days } = req.body;

    if (!title) return apiResponse(res, 400, null, 'Project title required');

    const id = uuidv4();
    const complianceJSON = JSON.stringify(compliance_requirements || ['SafePass', 'Site Induction']);
    const privacyJSON = JSON.stringify(privacy_settings || { public: true });

    db.prepare(`
      INSERT INTO projects (id, title, description, client_id, sector, location, country, start_date, end_date, status, compliance_requirements, privacy_settings, max_workers, pqq_template_id, pqq_due_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      description,
      req.user.id,
      sector || 'construction',
      location,
      country || 'Ireland',
      start_date,
      end_date,
      complianceJSON,
      privacyJSON,
      max_workers || 100,
      pqq_template_id || null,
      pqq_due_days != null ? Number(pqq_due_days) : null
    );

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'project_created', projectId: id, clientId: req.user.id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'project_created', 'project', id, JSON.stringify({ title, sector }), blockchainResult.transactionId, blockchainResult.dataHash);

    // VP-level DAR: if client sends dar_base (e.g. [{ key: 'rtw', label: 'Right-to-Work...' }]), insert into project_dar_requirements
    const darBase = req.body.dar_base;
    if (Array.isArray(darBase) && darBase.length > 0) {
      const insertDar = db.prepare(`
        INSERT INTO project_dar_requirements (id, project_id, added_by_id, requirement_key, label, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      darBase.forEach((item, idx) => {
        if (item && item.key && item.label) {
          insertDar.run(uuidv4(), id, req.user.id, item.key, item.label, idx + 1);
        }
      });
    }

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

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(assignment.project_id);
    if (!project) return apiResponse(res, 404, null, 'Project not found');

    // Block endorsement if worker has not satisfied all DAR requirements for this project
    const worker = db.prepare('SELECT * FROM users WHERE id = ?').get(assignment.worker_id);
    const darRequirements = db.prepare('SELECT id, label, requirement_key FROM project_dar_requirements WHERE project_id = ?').all(project.id);
    for (const darReq of darRequirements) {
      if (darReq.requirement_key === 'rtw') {
        if (!worker?.is_verified) {
          return apiResponse(res, 400, null, 'Cannot endorse: Right-to-Work status is required (from identity verification). The professional must complete passport and biometric verification; the client sees RTW status only – the passport is not shared.');
        }
        continue;
      }
      const sat = db.prepare('SELECT status FROM worker_dar_satisfaction WHERE worker_id = ? AND dar_requirement_id = ?').get(assignment.worker_id, darReq.id);
      if (!sat || sat.status !== 'satisfied') {
        return apiResponse(res, 400, null, `Cannot endorse: professional has not satisfied all DAR requirements (e.g. ${darReq.label}). They must complete the Data Access Requirements for this project first.`);
      }
    }
    
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

/**
 * GET /api/projects/:projectId/workers/:workerId/dar-status - DAR requirements and this professional's status (for "View DAR" in portal)
 */
router.get('/:projectId/workers/:workerId/dar-status', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { projectId, workerId } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    if (req.user.role === 'client' && project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Forbidden');
    if (['contractor', 'subcontractor'].includes(req.user.role)) {
      const del = db.prepare('SELECT id FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(projectId, req.user.id, 'approved');
      if (!del) return apiResponse(res, 403, null, 'Forbidden');
    }
    const assignment = db.prepare('SELECT * FROM project_assignments WHERE project_id = ? AND worker_id = ?').get(projectId, workerId);
    if (!assignment) return apiResponse(res, 404, null, 'Professional not assigned to this project');

    const worker = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(workerId);
    const requirements = db.prepare(`
      SELECT id, label, requirement_key, sort_order FROM project_dar_requirements WHERE project_id = ? ORDER BY sort_order, id
    `).all(projectId);
    // Fetch all satisfaction rows for this worker+project in one query
    const satRows = db.prepare('SELECT dar_requirement_id, status FROM worker_dar_satisfaction WHERE worker_id = ? AND project_id = ?').all(workerId, projectId);
    const satMap = Object.fromEntries(satRows.map(s => [s.dar_requirement_id, s.status]));
    const statuses = requirements.map(r => {
      const isRtw = r.requirement_key === 'rtw';
      let status;
      if (isRtw) {
        status = worker?.is_verified ? 'satisfied' : (satMap[r.id] || 'not_issued');
      } else {
        const sat = satMap[r.id];
        // DB persists "pending" for issued-not-yet-satisfied; API returns "issued" for UI clarity
        status = sat === 'satisfied' ? 'satisfied' : sat === 'pending' ? 'issued' : 'not_issued';
      }
      return { ...r, status };
    });
    return apiResponse(res, 200, {
      dar_requested_at: assignment.dar_requested_at || null,
      requirements: statuses,
      satisfied_count: statuses.filter(s => s.status === 'satisfied').length,
      issued_count: statuses.filter(s => s.status === 'issued').length,
      total: statuses.length,
    }, 'DAR status');
  } catch (error) {
    console.error('DAR status error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects/:projectId/workers/:workerId/dar/:darRequirementId/issue
 * Contractor/Subcontractor issues a single DAR requirement to a specific professional.
 * Creates/updates a worker_dar_satisfaction row with status='pending' (unless already satisfied).
 * NOTE: API exposes this as "issued" in responses; DB uses "pending" due schema constraints.
 */
router.post('/:projectId/workers/:workerId/dar/:darRequirementId/issue', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { projectId, workerId, darRequirementId } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    if (req.user.role === 'client' && project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Forbidden');
    if (['contractor', 'subcontractor'].includes(req.user.role)) {
      const del = db.prepare('SELECT id FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(projectId, req.user.id, 'approved');
      if (!del) return apiResponse(res, 403, null, 'Forbidden');
    }
    const requirement = db.prepare('SELECT id, label FROM project_dar_requirements WHERE id = ? AND project_id = ?').get(darRequirementId, projectId);
    if (!requirement) return apiResponse(res, 404, null, 'DAR requirement not found');

    const existing = db.prepare('SELECT id, status FROM worker_dar_satisfaction WHERE worker_id = ? AND dar_requirement_id = ?').get(workerId, darRequirementId);
    if (existing && existing.status === 'satisfied') {
      return apiResponse(res, 200, { status: 'satisfied' }, 'Requirement already satisfied');
    }
    if (existing) {
      db.prepare(`UPDATE worker_dar_satisfaction SET status = 'pending', submitted_at = datetime('now') WHERE id = ?`).run(existing.id);
    } else {
      db.prepare(`INSERT INTO worker_dar_satisfaction (id, worker_id, project_id, dar_requirement_id, status, credential_id, submitted_at) VALUES (?, ?, ?, ?, 'pending', NULL, datetime('now'))`).run(uuidv4(), workerId, projectId, darRequirementId);
    }

    const auditId = uuidv4();
    const bc = MockBlockchain.anchorData({ action: 'dar_issued', darRequirementId, workerId, projectId });
    db.prepare(`INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(auditId, req.user.id, 'dar_issued', 'worker_dar_satisfaction', darRequirementId, JSON.stringify({ workerId, projectId, darRequirementId, label: requirement.label }), bc.transactionId, bc.dataHash);

    return apiResponse(res, 200, { status: 'issued' }, `DAR requirement "${requirement.label}" issued to professional`);
  } catch (error) {
    console.error('DAR issue error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/projects/:projectId/workers/:workerId/dar/:darRequirementId/satisfy
 * Contractor/Subcontractor marks a DAR item as satisfied on behalf of a professional
 * (for demo/override). Optional body: { credential_id }
 */
router.put('/:projectId/workers/:workerId/dar/:darRequirementId/satisfy', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { projectId, workerId, darRequirementId } = req.params;
    const { credential_id } = req.body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    if (req.user.role === 'client' && project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Forbidden');
    if (['contractor', 'subcontractor'].includes(req.user.role)) {
      const del = db.prepare('SELECT id FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(projectId, req.user.id, 'approved');
      if (!del) return apiResponse(res, 403, null, 'Forbidden');
    }

    const requirement = db.prepare('SELECT id, requirement_key FROM project_dar_requirements WHERE id = ? AND project_id = ?').get(darRequirementId, projectId);
    if (!requirement) return apiResponse(res, 404, null, 'DAR requirement not found');

    const existing = db.prepare('SELECT id FROM worker_dar_satisfaction WHERE worker_id = ? AND dar_requirement_id = ?').get(workerId, darRequirementId);
    const credId = credential_id || null;
    if (existing) {
      db.prepare(`UPDATE worker_dar_satisfaction SET status = 'satisfied', credential_id = ?, submitted_at = datetime('now') WHERE id = ?`).run(credId, existing.id);
    } else {
      db.prepare(`INSERT INTO worker_dar_satisfaction (id, worker_id, project_id, dar_requirement_id, status, credential_id, submitted_at) VALUES (?, ?, ?, ?, 'satisfied', ?, datetime('now'))`).run(uuidv4(), workerId, projectId, darRequirementId, credId);
    }

    const auditId = uuidv4();
    const bc = MockBlockchain.anchorData({ action: 'dar_satisfied_override', darRequirementId, workerId, projectId });
    db.prepare(`INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(auditId, req.user.id, 'dar_satisfied', 'worker_dar_satisfaction', darRequirementId, JSON.stringify({ workerId, projectId, darRequirementId, credential_id: credId }), bc.transactionId, bc.dataHash);

    return apiResponse(res, 200, { dar_requirement_id: darRequirementId, status: 'satisfied' }, 'DAR requirement marked as satisfied');
  } catch (error) {
    console.error('DAR satisfy error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/projects/:projectId/assignments/:assignmentId/request-dar - Send DAR request to this professional (sets dar_requested_at)
 */
router.post('/:projectId/assignments/:assignmentId/request-dar', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { projectId, assignmentId } = req.params;
    const assignment = db.prepare('SELECT * FROM project_assignments WHERE id = ? AND project_id = ?').get(assignmentId, projectId);
    if (!assignment) return apiResponse(res, 404, null, 'Assignment not found');
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    if (req.user.role === 'client' && project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Forbidden');
    if (['contractor', 'subcontractor'].includes(req.user.role)) {
      const del = db.prepare('SELECT id FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(projectId, req.user.id, 'approved');
      if (!del) return apiResponse(res, 403, null, 'Forbidden');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE project_assignments SET dar_requested_at = ?, updated_at = datetime(\'now\') WHERE id = ?').run(now, assignmentId);
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'dar_requested', assignmentId, projectId, workerId: assignment.worker_id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'dar_requested', 'project_assignment', assignmentId,
      JSON.stringify({ project_id: projectId, worker_id: assignment.worker_id }), blockchainResult.transactionId, blockchainResult.dataHash);
    return apiResponse(res, 200, { dar_requested_at: now }, 'DAR request sent to professional');
  } catch (error) {
    console.error('Request DAR error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * DELETE /api/projects/:id - Delete a project (client owner only)
 */
router.delete('/:id', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    if (project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Only the project owner can delete this project');

    const deleteTransaction = db.transaction(() => {
      // Delete children first to satisfy FK constraints (no ON DELETE CASCADE in schema).
      db.prepare('DELETE FROM worker_dar_satisfaction WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM project_dar_requirements WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM pqq_submissions WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM pqq_invitations WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM badges WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM awards WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM tokens WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM project_assignments WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM project_delegations WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
    });
    deleteTransaction();

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'project_deleted', projectId: req.params.id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'project_deleted', 'project', req.params.id,
      JSON.stringify({ title: project.title }), blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 200, null, 'Project deleted successfully');
  } catch (error) {
    console.error('Delete project error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
