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

const normalizeKey = (key) =>
  String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]+/g, '_')
    .replace(/[()]/g, '')
    .replace(/_+/g, '_');

const normalizeRowKeys = (row = {}) => {
  const out = {};
  Object.entries(row || {}).forEach(([k, v]) => {
    out[normalizeKey(k)] = v;
  });
  return out;
};

const pick = (row, aliases = [], fallback = null) => {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== '') {
      return row[key];
    }
  }
  return fallback;
};

const rowsForSheet = (workbook, sheetName) => {
  if (!sheetName || !workbook.Sheets[sheetName]) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }).map(normalizeRowKeys);
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

  const r0 = rows[0];
  if (pick(r0, ['template_id']) || pick(r0, ['template_name'])) {
    return {
      template_id: pick(r0, ['template_id']) || fallback.template_id || 'tpl-imported-pqq',
      template_name: pick(r0, ['template_name']) || fallback.template_name || 'Imported PQQ Template',
      template_version: pick(r0, ['template_version', 'version']) || null,
      standard_alignment: pick(r0, ['standard_alignment']) || null,
      project_type: pick(r0, ['project_type']) || null,
      min_project_value: parseNum(pick(r0, ['min_project_value']), null),
      total_sections: parseNum(pick(r0, ['total_sections']), null),
      total_questions: parseNum(pick(r0, ['total_questions']), null),
      max_score: parseNum(pick(r0, ['max_score']), 100),
      pass_threshold: parseNum(pick(r0, ['pass_threshold']), 70),
      default_deadline_days: parseNum(pick(r0, ['default_deadline_days']), 14),
      status: pick(r0, ['status']) || 'active',
      created_date: pick(r0, ['created_date']) || null,
      last_modified: pick(r0, ['last_modified']) || null,
    };
  }

  const kv = {};
  rows.forEach((r) => {
    const key = toSlug(pick(r, ['key', 'field', 'name']));
    if (key) kv[key] = pick(r, ['value']);
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
    .filter((r) => String(pick(r, ['section_title', 'title', 'section'], '')).trim())
    .map((r, idx) => ({
      section_id: pick(r, ['section_id']) || toSlug(pick(r, ['section_title', 'title', 'section'])) || `sec_${String(idx + 1).padStart(2, '0')}`,
      section_number: parseNum(pick(r, ['section_number', 'number']), idx + 1),
      section_title: pick(r, ['section_title', 'title', 'section']),
      max_points: parseNum(pick(r, ['max_points', 'max_score']), 0),
      pass_threshold: parseNum(pick(r, ['pass_threshold']), 0),
      scoring_type: pick(r, ['scoring_type']) || 'scored',
      display_order: parseNum(pick(r, ['display_order']), idx + 1),
      description: pick(r, ['description']) || null,
      calculation_method: pick(r, ['calculation_method']) || null,
      notes: pick(r, ['notes']) || null,
    }));

const parseQuestions = (rows) =>
  rows
    .filter((r) => String(pick(r, ['question_text', 'question'], '')).trim())
    .map((r, idx) => ({
      question_id: pick(r, ['question_id', 'id']) || `q_${String(idx + 1).padStart(3, '0')}`,
      section_id: pick(r, ['section_id']) || toSlug(pick(r, ['section', 'section_title'])),
      question_number: pick(r, ['question_number', 'number']) || String(idx + 1),
      question_text: pick(r, ['question_text', 'question']),
      question_type: pick(r, ['question_type']) || 'text_input',
      data_type: pick(r, ['data_type']) || 'string',
      required: parseBool(pick(r, ['required'], false)),
      points: parseNum(pick(r, ['points', 'score']), 0),
      validation_rule: pick(r, ['validation_rule']) || 'none',
      validation_value: pick(r, ['validation_value']) != null ? String(pick(r, ['validation_value'])) : null,
      autofail_if_yes: parseBool(pick(r, ['autofail_if_yes'], false)),
      apply_amber_if_yes: parseBool(pick(r, ['apply_amber_if_yes'], false)),
      apply_bonus_if_no: parseBool(pick(r, ['apply_bonus_if_no'], false)),
      apply_afr_red_days: parseNum(pick(r, ['apply_afr_red_days', 'afr_red_days', 'red_alert_days']), null),
      apply_afr_amber_days: parseNum(pick(r, ['apply_afr_amber_days', 'afr_amber_days', 'amber_alert_days']), null),
      evidence_required: pick(r, ['evidence_required']) || null,
    }));

const parseExpiryTracking = (rows) =>
  rows
    .filter((r) => String(pick(r, ['item_category', 'category'], '')).trim())
    .map((r) => ({
      item_category: pick(r, ['item_category', 'category']),
      has_expiry: parseBool(pick(r, ['has_expiry'], false)),
      amber_alert_days: parseNum(pick(r, ['amber_alert_days']), null),
      red_alert_days: parseNum(pick(r, ['red_alert_days']), null),
      escalation_logic: pick(r, ['escalation_logic']) || null,
      suspension_on_expiry: parseBool(pick(r, ['suspension_on_expiry'], false)),
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

