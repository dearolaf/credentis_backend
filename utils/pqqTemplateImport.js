const { v4: uuidv4 } = require('uuid');

const toBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return ['true', 'yes', '1', 'y'].includes(s);
  }
  return false;
};

const normalizeTemplateBundle = (bundle = {}) => {
  const metadata = bundle.metadata || {};
  const sections = Array.isArray(bundle.sections) ? bundle.sections : [];
  const questions = Array.isArray(bundle.questions) ? bundle.questions : [];
  const expiryTracking = Array.isArray(bundle.expiry_tracking) ? bundle.expiry_tracking : [];
  const questionTypesRef = Array.isArray(bundle.question_types_reference) ? bundle.question_types_reference : [];
  const validationRulesRef = Array.isArray(bundle.validation_rules_reference) ? bundle.validation_rules_reference : [];

  if (!metadata.template_id || !metadata.template_name) {
    throw new Error('metadata.template_id and metadata.template_name are required');
  }

  return {
    metadata: {
      ...metadata,
      total_sections: metadata.total_sections || sections.length,
      total_questions: metadata.total_questions || questions.length,
      max_score: metadata.max_score ?? 100,
      pass_threshold: metadata.pass_threshold ?? 70,
      default_deadline_days: metadata.default_deadline_days ?? 14,
      status: metadata.status || 'active',
      created_date: metadata.created_date || new Date().toISOString().slice(0, 10),
      last_modified: metadata.last_modified || new Date().toISOString().slice(0, 10),
    },
    sections,
    questions,
    expiry_tracking: expiryTracking,
    question_types_reference: questionTypesRef,
    validation_rules_reference: validationRulesRef,
  };
};

const upsertTemplateBundle = (db, rawBundle = {}) => {
  const bundle = normalizeTemplateBundle(rawBundle);
  const { metadata, sections, questions, expiry_tracking, question_types_reference, validation_rules_reference } = bundle;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR REPLACE INTO pqq_templates (id, name, sections)
      VALUES (?, ?, ?)
    `).run(metadata.template_id, metadata.template_name, JSON.stringify(sections.map((s) => s.section_title)));

    db.prepare(`
      INSERT OR REPLACE INTO pqq_template_metadata
      (template_id, template_name, template_version, standard_alignment, project_type, min_project_value,
        total_sections, total_questions, max_score, pass_threshold, default_deadline_days, status, created_date, last_modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      metadata.template_id,
      metadata.template_name,
      metadata.template_version || null,
      metadata.standard_alignment || null,
      metadata.project_type || null,
      metadata.min_project_value || null,
      metadata.total_sections,
      metadata.total_questions,
      metadata.max_score,
      metadata.pass_threshold,
      metadata.default_deadline_days,
      metadata.status,
      metadata.created_date,
      metadata.last_modified
    );

    db.prepare('DELETE FROM pqq_template_sections WHERE template_id = ?').run(metadata.template_id);
    db.prepare('DELETE FROM pqq_template_questions WHERE template_id = ?').run(metadata.template_id);
    db.prepare('DELETE FROM pqq_expiry_tracking_config WHERE template_id = ?').run(metadata.template_id);

    const insertSection = db.prepare(`
      INSERT INTO pqq_template_sections (id, template_id, section_id, section_number, section_title, max_points, pass_threshold, scoring_type, display_order, description, calculation_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    sections.forEach((s, idx) => {
      insertSection.run(
        uuidv4(),
        metadata.template_id,
        s.section_id || `sec_${String(idx + 1).padStart(2, '0')}`,
        s.section_number ?? idx + 1,
        s.section_title,
        s.max_points ?? 0,
        s.pass_threshold ?? 0,
        s.scoring_type || 'scored',
        s.display_order ?? idx + 1,
        s.description || null,
        s.calculation_method || null,
        s.notes || null
      );
    });

    const insertQuestion = db.prepare(`
      INSERT INTO pqq_template_questions
      (id, template_id, question_id, section_id, question_number, question_text, question_type, data_type, required, points, validation_rule, validation_value, autofail_if_yes, apply_amber_if_yes, apply_bonus_if_no, apply_afr_red_days, apply_afr_amber_days, evidence_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    questions.forEach((q, idx) => {
      insertQuestion.run(
        uuidv4(),
        metadata.template_id,
        q.question_id || `q_${String(idx + 1).padStart(3, '0')}`,
        q.section_id,
        q.question_number || String(idx + 1),
        q.question_text,
        q.question_type || 'text_input',
        q.data_type || 'string',
        toBool(q.required) ? 1 : 0,
        Number(q.points || 0),
        q.validation_rule || 'none',
        q.validation_value != null ? String(q.validation_value) : null,
        toBool(q.autofail_if_yes) ? 1 : 0,
        toBool(q.apply_amber_if_yes) ? 1 : 0,
        toBool(q.apply_bonus_if_no) ? 1 : 0,
        q.apply_afr_red_days != null ? Number(q.apply_afr_red_days) : null,
        q.apply_afr_amber_days != null ? Number(q.apply_afr_amber_days) : null,
        q.evidence_required || null
      );
    });

    const insertExpiry = db.prepare(`
      INSERT INTO pqq_expiry_tracking_config (id, template_id, item_category, has_expiry, amber_alert_days, red_alert_days, escalation_logic, suspension_on_expiry)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    expiry_tracking.forEach((e) => {
      insertExpiry.run(
        uuidv4(),
        metadata.template_id,
        e.item_category,
        toBool(e.has_expiry) ? 1 : 0,
        e.amber_alert_days != null ? Number(e.amber_alert_days) : null,
        e.red_alert_days != null ? Number(e.red_alert_days) : null,
        e.escalation_logic || null,
        toBool(e.suspension_on_expiry) ? 1 : 0
      );
    });

    const insertType = db.prepare(`
      INSERT OR REPLACE INTO pqq_question_types_reference (question_type, description, ui_component, data_fields, validation_logic)
      VALUES (?, ?, ?, ?, ?)
    `);
    question_types_reference.forEach((r) => {
      insertType.run(r.question_type, r.description || null, r.ui_component || null, r.data_fields || null, r.validation_logic || null);
    });

    const insertRule = db.prepare(`
      INSERT OR REPLACE INTO pqq_validation_rules_reference (validation_rule, description, validation_value, pass_condition, alert_logic)
      VALUES (?, ?, ?, ?, ?)
    `);
    validation_rules_reference.forEach((r) => {
      insertRule.run(r.validation_rule, r.description || null, r.validation_value || null, r.pass_condition || null, r.alert_logic || null);
    });
  });

  tx();

  return {
    template_id: metadata.template_id,
    sections_imported: sections.length,
    questions_imported: questions.length,
    expiry_configs_imported: expiry_tracking.length,
  };
};

module.exports = {
  normalizeTemplateBundle,
  upsertTemplateBundle,
};

