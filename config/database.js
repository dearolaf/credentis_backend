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
    pqq_template_id TEXT,
    pqq_due_days INTEGER,
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
    supporting_info TEXT,
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

  -- PQQ Templates (e.g. 14-section construction PQQ)
  CREATE TABLE IF NOT EXISTS pqq_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sections TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- PQQ template metadata (extended import model)
  CREATE TABLE IF NOT EXISTS pqq_template_metadata (
    template_id TEXT PRIMARY KEY,
    template_name TEXT NOT NULL,
    template_version TEXT,
    standard_alignment TEXT,
    project_type TEXT,
    min_project_value INTEGER,
    total_sections INTEGER,
    total_questions INTEGER,
    max_score INTEGER DEFAULT 100,
    pass_threshold INTEGER DEFAULT 70,
    default_deadline_days INTEGER DEFAULT 14,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'draft', 'archived')),
    created_date TEXT,
    last_modified TEXT,
    FOREIGN KEY (template_id) REFERENCES pqq_templates(id)
  );

  -- PQQ section configuration
  CREATE TABLE IF NOT EXISTS pqq_template_sections (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    section_number INTEGER NOT NULL,
    section_title TEXT NOT NULL,
    max_points INTEGER DEFAULT 0,
    pass_threshold INTEGER DEFAULT 0,
    scoring_type TEXT DEFAULT 'scored' CHECK(scoring_type IN ('scored', 'pass_fail')),
    display_order INTEGER DEFAULT 0,
    description TEXT,
    calculation_method TEXT,
    notes TEXT,
    FOREIGN KEY (template_id) REFERENCES pqq_templates(id)
  );

  -- Question type reference
  CREATE TABLE IF NOT EXISTS pqq_question_types_reference (
    question_type TEXT PRIMARY KEY,
    description TEXT,
    ui_component TEXT,
    data_fields TEXT,
    validation_logic TEXT
  );

  -- Validation rules reference
  CREATE TABLE IF NOT EXISTS pqq_validation_rules_reference (
    validation_rule TEXT PRIMARY KEY,
    description TEXT,
    validation_value TEXT,
    pass_condition TEXT,
    alert_logic TEXT
  );

  -- Expiry tracking configuration
  CREATE TABLE IF NOT EXISTS pqq_expiry_tracking_config (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    item_category TEXT NOT NULL,
    has_expiry INTEGER DEFAULT 1,
    amber_alert_days INTEGER,
    red_alert_days INTEGER,
    escalation_logic TEXT,
    suspension_on_expiry INTEGER DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES pqq_templates(id)
  );

  -- PQQ questions
  CREATE TABLE IF NOT EXISTS pqq_template_questions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    question_number TEXT,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL,
    data_type TEXT,
    required INTEGER DEFAULT 0,
    points REAL DEFAULT 0,
    validation_rule TEXT,
    validation_value TEXT,
    autofail_if_yes INTEGER DEFAULT 0,
    apply_amber_if_yes INTEGER DEFAULT 0,
    apply_bonus_if_no INTEGER DEFAULT 0,
    apply_afr_red_days INTEGER,
    apply_afr_amber_days INTEGER,
    evidence_required TEXT,
    FOREIGN KEY (template_id) REFERENCES pqq_templates(id)
  );

  -- PQQ Invitations (client/contractor invites partner to submit PQQ for a VP)
  CREATE TABLE IF NOT EXISTS pqq_invitations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invitee_id TEXT NOT NULL,
    pqq_template_id TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT DEFAULT 'invited' CHECK(status IN ('invited', 'submitted', 'under_review', 'approved', 'rejected')),
    pqq_submission_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (inviter_id) REFERENCES users(id),
    FOREIGN KEY (invitee_id) REFERENCES users(id),
    FOREIGN KEY (pqq_template_id) REFERENCES pqq_templates(id)
  );

  -- PQQ (Pre-Qualification Questionnaire)
  CREATE TABLE IF NOT EXISTS pqq_submissions (
    id TEXT PRIMARY KEY,
    invitation_id TEXT,
    company_id TEXT NOT NULL,
    project_id TEXT,
    submitted_by TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'under_review', 'approved', 'rejected', 'expired')),
    company_profile TEXT,
    financial_status TEXT,
    compliance_status TEXT,
    answers_json TEXT,
    section_scores_json TEXT,
    total_score REAL DEFAULT 0,
    overall_status TEXT,
    documents TEXT,
    reviewed_by TEXT,
    review_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (invitation_id) REFERENCES pqq_invitations(id),
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

  -- DAR (Data Access Request) – chain of authority: client → contractor → subcontractors
  CREATE TABLE IF NOT EXISTS project_dar_requirements (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    added_by_id TEXT NOT NULL,
    requirement_key TEXT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (added_by_id) REFERENCES users(id)
  );

  -- Worker satisfaction of DAR requirements (credentials submitted per requirement)
  CREATE TABLE IF NOT EXISTS worker_dar_satisfaction (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    dar_requirement_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'satisfied', 'rejected')),
    credential_id TEXT,
    credential_ids_json TEXT,
    submitted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(worker_id, dar_requirement_id),
    FOREIGN KEY (worker_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (dar_requirement_id) REFERENCES project_dar_requirements(id),
    FOREIGN KEY (credential_id) REFERENCES credentials(id)
  );
