/**
 * PoC-only: reset SQLite DB to fresh seed state (re-runs mockData.js).
 * Guarded by DEMO_RESET_ENABLED and/or non-production, plus allowlisted emails.
 */
const path = require('path');
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { apiResponse } = require('../utils/helpers');

const router = express.Router();

const DEFAULT_ALLOWED = [
  'sean.murphy@email.ie',
  'client@hyperdc.co',
  'contractor@buildright.ie',
  'sub@elecspec.ie',
  'sub@sticksandplanks.ie',
];

function parseAllowedEmails() {
  const raw = process.env.DEMO_RESET_EMAILS;
  if (!raw || !String(raw).trim()) return new Set(DEFAULT_ALLOWED);
  return new Set(
    String(raw)
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isDemoResetGloballyEnabled() {
  if (process.env.DEMO_RESET_ENABLED === 'true') return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

/**
 * POST /api/demo/reset-database
 * Re-seeds the database (all users get new IDs; existing JWTs become invalid — sign in again).
 */
router.post('/reset-database', authenticate, (req, res) => {
  try {
    if (!isDemoResetGloballyEnabled()) {
      return apiResponse(res, 403, null, 'Demo reset is disabled. Set DEMO_RESET_ENABLED=true on the server to enable.');
    }

    const email = (req.user.email || '').toLowerCase();
    const allowed = parseAllowedEmails();
    if (!allowed.has(email)) {
      return apiResponse(res, 403, null, 'Your account is not allowed to reset the demo database.');
    }

    const seedPath = path.join(__dirname, '..', 'seed', 'mockData.js');
    delete require.cache[require.resolve(seedPath)];
    require(seedPath);

    console.log(`[demo] Database re-seeded by ${email}`);
    return apiResponse(res, 200, { reset: true }, 'Database reset to seed state. Sign in again with the same demo accounts.');
  } catch (error) {
    console.error('Demo reset error:', error);
    return apiResponse(res, 500, null, error.message || 'Reset failed');
  }
});

module.exports = router;
