const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const toSlug = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const parseNum = (v, fallback = null) => {
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseBool = (v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v || '').trim().toLowerCase();
  return ['yes', 'y', 'true', '1'].includes(s);
};

const rowsForSheet = (workbook, sheetName) => {
  if (!sheetName || !workbook.Sheets[sheetName]) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
};

const findSheet = (sheetNames, aliases) => {
  const lowered = sheetNames.map((n) => n.toLowerCase());
  for (const alias of aliases) {
    const idx = lowered.findIndex((n) => n.includes(alias.toLowerCase()));
    if (idx >= 0) return sheetNames[idx];
  }
  return null;
};

const parseMetadata = (rows, fallback = {}) => {
  if (!rows.length) {
    return {
      template_id: fallback.template_id || 'tpl-imported-pqq',
      template_name: fallback.template_name || 'Imported PQQ Template',
    };
  }

  if (rows[0].template_id || rows[0].template_name) {
    return {
      template_id: rows[0].template_id || fallback.template_id || 'tpl-imported-pqq',
      template_name: rows[0].template_name || fallback.template_name || 'Imported PQQ Template',
      template_version: rows[0].template_version || null,
      standard_alignment: rows[0].standard_alignment || null,
      project_type: rows[0].project_type || null,
      min_project_value: parseNum(rows[0].min_project_value, null),
      total_sections: parseNum(rows[0].total_sections, null),
      total_questions: parseNum(rows[0].total_questions, null),
      max_score: parseNum(rows[0].max_score, 100),
      pass_threshold: parseNum(rows[0].pass_threshold, 70),
      default_deadline_days: parseNum(rows[0].default_deadline_days, 14),
      status: rows[0].status || 'active',
      created_date: rows[0].created_date || null,
      last_modified: rows[0].last_modified || null,
    };
  }

  const kv = {};
  rows.forEach((r) => {
    const key = toSlug(r.key || r.field || r.name);
    if (key) kv[key] = r.value;
  });

  return {
    template_id: kv.template_id || fallback.template_id || 'tpl-imported-pqq',
    template_name: kv.template_name || fallback.template_name || 'Imported PQQ Template',
    template_version: kv.template_version || null,
    standard_alignment: kv.standard_alignment || null,
    project_type: kv.project_type || null,
    min_project_value: parseNum(kv.min_project_value, null),
    total_sections: parseNum(kv.total_sections, null),
    total_questions: parseNum(kv.total_questions, null),
    max_score: parseNum(kv.max_score, 100),
    pass_threshold: parseNum(kv.pass_threshold, 70),
    default_deadline_days: parseNum(kv.default_deadline_days, 14),
    status: kv.status || 'active',
    created_date: kv.created_date || null,
    last_modified: kv.last_modified || null,
  };
};

const parseSections = (rows) =>
  rows
    .filter((r) => (r.section_title || r.title || r.section || '').toString().trim())
    .map((r, idx) => ({
      section_id: r.section_id || toSlug(r.section_title || r.title || r.section) || `sec_${String(idx + 1).padStart(2, '0')}`,
      section_number: parseNum(r.section_number, idx + 1),
      section_title: r.section_title || r.title || r.section,
      max_points: parseNum(r.max_points, 0),
      pass_threshold: parseNum(r.pass_threshold, 0),
      scoring_type: r.scoring_type || 'scored',
      display_order: parseNum(r.display_order, idx + 1),
      description: r.description || null,
      calculation_method: r.calculation_method || null,
      notes: r.notes || null,
    }));

const parseQuestions = (rows) =>
  rows
    .filter((r) => (r.question_text || r.question || '').toString().trim())
    .map((r, idx) => ({
      question_id: r.question_id || `q_${String(idx + 1).padStart(3, '0')}`,
      section_id: r.section_id || toSlug(r.section || r.section_title),
      question_number: r.question_number || String(idx + 1),
      question_text: r.question_text || r.question,
      question_type: r.question_type || 'text_input',
      data_type: r.data_type || 'string',
      required: parseBool(r.required),
      points: parseNum(r.points, 0),
      validation_rule: r.validation_rule || 'none',
      validation_value: r.validation_value != null ? String(r.validation_value) : null,
      autofail_if_yes: parseBool(r.autofail_if_yes),
      apply_amber_if_yes: parseBool(r.apply_amber_if_yes),
      apply_bonus_if_no: parseBool(r.apply_bonus_if_no),
      apply_afr_red_days: parseNum(r.apply_afr_red_days, null),
      apply_afr_amber_days: parseNum(r.apply_afr_amber_days, null),
      evidence_required: r.evidence_required || null,
    }));

