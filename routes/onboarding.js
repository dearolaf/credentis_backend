const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const MockBlockchain = require('../utils/blockchain');
const { mockPQQCheck, apiResponse } = require('../utils/helpers');
const { upsertTemplateBundle } = require('../utils/pqqTemplateImport');
const { parseTemplateFromXlsxFile, parseTemplateFromBase64 } = require('../utils/pqqTemplateXlsx');

const router = express.Router();

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return ['true', 'yes', '1', 'y'].includes(s);
  }
  return false;
};

const toNumber = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const applyValidationRule = (value, rule, ruleValue) => {
  if (!rule || rule === 'none') return true;
  const textValue = value == null ? '' : String(value);
  const numValue = toNumber(value);

  switch (rule) {
    case 'regex': {
      try {
        return new RegExp(String(ruleValue || '')).test(textValue);
      } catch (_) {
        return true;
      }
    }
    case 'email_format':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue);
    case 'min_value': {
      const min = toNumber(ruleValue);
      return numValue != null && min != null ? numValue >= min : true;
    }
    case 'max_value': {
      const max = toNumber(ruleValue);
      return numValue != null && max != null ? numValue <= max : true;
    }
    case 'min_coverage': {
      const minCoverage = toNumber(ruleValue);
      const coverage = typeof value === 'object' && value ? toNumber(value.coverage) : numValue;
      return coverage != null && minCoverage != null ? coverage >= minCoverage : true;
    }
    case 'pass_if_no':
      return !toBool(value);
    default:
      return true;
  }
};

const evaluatePQQ = (templateMeta, sections, questions, answers) => {
  const sectionsById = Object.fromEntries(sections.map((s) => [s.section_id, s]));
  const grouped = {};
  questions.forEach((q) => {
    grouped[q.section_id] = grouped[q.section_id] || [];
    grouped[q.section_id].push(q);
  });

  const sectionResults = [];
  let totalScore = 0;
  let hardFail = false;
  const failures = [];

  for (const section of sections) {
    const qs = grouped[section.section_id] || [];
    let sectionScore = 0;
    let sectionAutoFail = false;
    let requiredMissing = false;
    const questionResults = [];

    for (const q of qs) {
      const rawValue = answers?.[q.question_id];
      const answered = rawValue != null && String(rawValue).trim() !== '';
      const required = toBool(q.required);
      const isMissing = required && !answered;
      if (isMissing) requiredMissing = true;

      const valid = answered ? applyValidationRule(rawValue, q.validation_rule, q.validation_value) : !required;
      if (toBool(q.autofail_if_yes) && toBool(rawValue)) sectionAutoFail = true;
      if (q.validation_rule === 'pass_if_no' && answered && toBool(rawValue)) sectionAutoFail = true;

      let awarded = 0;
      if (valid && answered) {
        const pts = Number(q.points || 0);
        if (toBool(q.apply_bonus_if_no)) {
          awarded = !toBool(rawValue) ? pts : 0;
        } else {
          awarded = pts;
        }
      }
      sectionScore += awarded;
      questionResults.push({
        question_id: q.question_id,
        valid,
        answered,
        required_missing: isMissing,
        points_awarded: awarded,
      });
    }

    const threshold = Number(section.pass_threshold || 0);
    let sectionPassed = true;
    if (section.scoring_type === 'pass_fail') {
      sectionPassed = !sectionAutoFail && !requiredMissing;
    } else {
      sectionPassed = !sectionAutoFail && !requiredMissing && sectionScore >= threshold;
      totalScore += sectionScore;
    }

    if (!sectionPassed && section.scoring_type === 'pass_fail') hardFail = true;
    if (!sectionPassed) {
      failures.push({ section_id: section.section_id, section_title: section.section_title });
    }

    sectionResults.push({
      section_id: section.section_id,
      section_title: section.section_title,
      scoring_type: section.scoring_type,
      score: Number(sectionScore.toFixed(2)),
      threshold,
      passed: sectionPassed,
      required_missing: requiredMissing,
      auto_fail: sectionAutoFail,
      questions: questionResults,
    });
  }

  const passThreshold = Number(templateMeta?.pass_threshold || 70);
  let overall_status = 'fail';
  if (!hardFail && totalScore >= passThreshold) overall_status = 'pass';
  else if (!hardFail && totalScore >= 60) overall_status = 'amber';

  return {
    total_score: Number(totalScore.toFixed(2)),
    pass_threshold: passThreshold,
    hard_fail: hardFail,
    overall_status,
    section_scores: sectionResults,
    failures,
  };
};

