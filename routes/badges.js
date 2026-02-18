const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const MockBlockchain = require('../utils/blockchain');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /api/badges - Get badges for a worker
 */
router.get('/', authenticate, (req, res) => {
  try {
    const workerId = req.query.worker_id || req.user.id;

    const badges = db.prepare(`
      SELECT b.*, u.first_name as issuer_first_name, u.last_name as issuer_last_name,
        p.title as project_title
      FROM badges b
      LEFT JOIN users u ON u.id = b.issued_by
      LEFT JOIN projects p ON p.id = b.project_id
      WHERE b.worker_id = ?
      ORDER BY b.created_at DESC
    `).all(workerId);

    return apiResponse(res, 200, badges, 'Badges retrieved');
  } catch (error) {
    console.error('Get badges error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/badges - Issue a badge (QR-based or manual)
 */
router.post('/', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { worker_id, type, title, description, project_id } = req.body;

    if (!worker_id || !type || !title) {
      return apiResponse(res, 400, null, 'worker_id, type, and title required');
    }

    const worker = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(worker_id, 'worker');
    if (!worker) return apiResponse(res, 404, null, 'Professional not found');

    // Create badge VC
    const vcResult = MockBlockchain.createVC(
      'BadgeCredential',
      { id: worker.id, did: worker.did },
      { id: req.user.id, did: req.user.did, name: `${req.user.first_name} ${req.user.last_name}` },
      { badgeType: type, title, description }
    );

    const id = uuidv4();
    db.prepare(`
      INSERT INTO badges (id, worker_id, type, title, description, issued_by, project_id, vc_hash, blockchain_tx)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, worker_id, type, title, description, req.user.id, project_id, vcResult.vcHash, vcResult.blockchainTx);

    // Also issue a token reward
    const tokenId = uuidv4();
    db.prepare(`
      INSERT INTO tokens (id, worker_id, type, title, value, issued_by, project_id)
      VALUES (?, ?, 'badge_reward', ?, 1, ?, ?)
    `).run(tokenId, worker_id, `Reward for: ${title}`, req.user.id, project_id || null);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'badge_issued', 'badge', id,
      JSON.stringify({ workerId: worker_id, type, title }),
      vcResult.blockchainTx, vcResult.vcHash);

    const badge = db.prepare('SELECT * FROM badges WHERE id = ?').get(id);
    return apiResponse(res, 201, badge, 'Badge issued successfully');
  } catch (error) {
    console.error('Issue badge error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/badges/qr-issue - Issue badge via QR code scan
 */
router.post('/qr-issue', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    const { worker_did, type, title, description, project_id } = req.body;

    if (!worker_did || !type || !title) {
      return apiResponse(res, 400, null, 'worker_did, type, and title required');
    }

    // Look up worker by DID (from QR code)
    const worker = db.prepare('SELECT * FROM users WHERE did = ?').get(worker_did);
    if (!worker) return apiResponse(res, 404, null, 'Professional not found for this DID');

    // Create badge VC
    const vcResult = MockBlockchain.createVC(
      'BadgeCredential',
      { id: worker.id, did: worker.did },
      { id: req.user.id, did: req.user.did, name: `${req.user.first_name} ${req.user.last_name}` },
      { badgeType: type, title, description, issuedViaQR: true }
    );

    const id = uuidv4();
    db.prepare(`
      INSERT INTO badges (id, worker_id, type, title, description, issued_by, project_id, vc_hash, blockchain_tx)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, worker.id, type, title, description, req.user.id, project_id, vcResult.vcHash, vcResult.blockchainTx);

    // Token reward
    const tokenId = uuidv4();
    db.prepare(`
      INSERT INTO tokens (id, worker_id, type, title, value, issued_by, project_id)
      VALUES (?, ?, 'badge_reward', ?, 1, ?, ?)
    `).run(tokenId, worker.id, `Reward for: ${title}`, req.user.id, project_id || null);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'badge_issued_qr', 'badge', id,
      JSON.stringify({ workerId: worker.id, type, title, qrBased: true }),
      vcResult.blockchainTx, vcResult.vcHash);

    return apiResponse(res, 201, { badge: db.prepare('SELECT * FROM badges WHERE id = ?').get(id), worker: { id: worker.id, name: `${worker.first_name} ${worker.last_name}` } }, 'Badge issued via QR');
  } catch (error) {
    console.error('QR badge issue error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/awards - Get awards for a worker
 */
router.get('/awards', authenticate, (req, res) => {
  try {
    const workerId = req.query.worker_id || req.user.id;

    const awards = db.prepare(`
      SELECT a.*, u.first_name as issuer_first_name, u.last_name as issuer_last_name,
        p.title as project_title
      FROM awards a
      LEFT JOIN users u ON u.id = a.issued_by
      LEFT JOIN projects p ON p.id = a.project_id
      WHERE a.worker_id = ?
      ORDER BY a.created_at DESC
    `).all(workerId);

    return apiResponse(res, 200, awards, 'Awards retrieved');
  } catch (error) {
    console.error('Get awards error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/badges/awards - Issue an award
 */
router.post('/awards', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const { worker_id, type, title, description, project_id } = req.body;

    if (!worker_id || !type || !title) {
      return apiResponse(res, 400, null, 'worker_id, type, and title required');
    }

    const worker = db.prepare('SELECT * FROM users WHERE id = ?').get(worker_id);
    if (!worker) return apiResponse(res, 404, null, 'Professional not found');

    const vcResult = MockBlockchain.createVC(
      'AwardCredential',
      { id: worker.id, did: worker.did },
      { id: req.user.id, did: req.user.did, name: `${req.user.first_name} ${req.user.last_name}` },
      { awardType: type, title, description }
    );

    const id = uuidv4();
    db.prepare(`
      INSERT INTO awards (id, worker_id, type, title, description, issued_by, project_id, vc_hash, blockchain_tx)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, worker_id, type, title, description, req.user.id, project_id, vcResult.vcHash, vcResult.blockchainTx);

    // Token reward (awards get more tokens)
    const tokenId = uuidv4();
    db.prepare(`
      INSERT INTO tokens (id, worker_id, type, title, value, issued_by, project_id)
      VALUES (?, ?, 'award_reward', ?, 5, ?, ?)
    `).run(tokenId, worker_id, `Award: ${title}`, req.user.id, project_id || null);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'award_issued', 'award', id,
      JSON.stringify({ workerId: worker_id, type, title }),
      vcResult.blockchainTx, vcResult.vcHash);

    return apiResponse(res, 201, db.prepare('SELECT * FROM awards WHERE id = ?').get(id), 'Award issued');
  } catch (error) {
    console.error('Issue award error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/badges/tokens - Get worker tokens
 */
router.get('/tokens', authenticate, (req, res) => {
  try {
    const workerId = req.query.worker_id || req.user.id;

    const tokens = db.prepare(`
      SELECT t.*, p.title as project_title
      FROM tokens t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.worker_id = ?
      ORDER BY t.created_at DESC
    `).all(workerId);
    const totalTokens = db.prepare('SELECT COALESCE(SUM(value), 0) as total FROM tokens WHERE worker_id = ? AND is_redeemed = 0').get(workerId);

    return apiResponse(res, 200, { tokens, totalAvailable: totalTokens.total }, 'Tokens retrieved');
  } catch (error) {
    console.error('Get tokens error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/badges/tokens/redeem - Redeem tokens
 */
router.post('/tokens/redeem', authenticate, requireRole('worker'), (req, res) => {
  try {
    const { token_ids, reward_type } = req.body;

    if (!token_ids || !token_ids.length) {
      return apiResponse(res, 400, null, 'Token IDs required');
    }

    const placeholders = token_ids.map(() => '?').join(',');
    db.prepare(`UPDATE tokens SET is_redeemed = 1, redeemed_at = datetime('now') WHERE id IN (${placeholders}) AND worker_id = ? AND is_redeemed = 0`)
      .run(...token_ids, req.user.id);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'tokens_redeemed', 'token', token_ids.join(','),
      JSON.stringify({ tokenIds: token_ids, rewardType: reward_type }));

    return apiResponse(res, 200, null, 'Tokens redeemed successfully');
  } catch (error) {
    console.error('Redeem tokens error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
