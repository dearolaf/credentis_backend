const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const MockBlockchain = require('../utils/blockchain');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/consent - Get consent records for user
 */
router.get('/', authenticate, (req, res) => {
  try {
    const records = db.prepare(`
      SELECT cr.*, u.first_name as requester_first_name, u.last_name as requester_last_name, u.company_name as requester_company
      FROM consent_records cr
      LEFT JOIN users u ON u.id = cr.requester_id
      WHERE cr.user_id = ?
      ORDER BY cr.created_at DESC
    `).all(req.user.id);

    return apiResponse(res, 200, records, 'Consent records retrieved');
  } catch (error) {
    console.error('Get consent error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/consent/request - Request data access
 */
router.post('/request', authenticate, (req, res) => {
  try {
    const { target_user_id, data_fields, purpose } = req.body;

    if (!target_user_id || !data_fields) {
      return apiResponse(res, 400, null, 'target_user_id and data_fields required');
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO data_access_requests (id, requester_id, target_user_id, data_fields, purpose, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(id, req.user.id, target_user_id, JSON.stringify(data_fields), purpose);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'data_access_requested', 'data_access_request', id,
      JSON.stringify({ targetUserId: target_user_id, fields: data_fields }));

    return apiResponse(res, 201, { id, status: 'pending' }, 'Data access requested');
  } catch (error) {
    console.error('Request access error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/consent/request/:id - Respond to data access request
 */
router.put('/request/:id', authenticate, (req, res) => {
  try {
    const { status } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return apiResponse(res, 400, null, 'Status must be approved or rejected');
    }

    const request = db.prepare('SELECT * FROM data_access_requests WHERE id = ? AND target_user_id = ?').get(req.params.id, req.user.id);
    if (!request) return apiResponse(res, 404, null, 'Request not found');

    db.prepare("UPDATE data_access_requests SET status = ?, responded_at = datetime('now') WHERE id = ?").run(status, req.params.id);

    // Create consent record
    const consentId = uuidv4();
    db.prepare(`
      INSERT INTO consent_records (id, user_id, requester_id, data_type, purpose, status, granted_at)
      VALUES (?, ?, ?, ?, ?, ?, ${status === 'approved' ? "datetime('now')" : 'NULL'})
    `).run(consentId, req.user.id, request.requester_id, request.data_fields, request.purpose, status === 'approved' ? 'granted' : 'denied');

    // Audit (blockchain-anchored for GDPR)
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'consent_response', requestId: req.params.id, status });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, `consent_${status}`, 'consent', consentId,
      JSON.stringify({ requestId: req.params.id, status }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 200, null, `Request ${status}`);
  } catch (error) {
    console.error('Respond to request error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/consent/:id/revoke - Revoke consent
 */
router.put('/:id/revoke', authenticate, (req, res) => {
  try {
    const record = db.prepare('SELECT * FROM consent_records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!record) return apiResponse(res, 404, null, 'Consent record not found');

    db.prepare("UPDATE consent_records SET status = 'revoked', revoked_at = datetime('now') WHERE id = ?").run(req.params.id);

    // Audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'consent_revoked', consentId: req.params.id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'consent_revoked', 'consent', req.params.id,
      JSON.stringify({ revokedAt: new Date().toISOString() }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 200, null, 'Consent revoked');
  } catch (error) {
    console.error('Revoke consent error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/consent/access-requests - Get data access requests for user
 */
router.get('/access-requests', authenticate, (req, res) => {
  try {
    const requests = db.prepare(`
      SELECT dar.*, u.first_name as requester_first_name, u.last_name as requester_last_name, u.company_name
      FROM data_access_requests dar
      JOIN users u ON u.id = dar.requester_id
      WHERE dar.target_user_id = ?
      ORDER BY dar.created_at DESC
    `).all(req.user.id);

    return apiResponse(res, 200, requests, 'Access requests retrieved');
  } catch (error) {
    console.error('Get access requests error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
