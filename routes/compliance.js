const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { mockSafePassCheck, apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/compliance/dashboard - Compliance dashboard data
 */
router.get('/dashboard', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    let projectFilter = '';
    let params = [];

    if (req.user.role === 'client') {
      projectFilter = 'WHERE p.client_id = ?';
      params = [req.user.id];
    } else if (['contractor', 'subcontractor'].includes(req.user.role)) {
      projectFilter = 'WHERE p.id IN (SELECT project_id FROM project_delegations WHERE delegatee_id = ? AND status = ?)';
      params = [req.user.id, 'approved'];
    }

    // Overall stats
    const totalWorkers = db.prepare(`
      SELECT COUNT(DISTINCT pa.worker_id) as count
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      ${projectFilter}
    `).get(...params);

    const totalProjects = db.prepare(`
      SELECT COUNT(*) as count FROM projects p ${projectFilter}
    `).get(...params);

    const activeAssignments = db.prepare(`
      SELECT COUNT(*) as count
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      ${projectFilter} ${projectFilter ? 'AND' : 'WHERE'} pa.status = 'active'
    `).get(...params, ...(projectFilter ? [] : []));

    // Credential expiry summary
    const allCredentials = db.prepare(`
      SELECT c.* FROM credentials c
      JOIN project_assignments pa ON pa.worker_id = c.worker_id
      JOIN projects p ON p.id = pa.project_id
      ${projectFilter}
    `).all(...params);

    let expirySummary = { green: 0, amber: 0, red: 0, noExpiry: 0 };
    allCredentials.forEach(cred => {
      if (cred.expiry_date) {
        const check = mockSafePassCheck(cred.expiry_date);
        expirySummary[check.color]++;
      } else {
        expirySummary.noExpiry++;
      }
    });

    // Workers by nationality
    const nationalityBreakdown = db.prepare(`
      SELECT u.nationality, COUNT(DISTINCT u.id) as count
      FROM users u
      JOIN project_assignments pa ON pa.worker_id = u.id
      JOIN projects p ON p.id = pa.project_id
      ${projectFilter}
      GROUP BY u.nationality
    `).all(...params);

    // Compliance by project
    const projectCompliance = db.prepare(`
      SELECT p.id, p.title, p.sector,
        COUNT(DISTINCT pa.worker_id) as total_workers,
        SUM(CASE WHEN pa.endorsement_status = 'endorsed' THEN 1 ELSE 0 END) as endorsed_workers,
        SUM(CASE WHEN pa.status = 'active' THEN 1 ELSE 0 END) as active_workers
      FROM projects p
      LEFT JOIN project_assignments pa ON pa.project_id = p.id
      ${projectFilter}
      GROUP BY p.id
    `).all(...params);

    return apiResponse(res, 200, {
      summary: {
        totalWorkers: totalWorkers.count,
        totalProjects: totalProjects.count,
        activeAssignments: activeAssignments.count
      },
      expirySummary,
      nationalityBreakdown,
      projectCompliance
    }, 'Compliance dashboard data');
  } catch (error) {
    console.error('Compliance dashboard error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/compliance/workers - Worker compliance status
 */
router.get('/workers', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { project_id } = req.query;
    let workers;

    if (project_id) {
      workers = db.prepare(`
        SELECT u.id, u.first_name, u.last_name, u.nationality, u.is_verified, u.did,
          pa.status as assignment_status, pa.endorsement_status, pa.role_on_project,
          p.title as project_title
        FROM users u
        JOIN project_assignments pa ON pa.worker_id = u.id
        JOIN projects p ON p.id = pa.project_id
        WHERE pa.project_id = ?
        ORDER BY u.last_name
      `).all(project_id);
    } else {
      workers = db.prepare(`
        SELECT DISTINCT u.id, u.first_name, u.last_name, u.nationality, u.is_verified, u.did
        FROM users u
        WHERE u.role = 'worker'
        ORDER BY u.last_name
      `).all();
    }

    // Enrich with credential status and DAR (when project_id is set)
    const enrichedWorkers = workers.map(worker => {
      const credentials = db.prepare('SELECT * FROM credentials WHERE worker_id = ?').all(worker.id);
      const badges = db.prepare('SELECT COUNT(*) as count FROM badges WHERE worker_id = ?').get(worker.id);

      let complianceStatus = 'compliant';
      let issues = [];

      credentials.forEach(cred => {
        if (cred.expiry_date) {
          const check = mockSafePassCheck(cred.expiry_date);
          if (check.color === 'red') {
            complianceStatus = 'non_compliant';
            issues.push(`${cred.title} expired`);
          } else if (check.color === 'amber' && complianceStatus !== 'non_compliant') {
            complianceStatus = 'at_risk';
            issues.push(`${cred.title} expiring soon`);
          }
        }
      });

      let darSatisfied = 0;
      let darIssued = 0;
      let darTotal = 0;
      if (project_id) {
        const darReqs = db.prepare('SELECT id, label, requirement_key FROM project_dar_requirements WHERE project_id = ?').all(project_id);
        darTotal = darReqs.length;
        const satRows = db.prepare('SELECT dar_requirement_id, status FROM worker_dar_satisfaction WHERE worker_id = ? AND project_id = ?').all(worker.id, project_id);
        const satMap = Object.fromEntries(satRows.map(s => [s.dar_requirement_id, s.status]));
        for (const dr of darReqs) {
          const isRtw = dr.requirement_key === 'rtw';
          const rtwSatisfied = isRtw && !!worker.is_verified;
          const rowStatus = satMap[dr.id];
          const otherSatisfied = !isRtw && rowStatus === 'satisfied';
          // DB persists issued items as "pending"
          const otherIssued = !isRtw && rowStatus === 'pending';
          if (rtwSatisfied || otherSatisfied) darSatisfied++;
          else if (otherIssued) darIssued++;
          if (!rtwSatisfied && !otherSatisfied && !otherIssued) {
            // Not issued at all → red / non-compliant
            complianceStatus = 'non_compliant';
            issues.push(`Missing DAR: ${dr.label}`);
          } else if (!rtwSatisfied && !otherSatisfied && otherIssued) {
            // Issued to professional, awaiting their response → amber, no issue entry
            // (the DAR column shows "X issued (awaiting)" so the Issues column stays clean)
            if (complianceStatus !== 'non_compliant') complianceStatus = 'at_risk';
          }
        }
      }

      return {
        ...worker,
        credentialCount: credentials.length,
        badgeCount: badges.count,
        complianceStatus,
        issues,
        darSatisfied,
        darIssued,
        darTotal
      };
    });

    return apiResponse(res, 200, enrichedWorkers, 'Professional compliance data');
  } catch (error) {
    console.error('Professional compliance error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/compliance/escalated - Compliance issues that escalate up the chain (red at sub → visible to contractor → client)
 * Query: project_id (optional). Returns issues with source_tier (subcontractor/contractor), so red at bottom is visible at top.
 */
router.get('/escalated', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { project_id } = req.query;
    let projectIds = [];

    if (req.user.role === 'client') {
      projectIds = project_id
        ? (db.prepare('SELECT id FROM projects WHERE id = ? AND client_id = ?').get(project_id, req.user.id) ? [project_id] : [])
        : db.prepare('SELECT id FROM projects WHERE client_id = ?').pluck().all(req.user.id);
    } else if (req.user.role === 'admin') {
      projectIds = project_id ? [project_id] : db.prepare('SELECT id FROM projects').pluck().all();
    } else {
      projectIds = db.prepare('SELECT project_id FROM project_delegations WHERE delegatee_id = ? AND status = ?').pluck().all(req.user.id, 'approved');
      if (project_id) projectIds = projectIds.filter(id => id === project_id);
    }

    const issues = [];
    for (const pid of projectIds) {
      const project = db.prepare('SELECT id, title FROM projects WHERE id = ?').get(pid);
      if (!project) continue;
      const assignments = db.prepare(`
        SELECT pa.id as assignment_id, pa.worker_id, pa.assigned_by, pa.created_at,
          u.first_name || ' ' || u.last_name as worker_name,
          assigner.role as source_role, assigner.company_name as source_entity_name
        FROM project_assignments pa
        JOIN users u ON u.id = pa.worker_id
        JOIN users assigner ON assigner.id = pa.assigned_by
        WHERE pa.project_id = ? AND pa.status IN ('pending', 'approved', 'active')
      `).all(pid);

      for (const a of assignments) {
        const sourceTier = a.source_role === 'subcontractor' ? 'subcontractor' : a.source_role === 'contractor' ? 'contractor' : 'client';
        if (req.user.role === 'subcontractor' && a.assigned_by !== req.user.id) continue;

        const darReqs = db.prepare('SELECT id, label FROM project_dar_requirements WHERE project_id = ?').all(pid);
        let darMissing = [];
        for (const dr of darReqs) {
          const sat = db.prepare('SELECT status FROM worker_dar_satisfaction WHERE worker_id = ? AND dar_requirement_id = ?').get(a.worker_id, dr.id);
          if (!sat || sat.status !== 'satisfied') darMissing.push(dr.label);
        }
        if (darMissing.length > 0) {
          const created = new Date(a.created_at).getTime();
          const unresolved_over_24h = (Date.now() - created) > 24 * 60 * 60 * 1000;
          let actionRequiredBy = 'Contractor';
          if (req.user.role === 'client' || req.user.role === 'admin') actionRequiredBy = 'Contractor';
          else if (req.user.role === 'contractor') actionRequiredBy = sourceTier === 'subcontractor' ? 'Subcontractor' : 'Professional';
          else if (req.user.role === 'subcontractor') actionRequiredBy = 'Professional';
          issues.push({
            severity: 'red',
            issue_type: 'dar_unsatisfied',
            description: `Missing: ${darMissing.join(', ')}`,
            worker_id: a.worker_id,
            worker_name: a.worker_name,
            project_id: pid,
            project_title: project.title,
            source_entity_id: a.assigned_by,
            source_entity_name: a.source_entity_name || 'Unknown',
            source_tier: sourceTier,
            assignment_id: a.assignment_id,
            escalated_to_contractor: true,
            escalated_to_client: true,
            unresolved_over_24h,
            action_required_by: actionRequiredBy,
          });
        }

        const credentials = db.prepare('SELECT title, expiry_date FROM credentials WHERE worker_id = ?').all(a.worker_id);
        for (const c of credentials) {
          if (!c.expiry_date) continue;
          const check = mockSafePassCheck(c.expiry_date);
          if (check.color === 'red') {
            const created = new Date(a.created_at).getTime();
            const unresolved_over_24h = (Date.now() - created) > 24 * 60 * 60 * 1000;
            let actionRequiredBy = 'Contractor';
            if (req.user.role === 'client' || req.user.role === 'admin') actionRequiredBy = 'Contractor';
            else if (req.user.role === 'contractor') actionRequiredBy = sourceTier === 'subcontractor' ? 'Subcontractor' : 'Professional';
            else if (req.user.role === 'subcontractor') actionRequiredBy = 'Professional';
            issues.push({
              severity: 'red',
              issue_type: 'credential_expired',
              description: `${c.title} expired`,
              worker_id: a.worker_id,
              worker_name: a.worker_name,
              project_id: pid,
              project_title: project.title,
              source_entity_id: a.assigned_by,
              source_entity_name: a.source_entity_name || 'Unknown',
              source_tier: sourceTier,
              assignment_id: a.assignment_id,
              escalated_to_contractor: true,
              escalated_to_client: true,
              unresolved_over_24h,
              action_required_by: actionRequiredBy,
            });
            break;
          }
        }
      }
    }

    return apiResponse(res, 200, { issues, by_project: project_id ? undefined : undefined }, 'Escalated compliance issues');
  } catch (error) {
    console.error('Escalated compliance error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/compliance/reports - Generate compliance report
 */
router.get('/reports', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const { project_id } = req.query;

    let report = {
      generatedAt: new Date().toISOString(),
      generatedBy: `${req.user.first_name} ${req.user.last_name}`,
      sections: []
    };

    // Overall compliance summary
    const allAssignments = db.prepare(`
      SELECT pa.*, u.first_name, u.last_name, u.nationality, p.title as project_title
      FROM project_assignments pa
      JOIN users u ON u.id = pa.worker_id
      JOIN projects p ON p.id = pa.project_id
      ${project_id ? 'WHERE pa.project_id = ?' : ''}
    `).all(...(project_id ? [project_id] : []));

    report.sections.push({
      title: 'Workforce Overview',
      data: {
        totalAssignments: allAssignments.length,
        activeWorkers: allAssignments.filter(a => a.status === 'active').length,
        endorsedWorkers: allAssignments.filter(a => a.endorsement_status === 'endorsed').length,
        pendingApprovals: allAssignments.filter(a => a.status === 'pending').length
      }
    });

    return apiResponse(res, 200, report, 'Compliance report generated');
  } catch (error) {
    console.error('Report generation error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
