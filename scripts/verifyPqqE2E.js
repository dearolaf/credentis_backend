const XLSX = require('xlsx');

const API = 'http://127.0.0.1:3000/api';

const clientCreds = { email: 'client@hyperdc.co', password: 'Password123!' };
const contractorCreds = { email: 'contractor@buildright.ie', password: 'Password123!' };

const request = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} failed: ${json.message || res.statusText}`);
  }
  return json;
};

const login = async ({ email, password }) => {
  const res = await request('/auth/login', { method: 'POST', body: { email, password } });
  return res.data.token;
};

const buildWorkbookBase64 = () => {
  const wb = XLSX.utils.book_new();

  const metadata = [
    {
      template_id: `tpl-e2e-${Date.now()}`,
      template_name: 'E2E Verification Template',
      template_version: '1.0',
      standard_alignment: 'PoC',
      project_type: 'Data Centre',
      total_sections: 2,
      total_questions: 4,
      max_score: 20,
      pass_threshold: 10,
      default_deadline_days: 14,
      status: 'active',
    },
  ];
  const sections = [
    { section_id: 'sec_01', section_number: 1, section_title: 'Eligibility', max_points: 0, pass_threshold: 0, scoring_type: 'pass_fail', display_order: 1 },
    { section_id: 'sec_02', section_number: 2, section_title: 'Capability', max_points: 20, pass_threshold: 10, scoring_type: 'scored', display_order: 2 },
  ];
  const questions = [
    { question_id: 'q_001', section_id: 'sec_01', question_number: 'Q1.1', question_text: 'Any convictions?', question_type: 'yes_no', required: 1, points: 0, validation_rule: 'pass_if_no' },
    { question_id: 'q_002', section_id: 'sec_02', question_number: 'Q2.1', question_text: 'Annual turnover', question_type: 'number_input', required: 1, points: 10, validation_rule: 'min_value', validation_value: '1000000' },
    { question_id: 'q_003', section_id: 'sec_02', question_number: 'Q2.2', question_text: 'Insurance', question_type: 'insurance_input', required: 1, points: 10, validation_rule: 'min_coverage', validation_value: '5000000' },
    { question_id: 'q_004', section_id: 'sec_02', question_number: 'Q2.3', question_text: 'Policy upload', question_type: 'file_upload', required: 1, points: 0, validation_rule: 'none' },
  ];
  const expiry = [
    { item_category: 'insurance_policy', has_expiry: 1, amber_alert_days: 60, red_alert_days: 30, escalation_logic: 'demo', suspension_on_expiry: 1 },
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metadata), 'metadata');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sections), 'sections');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(questions), 'questions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expiry), 'expiry_tracking');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer.toString('base64');
};

const makeAnswers = (questions) => {
  const answers = {};
  for (const q of questions) {
    if (q.question_type === 'yes_no') {
      answers[q.question_id] = false;
      continue;
    }
    if (q.question_type === 'number_input') {
      if (q.validation_rule === 'min_value') answers[q.question_id] = Number(q.validation_value || 1) + 1000;
      else if (q.validation_rule === 'max_value') answers[q.question_id] = Math.max(1, Number(q.validation_value || 2) - 1);
      else answers[q.question_id] = 1;
      continue;
    }
    if (q.question_type === 'insurance_input') {
      const coverage = q.validation_rule === 'min_coverage'
        ? Number(q.validation_value || 5000000) + 1000
        : 5000000;
      answers[q.question_id] = {
        policy_number: 'POL-E2E-001',
        coverage,
        expiry_date: '2027-12-31',
      };
      continue;
    }
    if ((q.question_type || '').startsWith('file_upload')) {
      answers[q.question_id] = 'mock-evidence.pdf';
      continue;
    }
    answers[q.question_id] = 'mock-answer';
  }
  return answers;
};

const run = async () => {
  console.log('1) Logging in...');
  const clientToken = await login(clientCreds);
  const contractorToken = await login(contractorCreds);

  console.log('2) Importing template from generated workbook...');
  const workbookBase64 = buildWorkbookBase64();
  const imported = await request('/onboarding/templates/import-xlsx', {
    method: 'POST',
    token: clientToken,
    body: { workbook_base64: workbookBase64 },
  });
  const templateId = imported.data.template_id;
  console.log(`   Imported template: ${templateId}`);

  console.log('3) Checking import history...');
  const history = await request('/onboarding/templates/import-history', { token: clientToken });
  const historyHit = (history.data || []).find((h) => h.template_id === templateId);
  if (!historyHit) throw new Error('Import history did not contain imported template');

  console.log('4) Loading template details...');
  const templateDetail = await request(`/onboarding/templates/${templateId}`, { token: clientToken });
  const questions = templateDetail.data.questions || [];
  if (!questions.length) throw new Error('Imported template has no questions');

  console.log('5) Creating invitation for contractor...');
  const projects = await request('/projects', { token: clientToken });
  const allProjects = projects.data || [];
  if (!allProjects.length) throw new Error('No project found for invitation');

  const users = await request('/onboarding/partners', { token: clientToken });
  const contractor = (users.data || []).find((u) => u.role === 'contractor' && u.email === contractorCreds.email);
  if (!contractor?.id) throw new Error('Contractor account not found');

  let invitation = null;
  for (const project of allProjects) {
    try {
      invitation = await request('/onboarding/invite-pqq', {
        method: 'POST',
        token: clientToken,
        body: {
          project_id: project.id,
          invitee_id: contractor.id,
          pqq_template_id: templateId,
          due_days: 14,
        },
      });
      break;
    } catch (_) {
      // try next project (some may already have invitation for this invitee)
    }
  }
  if (!invitation?.data?.id) throw new Error('Could not create fresh invitation for contractor on any project');

  const invitationId = invitation.data.id;
  console.log(`   Invitation id: ${invitationId}`);

  console.log('6) Submitting PQQ as contractor...');
  const answers = makeAnswers(questions);
  const submitted = await request('/onboarding/pqq', {
    method: 'POST',
    token: contractorToken,
    body: {
      invitation_id: invitationId,
      answers,
    },
  });
  if (submitted.data.total_score == null) throw new Error('Submission missing total_score');
  console.log(`   Submitted with score=${submitted.data.total_score}, status=${submitted.data.overall_status}`);

  console.log('7) Reviewing submission as client...');
  await request(`/onboarding/pqq/${submitted.data.id}/review`, {
    method: 'PUT',
    token: clientToken,
    body: { status: 'approved', review_notes: 'E2E verification approval' },
  });

  console.log('8) Verifying review status + expiry alerts endpoint...');
  const pqqs = await request('/onboarding/pqq', { token: clientToken });
  const row = (pqqs.data || []).find((p) => p.id === submitted.data.id);
  if (!row) throw new Error('Submitted PQQ not found after review');
  if (row.status !== 'approved') throw new Error(`Expected approved status, got ${row.status}`);

  const alerts = await request(`/onboarding/pqq/${submitted.data.id}/expiry-alerts`, { token: clientToken });
  if (!Array.isArray(alerts.data.alerts)) throw new Error('Expiry alerts response invalid');

  console.log('PASS: PQQ import + invitation + submit + scoring + review + history + expiry endpoints verified.');
};

run().catch((error) => {
  console.error('FAIL:', error.message);
  process.exit(1);
});