`);

// Migration: add invitation_id to pqq_submissions if table existed before
try {
  const cols = db.prepare("PRAGMA table_info(pqq_submissions)").all();
  if (cols.length && !cols.find(c => c.name === 'invitation_id')) {
    db.exec('ALTER TABLE pqq_submissions ADD COLUMN invitation_id TEXT');
  }
  if (cols.length && !cols.find(c => c.name === 'answers_json')) {
    db.exec('ALTER TABLE pqq_submissions ADD COLUMN answers_json TEXT');
  }
  if (cols.length && !cols.find(c => c.name === 'section_scores_json')) {
    db.exec('ALTER TABLE pqq_submissions ADD COLUMN section_scores_json TEXT');
  }
  if (cols.length && !cols.find(c => c.name === 'total_score')) {
    db.exec('ALTER TABLE pqq_submissions ADD COLUMN total_score REAL DEFAULT 0');
  }
  if (cols.length && !cols.find(c => c.name === 'overall_status')) {
    db.exec('ALTER TABLE pqq_submissions ADD COLUMN overall_status TEXT');
  }
} catch (_) {}
// Migration: add PQQ fields to projects if missing
try {
  let pcols = db.prepare("PRAGMA table_info(projects)").all();
  if (pcols.length && !pcols.find(c => c.name === 'pqq_template_id')) {
    db.exec('ALTER TABLE projects ADD COLUMN pqq_template_id TEXT');
  }
  pcols = db.prepare("PRAGMA table_info(projects)").all();
  if (pcols.length && !pcols.find(c => c.name === 'pqq_due_days')) {
    db.exec('ALTER TABLE projects ADD COLUMN pqq_due_days INTEGER');
  }
} catch (_) {}
// Migration: dar_requested_at on project_assignments (for "Send DAR to professional")
try {
  const pacols = db.prepare("PRAGMA table_info(project_assignments)").all();
  if (pacols.length && !pacols.find(c => c.name === 'dar_requested_at')) {
    db.exec('ALTER TABLE project_assignments ADD COLUMN dar_requested_at TEXT');
  }
} catch (_) {}
// Migration: multiple credentials per DAR satisfaction (e.g. professional + academic quals)
try {
  const wdCols = db.prepare('PRAGMA table_info(worker_dar_satisfaction)').all();
  if (wdCols.length && !wdCols.find((c) => c.name === 'credential_ids_json')) {
    db.exec('ALTER TABLE worker_dar_satisfaction ADD COLUMN credential_ids_json TEXT');
  }
} catch (_) {}
// Migration: supporting_info on project_assignments (application details from professional app)
try {
  const pacols = db.prepare("PRAGMA table_info(project_assignments)").all();
  if (pacols.length && !pacols.find(c => c.name === 'supporting_info')) {
    db.exec('ALTER TABLE project_assignments ADD COLUMN supporting_info TEXT');
  }
} catch (_) {}

module.exports = db;