const writeTemplateImportAudit = (actorId, templateId, source, extra = {}) => {
  const auditId = uuidv4();
  const blockchainResult = MockBlockchain.anchorData({
    action: 'pqq_template_imported',
    templateId,
    source,
    ...extra,
  });
  db.prepare(`
    INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    auditId,
    actorId,
    'pqq_template_imported',
    'pqq_template',
    templateId,
    JSON.stringify({ source, ...extra }),
    blockchainResult.transactionId,
    blockchainResult.dataHash
  );
};

/**
 * GET /api/onboarding/partners - List partners / prospective partners
 */
router.get('/partners', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const partners = db.prepare(`
      SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.company_name, u.company_registration, u.is_verified, u.created_at,
        (SELECT COUNT(*) FROM project_delegations pd WHERE pd.delegatee_id = u.id AND pd.status = 'approved') as active_delegations,
        (SELECT pq.status FROM pqq_submissions pq WHERE pq.company_id = u.id ORDER BY pq.created_at DESC LIMIT 1) as latest_pqq_status
      FROM users u
      WHERE u.role IN ('contractor', 'subcontractor')
      ORDER BY u.company_name
    `).all();

    return apiResponse(res, 200, partners, 'Partners retrieved');
  } catch (error) {
    console.error('Get partners error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/templates - List PQQ templates
 */
router.get('/templates', authenticate, (req, res) => {
  try {
    const templates = db.prepare(`
      SELECT
        t.id,
        COALESCE(m.template_name, t.name) as name,
        t.sections,
        m.template_version,
        m.standard_alignment,
        m.project_type,
        m.total_sections,
        m.total_questions,
        m.max_score,
        m.pass_threshold,
        m.default_deadline_days,
        m.status
      FROM pqq_templates t
      LEFT JOIN pqq_template_metadata m ON m.template_id = t.id
      ORDER BY name
    `).all();
    return apiResponse(res, 200, templates, 'PQQ templates retrieved');
  } catch (error) {
    console.error('Get templates error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/templates/:id - Full PQQ template details
 */
router.get('/templates/:id', authenticate, (req, res, next) => {
  try {
    if (req.params.id === 'import-history') return next();
    const template = db.prepare(`
      SELECT t.id, t.name, t.sections,
        m.template_version, m.standard_alignment, m.project_type, m.min_project_value,
        m.total_sections, m.total_questions, m.max_score, m.pass_threshold,
        m.default_deadline_days, m.status, m.created_date, m.last_modified
      FROM pqq_templates t
      LEFT JOIN pqq_template_metadata m ON m.template_id = t.id
      WHERE t.id = ?
    `).get(req.params.id);
    if (!template) return apiResponse(res, 404, null, 'Template not found');

    const sections = db.prepare(`
      SELECT section_id, section_number, section_title, max_points, pass_threshold, scoring_type, display_order, description, calculation_method, notes
      FROM pqq_template_sections
      WHERE template_id = ?
      ORDER BY display_order, section_number
    `).all(req.params.id);

    const questions = db.prepare(`
      SELECT question_id, section_id, question_number, question_text, question_type, data_type, required, points,
        validation_rule, validation_value, autofail_if_yes, apply_amber_if_yes, apply_bonus_if_no,
        apply_afr_red_days, apply_afr_amber_days, evidence_required
      FROM pqq_template_questions
      WHERE template_id = ?
      ORDER BY section_id, question_number
    `).all(req.params.id);

    const expiryTracking = db.prepare(`
      SELECT item_category, has_expiry, amber_alert_days, red_alert_days, escalation_logic, suspension_on_expiry
      FROM pqq_expiry_tracking_config
      WHERE template_id = ?
    `).all(req.params.id);

    return apiResponse(res, 200, { template, sections, questions, expiry_tracking: expiryTracking }, 'PQQ template detail retrieved');
  } catch (error) {
    console.error('Get template detail error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/templates/import-history - recent template imports
 */
router.get('/templates/import-history', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        al.id,
        al.actor_id,
        al.entity_id AS template_id,
        al.details,
        al.created_at,
        u.first_name,
        u.last_name,
        u.email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.actor_id
      WHERE al.action = 'pqq_template_imported'
      ORDER BY al.created_at DESC
      LIMIT 20
    `).all();

    const data = rows.map((r) => {
      let details = {};
      try { details = JSON.parse(r.details || '{}'); } catch (_) {}
      return {
        id: r.id,
        template_id: r.template_id,
        source: details.source || 'unknown',
        sections_imported: details.sections_imported ?? null,
        questions_imported: details.questions_imported ?? null,
        imported_at: r.created_at,
        imported_by: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || 'Unknown user',
      };
    });

    return apiResponse(res, 200, data, 'Template import history retrieved');
  } catch (error) {
    console.error('Get template import history error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/onboarding/templates/import - Import PQQ template bundle
 */
router.post('/templates/import', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const result = upsertTemplateBundle(db, req.body || {});
    writeTemplateImportAudit(req.user.id, result.template_id, 'json_bundle', result);
    return apiResponse(res, 201, result, 'PQQ template imported');
  } catch (error) {
    console.error('Import template error:', error);
    return apiResponse(res, 500, null, error.message || 'Internal server error');
  }
});

