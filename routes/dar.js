const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/dar/my-requirements?project_id= - Consolidated DAR list for a project with worker's satisfaction status
 */
router.get('/my-requirements', authenticate, requireRole('worker'), (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (!projectId) return apiResponse(res, 400, null, 'project_id required');

    const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(projectId);
    if (!project) return apiResponse(res, 404, null, 'Project not found');

    const requirements = db.prepare(`
      SELECT d.id, d.project_id, d.requirement_key, d.label, d.sort_order,
        u.role as added_by_role, u.company_name as added_by_company
      FROM project_dar_requirements d
      JOIN users u ON u.id = d.added_by_id
      WHERE d.project_id = ?
      ORDER BY
        CASE WHEN u.role = 'client' THEN 1 WHEN u.role = 'contractor' THEN 2 ELSE 3 END,
        d.sort_order, d.created_at
    `).all(projectId);

    const satisfactions = db.prepare(`
      SELECT dar_requirement_id, status, credential_id, submitted_at
      FROM worker_dar_satisfaction
      WHERE worker_id = ? AND project_id = ?
    `).all(req.user.id, projectId);
    const satisfactionByReq = Object.fromEntries(satisfactions.map(s => [s.dar_requirement_id, s]));

    const worker = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(req.user.id);
    const isVerified = !!worker?.is_verified;

    const list = requirements.map(r => {
      const isRtw = r.requirement_key === 'rtw';
      const row = satisfactionByReq[r.id];
      let myStatus;
      if (isRtw) {
        myStatus = isVerified ? 'satisfied' : (row?.status || 'not_issued');
      } else {
        // DB stores issued items as "pending"; surface as "issued" to app UI
        myStatus = row?.status === 'satisfied' ? 'satisfied'
          : row?.status === 'pending' ? 'issued'
          : 'not_issued';
      }
      return {
        ...r,
        my_status: myStatus,
        // can_act: professional can only respond to items that have been issued to them
        can_act: myStatus === 'issued',
        credential_id: row?.credential_id,
        submitted_at: row?.submitted_at,
      };
    });

    const allSatisfied = list.length > 0 && list.every(i => i.my_status === 'satisfied');

    return apiResponse(res, 200, { project_id: projectId, project_title: project.title, requirements: list, all_satisfied: allSatisfied }, 'DAR requirements with status');
  } catch (error) {
    console.error('Get my-requirements error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/dar/satisfy - Submit credential / evidence for a DAR requirement (worker)
 * For RTW (requirement_key 'rtw'): no credential needed – status comes from identity verification; passport is not shared.
 */
router.post('/satisfy', authenticate, requireRole('worker'), (req, res) => {
  try {
    const { project_id, dar_requirement_id, credential_id } = req.body;
    if (!project_id || !dar_requirement_id) return apiResponse(res, 400, null, 'project_id and dar_requirement_id required');

    const requirement = db.prepare('SELECT id, project_id, requirement_key FROM project_dar_requirements WHERE id = ? AND project_id = ?').get(dar_requirement_id, project_id);
    if (!requirement) return apiResponse(res, 404, null, 'DAR requirement not found');

    if (requirement.requirement_key === 'rtw') {
      const worker = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(req.user.id);
      if (!worker?.is_verified) {
        return apiResponse(res, 400, null, 'Right-to-Work status is evidenced by identity verification. Complete passport and biometric verification in the app first; the client will see your RTW status only – your passport is not shared.');
      }
      // No credential_id for RTW – client sees status from verification only
    }

    const existing = db.prepare('SELECT id, status FROM worker_dar_satisfaction WHERE worker_id = ? AND dar_requirement_id = ?').get(req.user.id, dar_requirement_id);
    const credId = requirement.requirement_key === 'rtw' ? null : (credential_id || null);

    if (existing) {
      db.prepare(`
        UPDATE worker_dar_satisfaction SET status = 'satisfied', credential_id = ?, submitted_at = datetime('now') WHERE id = ?
      `).run(credId, existing.id);
    } else {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO worker_dar_satisfaction (id, worker_id, project_id, dar_requirement_id, status, credential_id, submitted_at)
        VALUES (?, ?, ?, ?, 'satisfied', ?, datetime('now'))
      `).run(id, req.user.id, project_id, dar_requirement_id, credId);
    }

    return apiResponse(res, 200, { dar_requirement_id, status: 'satisfied' }, 'Requirement marked as satisfied');
  } catch (error) {
    console.error('Satisfy DAR error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