const parseExpiryTracking = (rows) =>
  rows
    .filter((r) => (r.item_category || r.category || '').toString().trim())
    .map((r) => ({
      item_category: r.item_category || r.category,
      has_expiry: parseBool(r.has_expiry),
      amber_alert_days: parseNum(r.amber_alert_days, null),
      red_alert_days: parseNum(r.red_alert_days, null),
      escalation_logic: r.escalation_logic || null,
      suspension_on_expiry: parseBool(r.suspension_on_expiry),
    }));

const parseReferenceRows = (rows, keyColumn, defaults = []) => {
  const parsed = rows
    .filter((r) => (r[keyColumn] || '').toString().trim())
    .map((r) => ({ ...r, [keyColumn]: String(r[keyColumn]).trim() }));
  return parsed.length ? parsed : defaults;
};

const defaultQuestionTypes = [
  { question_type: 'text_input', description: 'Single line text field', ui_component: 'input', data_fields: 'value:string', validation_logic: 'length' },
  { question_type: 'textarea', description: 'Multi-line text field', ui_component: 'textarea', data_fields: 'value:string', validation_logic: 'length' },
  { question_type: 'number_input', description: 'Numeric field', ui_component: 'input:number', data_fields: 'value:number', validation_logic: 'min/max' },
  { question_type: 'yes_no', description: 'Boolean yes/no', ui_component: 'select', data_fields: 'value:boolean', validation_logic: 'required' },
  { question_type: 'file_upload', description: 'File upload reference', ui_component: 'input:text', data_fields: 'file_ref', validation_logic: 'non-empty' },
];

const defaultValidationRules = [
  { validation_rule: 'none', description: 'No validation', validation_value: '', pass_condition: 'always', alert_logic: '' },
  { validation_rule: 'regex', description: 'Regex pattern', validation_value: 'pattern', pass_condition: 'matches', alert_logic: 'red' },
  { validation_rule: 'email_format', description: 'Email format', validation_value: '', pass_condition: 'valid email', alert_logic: 'red' },
  { validation_rule: 'min_value', description: 'Minimum value', validation_value: 'number', pass_condition: 'value >= threshold', alert_logic: 'red' },
  { validation_rule: 'max_value', description: 'Maximum value', validation_value: 'number', pass_condition: 'value <= threshold', alert_logic: 'red' },
  { validation_rule: 'pass_if_no', description: 'Pass when answer is No', validation_value: '', pass_condition: 'value=false', alert_logic: 'red if yes' },
];

const parseTemplateFromWorkbook = (workbook, overrides = {}) => {
  const names = workbook.SheetNames || [];

  const metadataRows = rowsForSheet(workbook, findSheet(names, ['metadata', 'template_meta']));
  const sectionsRows = rowsForSheet(workbook, findSheet(names, ['section']));
  const questionsRows = rowsForSheet(workbook, findSheet(names, ['question']));
  const expiryRows = rowsForSheet(workbook, findSheet(names, ['expiry']));
  const qTypeRows = rowsForSheet(workbook, findSheet(names, ['question_type', 'type_ref']));
  const ruleRows = rowsForSheet(workbook, findSheet(names, ['validation_rule', 'rules']));

  const metadata = parseMetadata(metadataRows, overrides);
  const sections = parseSections(sectionsRows);
  const questions = parseQuestions(questionsRows);
  const expiryTracking = parseExpiryTracking(expiryRows);
  const qTypeRef = parseReferenceRows(qTypeRows, 'question_type', defaultQuestionTypes);
  const ruleRef = parseReferenceRows(ruleRows, 'validation_rule', defaultValidationRules);

  return {
    metadata,
    sections,
    questions,
    expiry_tracking: expiryTracking,
    question_types_reference: qTypeRef,
    validation_rules_reference: ruleRef,
  };
};

const parseTemplateFromXlsxFile = (absolutePath, overrides = {}) => {
  const resolved = path.resolve(absolutePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`XLSX file not found: ${resolved}`);
  }
  const workbook = XLSX.readFile(resolved);
  return parseTemplateFromWorkbook(workbook, overrides);
};

const parseTemplateFromBase64 = (base64, overrides = {}) => {
  const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' });
  return parseTemplateFromWorkbook(workbook, overrides);
};

module.exports = {
  parseTemplateFromWorkbook,
  parseTemplateFromXlsxFile,
  parseTemplateFromBase64,
};