/**
 * POST /api/onboarding/templates/import-xlsx - Import template from Excel workbook
 * Body: { file_path? , workbook_base64? , template_id?, template_name? }
 */
router.post('/templates/import-xlsx', authenticate, requireRole('client', 'admin'), (req, res) => {
  try {
    const { file_path, workbook_base64, template_id, template_name } = req.body || {};
    if (!file_path && !workbook_base64) {
      return apiResponse(res, 400, null, 'Provide file_path or workbook_base64');
    }

    const overrides = {
      template_id: template_id || undefined,
      template_name: template_name || undefined,
    };
    const bundle = workbook_base64
      ? parseTemplateFromBase64(workbook_base64, overrides)
      : parseTemplateFromXlsxFile(file_path, overrides);
    const result = upsertTemplateBundle(db, bundle);
    writeTemplateImportAudit(
      req.user.id,
      result.template_id,
      workbook_base64 ? 'workbook_base64' : 'file_path',
      {
        ...result,
        parsed_sections: bundle.sections.length,
        parsed_questions: bundle.questions.length,
      }
    );

    return apiResponse(res, 201, {
      ...result,
      source: workbook_base64 ? 'workbook_base64' : file_path,
      parsed_sections: bundle.sections.length,
      parsed_questions: bundle.questions.length,
    }, 'PQQ template imported from xlsx');
  } catch (error) {
    console.error('Import template xlsx error:', error);
    return apiResponse(res, 500, null, error.message || 'Internal server error');
  }
});

/**
 * POST /api/onboarding/invite-pqq - Invite partner to submit PQQ for a VP
 * Body: { project_id, invitee_id, pqq_template_id, due_days }
 */
