const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * Build DAR requirement list + status for one worker on one project (shared by my-requirements + overview).
 */
function getDarRequirementsForWorker(workerId, projectId) {
  const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

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
  `).all(workerId, projectId);
  const satisfactionByReq = Object.fromEntries(satisfactions.map(s => [s.dar_requirement_id, s]));

  const worker = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(workerId);
  const isVerified = !!worker?.is_verified;

  const list = requirements.map((r) => {
    const isRtw = r.requirement_key === 'rtw';
    const row = satisfactionByReq[r.id];
    let myStatus;
    if (isRtw) {
      myStatus = isVerified ? 'satisfied' : (row?.status || 'not_issued');
    } else {
      myStatus = row?.status === 'satisfied' ? 'satisfied'
        : row?.status === 'pending' ? 'issued'
          : 'not_issued';
    }
    return {
      ...r,
      my_status: myStatus,
      can_act: myStatus === 'issued',
      credential_id: row?.credential_id ?? null,
      submitted_at: row?.submitted_at ?? null,
    };
  });

  const satisfiedCount = list.filter((i) => i.my_status === 'satisfied').length;
  const issuedCount = list.filter((i) => i.my_status === 'issued').length;

  const assignment = db.prepare(`
    SELECT dar_requested_at FROM project_assignments WHERE project_id = ? AND worker_id = ?
  `).get(projectId, workerId);

  return {
    project_id: project.id,
    project_title: project.title,
    requirements: list,
    satisfied_count: satisfiedCount,
    issued_count: issuedCount,
    not_issued_count: list.length - satisfiedCount - issuedCount,
    total: list.length,
    all_satisfied: list.length > 0 && list.every((i) => i.my_status === 'satisfied'),
    dar_requested_at: assignment?.dar_requested_at || null,
  };
}

/**
 * GET /api/dar/overview - All assigned projects with DAR status (worker profile / summary)
 */
router.get('/overview', authenticate, requireRole('worker'), (req, res) => {
  try {
    const workerId = req.user.id;
    const rows = db.prepare(`
      SELECT DISTINCT pa.project_id, p.title as project_title
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.worker_id = ?
      ORDER BY p.title
    `).all(workerId);

    const projects = [];
    for (const row of rows) {
      const detail = getDarRequirementsForWorker(workerId, row.project_id);
      if (detail) projects.push(detail);
    }

    const totalReqs = projects.reduce((sum, p) => sum + (p.total || 0), 0);
    const satisfiedReqs = projects.reduce((sum, p) => sum + (p.satisfied_count || 0), 0);

    return apiResponse(res, 200, {
      projects,
      summary: {
        project_count: projects.length,
        requirement_total: totalReqs,
        requirement_satisfied: satisfiedReqs,
      },
    }, 'DAR overview');
  } catch (error) {
    console.error('Get DAR overview error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/dar/my-requirements?project_id= - Consolidated DAR list for a project with worker's satisfaction status
 */
router.get('/my-requirements', authenticate, requireRole('worker'), (req, res) => {
  try {
    const projectId = req.query.project_id;
    if (!projectId) return apiResponse(res, 400, null, 'project_id required');

    const detail = getDarRequirementsForWorker(req.user.id, projectId);
    if (!detail) return apiResponse(res, 404, null, 'Project not found');

    const { requirements, ...rest } = detail;
    return apiResponse(res, 200, {
      project_id: rest.project_id,
      project_title: rest.project_title,
      requirements,
      all_satisfied: rest.all_satisfied,
      satisfied_count: rest.satisfied_count,
      issued_count: rest.issued_count,
      total: rest.total,
      dar_requested_at: rest.dar_requested_at,
    }, 'DAR requirements with status');
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
