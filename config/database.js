const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'credentis.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Users table (all roles)
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('worker', 'client', 'contractor', 'subcontractor', 'admin')),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    nationality TEXT,
    date_of_birth TEXT,
    passport_number_tokenized TEXT,
    did TEXT UNIQUE,
    profile_photo_url TEXT,
    company_name TEXT,
    company_registration TEXT,
    passport_status TEXT DEFAULT 'none' CHECK(passport_status IN ('none', 'pending', 'accepted', 'rejected')),
    biometric_status TEXT DEFAULT 'none' CHECK(biometric_status IN ('none', 'pending', 'accepted', 'rejected')),
    is_verified INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Verified Projects (VPs)
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    client_id TEXT NOT NULL,
    sector TEXT CHECK(sector IN ('construction', 'energy', 'infrastructure', 'manufacturing', 'other')),
    location TEXT,
    country TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
    compliance_requirements TEXT, -- JSON array
    privacy_settings TEXT, -- JSON object
    max_workers INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES users(id)
  );

  -- Project Delegations
  CREATE TABLE IF NOT EXISTS project_delegations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    delegator_id TEXT NOT NULL,
    delegatee_id TEXT NOT NULL,
    delegatee_role TEXT NOT NULL CHECK(delegatee_role IN ('contractor', 'subcontractor')),
    scope TEXT, -- JSON describing scope of delegation
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'revoked')),
    approved_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (delegator_id) REFERENCES users(id),
    FOREIGN KEY (delegatee_id) REFERENCES users(id)
  );

  -- Worker Project Assignments
  CREATE TABLE IF NOT EXISTS project_assignments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    role_on_project TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'active', 'completed', 'rejected', 'revoked')),
    endorsement_status TEXT DEFAULT 'none' CHECK(endorsement_status IN ('none', 'endorsed', 'revoked')),
    endorsed_by TEXT,
    endorsed_at TEXT,
    project_vc_hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id)
  );

  -- Credentials (VCs)
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    issuer TEXT,
    issue_date TEXT,
    expiry_date TEXT,
    status TEXT DEFAULT 'valid' CHECK(status IN ('valid', 'expired', 'revoked', 'pending')),
    data TEXT, -- JSON with credential details
    vc_hash TEXT,
    blockchain_tx TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (worker_id) REFERENCES users(id)
  );

  -- Badges
  CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    issued_by TEXT NOT NULL,
    project_id TEXT,
    vc_hash TEXT,
    blockchain_tx TEXT,
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (issued_by) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  -- Awards
  CREATE TABLE IF NOT EXISTS awards (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    issued_by TEXT NOT NULL,
    project_id TEXT,
    vc_hash TEXT,
    blockchain_tx TEXT,
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (issued_by) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  -- Tokens (redeemable rewards)
  CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    value INTEGER DEFAULT 1,
    is_redeemed INTEGER DEFAULT 0,
    redeemed_at TEXT,
    issued_by TEXT,
    project_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  -- Consent Records
  CREATE TABLE IF NOT EXISTS consent_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    requester_id TEXT,
    data_type TEXT NOT NULL,
    purpose TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'granted', 'denied', 'revoked')),
    granted_at TEXT,
    revoked_at TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- PQQ (Pre-Qualification Questionnaire)
  CREATE TABLE IF NOT EXISTS pqq_submissions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    project_id TEXT,
    submitted_by TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'under_review', 'approved', 'rejected', 'expired')),
    company_profile TEXT, -- JSON
    financial_status TEXT, -- JSON  
    compliance_status TEXT, -- JSON
    documents TEXT, -- JSON array of document refs
    reviewed_by TEXT,
    review_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES users(id),
    FOREIGN KEY (submitted_by) REFERENCES users(id)
  );

  -- Audit Log (blockchain-anchored)
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT, -- JSON
    ip_address TEXT,
    blockchain_tx TEXT,
    hash TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (actor_id) REFERENCES users(id)
  );

  -- Data Access Requests
  CREATE TABLE IF NOT EXISTS data_access_requests (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    data_fields TEXT, -- JSON array of requested fields
    purpose TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    responded_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (requester_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
  );
`);

module.exports = db;
