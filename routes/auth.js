const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { generateToken, authenticate, optionalAuth } = require('../middleware/auth');
const MockBlockchain = require('../utils/blockchain');
const { mockPassportOCR, mockBiometricCheck, mockRightToWorkCheck, apiResponse } = require('../utils/helpers');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user (worker, client, contractor, subcontractor)
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, role, first_name, last_name, phone, nationality, company_name, company_registration } = req.body;

    if (!email || !password || !role || !first_name || !last_name) {
      return apiResponse(res, 400, null, 'Missing required fields: email, password, role, first_name, last_name');
    }

    const validRoles = ['worker', 'client', 'contractor', 'subcontractor'];
    if (!validRoles.includes(role)) {
      return apiResponse(res, 400, null, `Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return apiResponse(res, 409, null, 'Email already registered');
    }

    const id = uuidv4();
    const password_hash = bcrypt.hashSync(password, 10);
    const did = MockBlockchain.createDID(id);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone, nationality, did, company_name, company_registration, passport_status, biometric_status, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', 0)
    `).run(id, email, password_hash, role, first_name, last_name, phone || null, nationality || null, did, company_name || null, company_registration || null);

    // Log audit
    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'user_registration', userId: id, role });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, id, 'user_registered', 'user', id, JSON.stringify({ role, email }), blockchainResult.transactionId, blockchainResult.dataHash);

    const token = generateToken({ id, email, role });

    return apiResponse(res, 201, {
      user: { id, email, role, first_name, last_name, did, company_name, is_verified: 0, passport_status: 'pending', biometric_status: 'pending' },
      token
    }, 'Registration successful');
  } catch (error) {
    console.error('Registration error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return apiResponse(res, 400, null, 'Email and password required');
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return apiResponse(res, 401, null, 'Invalid credentials');
    }

    if (!user.is_active) {
      return apiResponse(res, 403, null, 'Account is deactivated');
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return apiResponse(res, 401, null, 'Invalid credentials');
    }

    const token = generateToken(user);

    // Audit log
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, user.id, 'user_login', 'user', user.id, JSON.stringify({ email }));

    return apiResponse(res, 200, {
      user: {
        id: user.id, email: user.email, role: user.role,
        first_name: user.first_name, last_name: user.last_name,
        did: user.did, company_name: user.company_name,
        nationality: user.nationality, is_verified: user.is_verified,
        passport_status: user.passport_status,
        biometric_status: user.biometric_status,
        profile_photo_url: user.profile_photo_url
      },
      token
    }, 'Login successful');
  } catch (error) {
    console.error('Login error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/auth/me - Get current user profile
 */
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT id, email, role, first_name, last_name, phone, nationality, date_of_birth,
           did, profile_photo_url, company_name, company_registration,
           passport_status, biometric_status, is_verified, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  
  return apiResponse(res, 200, user, 'Profile retrieved');
});

/**
 * PUT /api/auth/profile - Update profile
 */
router.put('/profile', authenticate, (req, res) => {
  const { first_name, last_name, phone, nationality, date_of_birth } = req.body;
  
  db.prepare(`
    UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
    phone = COALESCE(?, phone), nationality = COALESCE(?, nationality),
    date_of_birth = COALESCE(?, date_of_birth), updated_at = datetime('now')
    WHERE id = ?
  `).run(first_name, last_name, phone, nationality, date_of_birth, req.user.id);

  return apiResponse(res, 200, null, 'Profile updated');
});

/**
 * POST /api/auth/verify-passport - Mock passport OCR
 */
router.post('/verify-passport', authenticate, (req, res) => {
  const { nationality } = req.body;
  const ocrResult = mockPassportOCR(nationality || 'Irish');
  
  // Tokenize passport number
  const tokenizedPassport = MockBlockchain.tokenize(ocrResult.data.passportNumber);
  db.prepare("UPDATE users SET passport_number_tokenized = ?, passport_status = 'pending' WHERE id = ?")
    .run(tokenizedPassport, req.user.id);

  // Audit
  const auditId = uuidv4();
  const blockchainResult = MockBlockchain.anchorData({ action: 'passport_verification', userId: req.user.id });
  db.prepare(`
    INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(auditId, req.user.id, 'passport_verified', 'user', req.user.id,
    JSON.stringify({ nationality, confidence: ocrResult.confidence }),
    blockchainResult.transactionId, blockchainResult.dataHash);

  return apiResponse(res, 200, ocrResult, 'Passport verified (mock)');
});

/**
 * POST /api/auth/verify-biometric - Mock biometric check
 */
router.post('/verify-biometric', authenticate, (req, res) => {
  const result = mockBiometricCheck();
  
  db.prepare("UPDATE users SET biometric_status = 'pending' WHERE id = ?").run(req.user.id);

  // Audit
  const auditId = uuidv4();
  const blockchainResult = MockBlockchain.anchorData({ action: 'biometric_verification', userId: req.user.id });
  db.prepare(`
    INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(auditId, req.user.id, 'biometric_verified', 'user', req.user.id,
    JSON.stringify(result), blockchainResult.transactionId, blockchainResult.dataHash);

  return apiResponse(res, 200, result, 'Biometric verification complete (mock)');
});

/**
 * POST /api/auth/right-to-work - Mock Right-to-Work check
 */
router.post('/right-to-work', optionalAuth, (req, res) => {
  const { nationality, country, first_name, last_name } = req.body;
  const result = mockRightToWorkCheck(nationality || 'Irish', country || 'Ireland');
  
  // Enrich with worker info
  result.worker_name = first_name && last_name ? `${first_name} ${last_name}` : undefined;
  result.work_permit = result.eligible ? 'EU Freedom of Movement' : 'Work Permit Required';
  result.expiry = result.eligible ? 'N/A (EU national)' : '2027-12-31';
  result.source = 'Mock RTW Check (PoC)';
  
  return apiResponse(res, 200, result, 'Right-to-Work check complete (mock)');
});

/**
 * POST /api/auth/complete-verification - Finalize verification (mock review → accepted)
 */
router.post('/complete-verification', authenticate, (req, res) => {
  const user = db.prepare('SELECT passport_status, biometric_status FROM users WHERE id = ?').get(req.user.id);

  if (!user || user.passport_status !== 'pending' || user.biometric_status !== 'pending') {
    return apiResponse(res, 400, null, 'Both passport and biometric must be submitted before completing verification');
  }

  db.prepare(`
    UPDATE users SET passport_status = 'accepted', biometric_status = 'accepted', is_verified = 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(req.user.id);

  // Audit
  const auditId = uuidv4();
  const blockchainResult = MockBlockchain.anchorData({ action: 'verification_completed', userId: req.user.id });
  db.prepare(`
    INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(auditId, req.user.id, 'verification_completed', 'user', req.user.id,
    JSON.stringify({ passport: 'accepted', biometric: 'accepted' }),
    blockchainResult.transactionId, blockchainResult.dataHash);

  return apiResponse(res, 200, { passport_status: 'accepted', biometric_status: 'accepted', is_verified: 1 }, 'Verification complete');
});

module.exports = router;
