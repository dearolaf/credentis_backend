const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/audit - Get audit log entries
 */
router.get('/', authenticate, (req, res) => {
  try {
    const { entity_type, entity_id, actor_id, action, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT al.*, u.first_name as actor_first_name, u.last_name as actor_last_name, u.role as actor_role
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.actor_id
      WHERE 1=1
    `;
    let params = [];

    // Workers can only see their own audit trail
    if (req.user.role === 'worker') {
      query += ' AND al.actor_id = ?';
      params.push(req.user.id);
    }

    if (entity_type) {
      query += ' AND al.entity_type = ?';
      params.push(entity_type);
    }
    if (entity_id) {
      query += ' AND al.entity_id = ?';
      params.push(entity_id);
    }
    if (actor_id) {
      query += ' AND al.actor_id = ?';
      params.push(actor_id);
    }
    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const entries = db.prepare(query).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as count FROM audit_log ${req.user.role === 'worker' ? 'WHERE actor_id = ?' : ''}`).get(...(req.user.role === 'worker' ? [req.user.id] : []));

    // Enrich entries with project info for workers
    let enrichedEntries = entries;
    if (req.user.role === 'worker') {
      const assignments = db.prepare(`
        SELECT pa.project_id, p.title as project_title
        FROM project_assignments pa
        JOIN projects p ON p.id = pa.project_id
        WHERE pa.worker_id = ?
        ORDER BY pa.created_at DESC
      `).all(req.user.id);

      // Map project-related actions to projects; distribute others round-robin
      const projectActions = new Set([
        'project_created', 'project_delegated', 'worker_endorsed',
        'badge_issued', 'award_issued', 'credential_issued',
        'compliance_check', 'pqq_submitted'
      ]);
      const accountActions = new Set([
        'user_registered', 'user_login', 'passport_verified',
        'biometric_verified', 'consent_granted'
      ]);

      let idx = 0;
      enrichedEntries = entries.map(entry => {
        if (accountActions.has(entry.action)) {
          return { ...entry, project_id: null, project_title: 'Account & Identity' };
        }
        if (assignments.length > 0) {
          const assignment = assignments[idx % assignments.length];
          idx++;
          return { ...entry, project_id: assignment.project_id, project_title: assignment.project_title };
        }
        return { ...entry, project_id: null, project_title: null };
      });
    }

    return apiResponse(res, 200, { entries: enrichedEntries, total: total.count, limit: parseInt(limit), offset: parseInt(offset) }, 'Audit log retrieved');
  } catch (error) {
    console.error('Audit log error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/audit/stats - Audit statistics
 */
router.get('/stats', authenticate, (req, res) => {
  try {
    const actionCounts = db.prepare(`
      SELECT action, COUNT(*) as count FROM audit_log GROUP BY action ORDER BY count DESC
    `).all();

    const recentActivity = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM audit_log
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all();

    const blockchainAnchored = db.prepare(`
      SELECT COUNT(*) as count FROM audit_log WHERE blockchain_tx IS NOT NULL
    `).get();

    const total = db.prepare('SELECT COUNT(*) as count FROM audit_log').get();

    return apiResponse(res, 200, {
      actionCounts,
      recentActivity,
      blockchainAnchored: blockchainAnchored.count,
      totalEntries: total.count
    }, 'Audit statistics');
  } catch (error) {
    console.error('Audit stats error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