router.post('/invite-pqq', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const { project_id, invitee_id, pqq_template_id, due_days } = req.body;
    if (!project_id || !invitee_id || !pqq_template_id || due_days == null) {
      return apiResponse(res, 400, null, 'project_id, invitee_id, pqq_template_id, and due_days required');
    }

    const project = db.prepare('SELECT id, client_id FROM projects WHERE id = ?').get(project_id);
    if (!project) return apiResponse(res, 404, null, 'Project not found');
    const invitee = db.prepare('SELECT id, role FROM users WHERE id = ?').get(invitee_id);
    if (!invitee || !['contractor', 'subcontractor'].includes(invitee.role)) {
      return apiResponse(res, 400, null, 'Invitee must be a contractor or subcontractor');
    }
    const template = db.prepare('SELECT id FROM pqq_templates WHERE id = ?').get(pqq_template_id);
    if (!template) return apiResponse(res, 404, null, 'PQQ template not found');

    // Client can invite anyone for their project; contractor can invite subs only for projects they're delegated to
    if (req.user.role === 'client' || req.user.role === 'admin') {
      if (project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Not your project');
    } else if (req.user.role === 'contractor') {
      const delegation = db.prepare('SELECT id FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?').get(project_id, req.user.id, 'approved');
      if (!delegation) return apiResponse(res, 403, null, 'You are not delegated to this project');
      if (invitee.role !== 'subcontractor') return apiResponse(res, 400, null, 'Contractors can only invite subcontractors');
    } else {
      return apiResponse(res, 403, null, 'Forbidden');
    }

    const existing = db.prepare('SELECT id FROM pqq_invitations WHERE project_id = ? AND invitee_id = ?').get(project_id, invitee_id);
    if (existing) return apiResponse(res, 409, null, 'Partner already invited to submit PQQ for this project');

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Number(due_days) || 14);
    const dueDateStr = dueDate.toISOString().slice(0, 10);

    const id = uuidv4();
    db.prepare(`
      INSERT INTO pqq_invitations (id, project_id, inviter_id, invitee_id, pqq_template_id, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'invited')
    `).run(id, project_id, req.user.id, invitee_id, pqq_template_id, dueDateStr);

    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'pqq_invited', invitationId: id, projectId: project_id, inviteeId: invitee_id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'pqq_invited', 'pqq_invitation', id, JSON.stringify({ project_id, invitee_id, due_date: dueDateStr }), blockchainResult.transactionId, blockchainResult.dataHash);

    const row = db.prepare(`
      SELECT pi.*, p.title as project_title, u.company_name as invitee_company
      FROM pqq_invitations pi
      JOIN projects p ON p.id = pi.project_id
      JOIN users u ON u.id = pi.invitee_id
      WHERE pi.id = ?
    `).get(id);
    const overdue = row.due_date < new Date().toISOString().slice(0, 10) && ['invited', 'submitted', 'under_review'].includes(row.status);
    return apiResponse(res, 201, { ...row, overdue }, 'Partner invited to submit PQQ');
  } catch (error) {
    console.error('Invite PQQ error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/invitations - List PQQ invitations (with Due, status, overdue)
 */
router.get('/invitations', authenticate, requireRole('client', 'contractor', 'subcontractor', 'admin'), (req, res) => {
  try {
    let list;
    const today = new Date().toISOString().slice(0, 10);
    if (req.user.role === 'client') {
      list = db.prepare(`
        SELECT pi.id, pi.project_id, pi.inviter_id, pi.invitee_id, pi.due_date, pi.status, pi.pqq_submission_id, pi.created_at,
          p.title as project_title,
          inv.company_name as inviter_company,
          u.company_name as invitee_company
        FROM pqq_invitations pi
        JOIN projects p ON p.id = pi.project_id
        JOIN users inv ON inv.id = pi.inviter_id
        JOIN users u ON u.id = pi.invitee_id
        WHERE p.client_id = ?
        ORDER BY pi.due_date ASC, pi.created_at DESC
      `).all(req.user.id);
    } else if (req.user.role === 'admin') {
      list = db.prepare(`
        SELECT pi.id, pi.project_id, pi.inviter_id, pi.invitee_id, pi.due_date, pi.status, pi.pqq_submission_id, pi.created_at,
          p.title as project_title,
          inv.company_name as inviter_company,
          u.company_name as invitee_company
        FROM pqq_invitations pi
        JOIN projects p ON p.id = pi.project_id
        JOIN users inv ON inv.id = pi.inviter_id
        JOIN users u ON u.id = pi.invitee_id
        ORDER BY pi.due_date ASC, pi.created_at DESC
      `).all();
    } else {
      list = db.prepare(`
        SELECT pi.id, pi.project_id, pi.inviter_id, pi.invitee_id, pi.due_date, pi.status, pi.pqq_submission_id, pi.created_at,
          p.title as project_title,
          inv.company_name as inviter_company,
          u.company_name as invitee_company
        FROM pqq_invitations pi
        JOIN projects p ON p.id = pi.project_id
        JOIN users inv ON inv.id = pi.inviter_id
        JOIN users u ON u.id = pi.invitee_id
        WHERE pi.inviter_id = ? OR pi.invitee_id = ?
        ORDER BY pi.due_date ASC, pi.created_at DESC
      `).all(req.user.id, req.user.id);
    }
    const withOverdue = list.map(r => ({ ...r, overdue: r.due_date < today && ['invited', 'submitted', 'under_review'].includes(r.status) }));
    return apiResponse(res, 200, withOverdue, 'Invitations retrieved');
  } catch (error) {
    console.error('Get invitations error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/invitations/:id - Get invitation details (with template id)
 */
router.get('/invitations/:id', authenticate, (req, res) => {
  try {
    const inv = db.prepare(`
      SELECT pi.*, p.title as project_title, p.client_id, u.company_name as invitee_company
      FROM pqq_invitations pi
      JOIN projects p ON p.id = pi.project_id
      JOIN users u ON u.id = pi.invitee_id
      WHERE pi.id = ?
    `).get(req.params.id);
    if (!inv) return apiResponse(res, 404, null, 'Invitation not found');
    if (![inv.invitee_id, inv.inviter_id, inv.client_id].includes(req.user.id) && req.user.role !== 'admin') {
      return apiResponse(res, 403, null, 'Forbidden');
    }
    return apiResponse(res, 200, inv, 'Invitation retrieved');
  } catch (error) {
    console.error('Get invitation detail error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/onboarding/invite - Invite a prospective partner (register new user)
 */
router.post('/invite', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const { email, role, company_name } = req.body;

    if (!email || !role || !company_name) {
      return apiResponse(res, 400, null, 'email, role, and company_name required');
    }

    // Check if already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return apiResponse(res, 409, null, 'User already registered');
    }

    // For PoC, create a placeholder user
    const id = uuidv4();
    const bcrypt = require('bcryptjs');
    const password_hash = bcrypt.hashSync('Welcome123!', 10);
    const did = MockBlockchain.createDID(id);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, role, first_name, last_name, company_name, did, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, email, password_hash, role, 'Invited', 'Partner', company_name, did);

    // Audit
    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'partner_invited', 'user', id, JSON.stringify({ email, role, company_name }));

    return apiResponse(res, 201, { id, email, role, company_name }, 'Partner invited');
  } catch (error) {
    console.error('Invite partner error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * POST /api/onboarding/pqq - Submit PQQ (partner side; requires invitation_id)
 */
router.post('/pqq', authenticate, requireRole('contractor', 'subcontractor'), (req, res) => {
  try {
    const { invitation_id, company_profile, documents, financial_status, compliance_status, additional_info, employee_count, references, answers } = req.body;

    if (!invitation_id) return apiResponse(res, 400, null, 'invitation_id required');

    const inv = db.prepare('SELECT id, project_id, invitee_id, status, pqq_template_id FROM pqq_invitations WHERE id = ?').get(invitation_id);
    if (!inv) return apiResponse(res, 404, null, 'Invitation not found');
    if (inv.invitee_id !== req.user.id) return apiResponse(res, 403, null, 'This invitation is not for you');
    if (inv.status !== 'invited') return apiResponse(res, 400, null, 'PQQ already submitted or processed for this invitation');

    const id = uuidv4();
    let financialData, complianceData;
    if (financial_status) {
      financialData = typeof financial_status === 'string' ? financial_status : JSON.stringify(financial_status);
      complianceData = typeof compliance_status === 'string' ? compliance_status : JSON.stringify(compliance_status || {});
    } else {
      const pqqResult = mockPQQCheck(company_profile);
      financialData = JSON.stringify(pqqResult.financialHealth);
      complianceData = JSON.stringify(pqqResult.complianceFlags);
    }

    const templateMeta = db.prepare(`
      SELECT m.*, t.id as template_id FROM pqq_templates t
      LEFT JOIN pqq_template_metadata m ON m.template_id = t.id
      WHERE t.id = ?
    `).get(inv.pqq_template_id);
    const templateSections = db.prepare(`
      SELECT section_id, section_title, pass_threshold, scoring_type, max_points
      FROM pqq_template_sections
      WHERE template_id = ?
      ORDER BY display_order, section_number
    `).all(inv.pqq_template_id);
    const templateQuestions = db.prepare(`
      SELECT question_id, section_id, question_text, question_type, required, points, validation_rule, validation_value, autofail_if_yes, apply_bonus_if_no
      FROM pqq_template_questions
      WHERE template_id = ?
      ORDER BY section_id, question_number
    `).all(inv.pqq_template_id);

    const providedAnswers = typeof answers === 'object' && answers ? answers : {};
    const scoreResult = templateQuestions.length > 0
      ? evaluatePQQ(templateMeta || {}, templateSections, templateQuestions, providedAnswers)
      : { total_score: 0, overall_status: 'amber', section_scores: [], failures: [] };

    db.prepare(`
      INSERT INTO pqq_submissions (id, invitation_id, company_id, project_id, submitted_by, status, company_profile, financial_status, compliance_status, answers_json, section_scores_json, total_score, overall_status, documents)
      VALUES (?, ?, ?, ?, ?, 'under_review', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, invitation_id, req.user.id, inv.project_id, req.user.id,
      JSON.stringify(company_profile || { additional_info, employee_count, references }),
      financialData, complianceData,
      JSON.stringify(providedAnswers),
      JSON.stringify(scoreResult.section_scores || []),
      scoreResult.total_score || 0,
      scoreResult.overall_status || null,
      JSON.stringify(documents || []));

    db.prepare(`
      UPDATE pqq_invitations SET status = 'under_review', pqq_submission_id = ?, updated_at = datetime('now') WHERE id = ?
    `).run(id, invitation_id);

    const auditId = uuidv4();
    const blockchainResult = MockBlockchain.anchorData({ action: 'pqq_submitted', pqqId: id });
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'pqq_submitted', 'pqq', id,
      JSON.stringify({ submittedBy: req.user.id, invitation_id }),
      blockchainResult.transactionId, blockchainResult.dataHash);

    return apiResponse(res, 201, {
      id,
      status: 'under_review',
      total_score: scoreResult.total_score || 0,
      overall_status: scoreResult.overall_status || null,
      failures: scoreResult.failures || [],
    }, 'PQQ submitted');
  } catch (error) {
    console.error('Submit PQQ error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/pqq - List PQQ submissions
 */
router.get('/pqq', authenticate, (req, res) => {
  try {
    let pqqs;
    if (req.user.role === 'client' || req.user.role === 'admin') {
      pqqs = db.prepare(`
        SELECT pq.*, u.company_name, u.first_name, u.last_name
        FROM pqq_submissions pq
        JOIN users u ON u.id = pq.company_id
        ORDER BY pq.created_at DESC
      `).all();
    } else {
      pqqs = db.prepare(`
        SELECT * FROM pqq_submissions WHERE company_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
    }

    return apiResponse(res, 200, pqqs, 'PQQ submissions retrieved');
  } catch (error) {
    console.error('Get PQQs error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * PUT /api/onboarding/pqq/:id/review - Review PQQ (client or contractor who invited)
 */
router.put('/pqq/:id/review', authenticate, requireRole('client', 'contractor', 'admin'), (req, res) => {
  try {
    const { status, review_notes } = req.body;
    const validStatuses = ['approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return apiResponse(res, 400, null, `Status must be: ${validStatuses.join(', ')}`);
    }

    const sub = db.prepare('SELECT id, invitation_id, project_id FROM pqq_submissions WHERE id = ?').get(req.params.id);
    if (!sub) return apiResponse(res, 404, null, 'PQQ submission not found');

    let canReview = false;
    if (req.user.role === 'admin') canReview = true;
    else if (sub.invitation_id) {
      const inv = db.prepare('SELECT inviter_id FROM pqq_invitations WHERE id = ?').get(sub.invitation_id);
      const project = db.prepare('SELECT client_id FROM projects WHERE id = ?').get(sub.project_id);
      if (inv && (inv.inviter_id === req.user.id || (project && project.client_id === req.user.id))) canReview = true;
    } else {
      const project = db.prepare('SELECT client_id FROM projects WHERE id = ?').get(sub.project_id);
      if (project && project.client_id === req.user.id) canReview = true;
    }
    if (!canReview) return apiResponse(res, 403, null, 'You cannot review this PQQ');

    db.prepare(`
      UPDATE pqq_submissions SET status = ?, reviewed_by = ?, review_notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, req.user.id, review_notes, req.params.id);

    if (sub.invitation_id) {
      db.prepare(`UPDATE pqq_invitations SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, sub.invitation_id);
    }

    const auditId = uuidv4();
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(auditId, req.user.id, 'pqq_reviewed', 'pqq', req.params.id, JSON.stringify({ status, review_notes }));

    return apiResponse(res, 200, null, `PQQ ${status}`);
  } catch (error) {
    console.error('Review PQQ error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/pqq/:id/expiry-alerts - Evaluate expiry alerts for a submission
 */
router.get('/pqq/:id/expiry-alerts', authenticate, (req, res) => {
  try {
    const submission = db.prepare(`
      SELECT pq.id, pq.company_id, pq.project_id, pq.answers_json, pi.pqq_template_id
      FROM pqq_submissions pq
      LEFT JOIN pqq_invitations pi ON pi.id = pq.invitation_id
      WHERE pq.id = ?
    `).get(req.params.id);
    if (!submission) return apiResponse(res, 404, null, 'PQQ submission not found');
    if (req.user.role !== 'admin' && req.user.id !== submission.company_id) {
      const project = db.prepare('SELECT client_id FROM projects WHERE id = ?').get(submission.project_id);
      if (!project || project.client_id !== req.user.id) return apiResponse(res, 403, null, 'Forbidden');
    }

    const answers = submission.answers_json ? JSON.parse(submission.answers_json) : {};
    const cfg = db.prepare(`
      SELECT item_category, amber_alert_days, red_alert_days, escalation_logic, suspension_on_expiry
      FROM pqq_expiry_tracking_config
      WHERE template_id = ?
    `).all(submission.pqq_template_id);

    const insuranceCfg = cfg.find((c) => c.item_category === 'insurance_policy');
    const alerts = [];
    if (insuranceCfg) {
      const today = new Date();
      Object.entries(answers).forEach(([qid, value]) => {
        if (value && typeof value === 'object' && value.expiry_date) {
          const expiry = new Date(value.expiry_date);
          const daysToExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
          let level = 'ok';
          if (insuranceCfg.red_alert_days != null && daysToExpiry <= Number(insuranceCfg.red_alert_days)) level = 'red';
          else if (insuranceCfg.amber_alert_days != null && daysToExpiry <= Number(insuranceCfg.amber_alert_days)) level = 'amber';
          alerts.push({
            question_id: qid,
            expiry_date: value.expiry_date,
            days_to_expiry: daysToExpiry,
            level,
            escalation_logic: insuranceCfg.escalation_logic,
            suspension_on_expiry: !!insuranceCfg.suspension_on_expiry,
          });
        }
      });
    }

    return apiResponse(res, 200, {
      submission_id: submission.id,
      alerts,
      suspend_recommended: alerts.some((a) => a.level === 'red' && a.suspension_on_expiry),
    }, 'PQQ expiry alerts evaluated');
  } catch (error) {
    console.error('PQQ expiry alerts error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

/**
 * GET /api/onboarding/tasks - Task queue for outstanding actions
 */
router.get('/tasks', authenticate, (req, res) => {
  try {
    const tasks = [];

    // Pending PQQ reviews (client or contractor who invited)
    if (['client', 'contractor', 'admin'].includes(req.user.role)) {
      let pendingPQQs;
      if (req.user.role === 'admin') {
        pendingPQQs = db.prepare("SELECT COUNT(*) as count FROM pqq_submissions WHERE status = 'under_review'").get();
      } else if (req.user.role === 'client') {
        pendingPQQs = db.prepare(`
          SELECT COUNT(*) as count FROM pqq_submissions pq
          JOIN pqq_invitations pi ON pi.pqq_submission_id = pq.id
          JOIN projects p ON p.id = pi.project_id
          WHERE pq.status = 'under_review' AND p.client_id = ?
        `).get(req.user.id);
      } else {
        pendingPQQs = db.prepare(`
          SELECT COUNT(*) as count FROM pqq_submissions pq
          JOIN pqq_invitations pi ON pi.pqq_submission_id = pq.id
          WHERE pq.status = 'under_review' AND pi.inviter_id = ?
        `).get(req.user.id);
      }
      if (pendingPQQs.count > 0) {
        tasks.push({ type: 'pqq_review', count: pendingPQQs.count, priority: 'high', label: 'PQQ submissions awaiting review' });
      }
    }

    // Pending delegations (for clients)
    if (['client', 'admin'].includes(req.user.role)) {
      const pendingDelegations = db.prepare("SELECT COUNT(*) as count FROM project_delegations WHERE status = 'pending'").get();
      if (pendingDelegations.count > 0) {
        tasks.push({ type: 'delegation_approval', count: pendingDelegations.count, priority: 'high', label: 'Delegations awaiting approval' });
      }
    }

    // Pending worker approvals
    if (['client', 'contractor', 'subcontractor'].includes(req.user.role)) {
      const pendingWorkers = db.prepare("SELECT COUNT(*) as count FROM project_assignments WHERE status = 'pending'").get();
      if (pendingWorkers.count > 0) {
        tasks.push({ type: 'worker_approval', count: pendingWorkers.count, priority: 'medium', label: 'Professional applications pending' });
      }
    }

    // Expiring credentials
    const expiringCreds = db.prepare(`
      SELECT COUNT(*) as count FROM credentials
      WHERE expiry_date IS NOT NULL AND expiry_date <= datetime('now', '+30 days') AND status = 'valid'
    `).get();
    if (expiringCreds.count > 0) {
      tasks.push({ type: 'credential_expiry', count: expiringCreds.count, priority: 'medium', label: 'Credentials expiring within 30 days' });
    }

    // Consent requests
    if (req.user.role === 'worker') {
      const pendingConsent = db.prepare("SELECT COUNT(*) as count FROM data_access_requests WHERE target_user_id = ? AND status = 'pending'").get(req.user.id);
      if (pendingConsent.count > 0) {
        tasks.push({ type: 'consent_request', count: pendingConsent.count, priority: 'high', label: 'Data access requests pending' });
      }
    }

    return apiResponse(res, 200, tasks, 'Task queue retrieved');
  } catch (error) {
    console.error('Get tasks error:', error);
    return apiResponse(res, 500, null, 'Internal server error');
  }
});

module.exports = router;
