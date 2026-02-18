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

    // Enrich with credential status
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

      return {
        ...worker,
        credentialCount: credentials.length,
        badgeCount: badges.count,
        complianceStatus,
        issues
      };
    });

    return apiResponse(res, 200, enrichedWorkers, 'Professional compliance data');
  } catch (error) {
    console.error('Professional compliance error:', error);
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
