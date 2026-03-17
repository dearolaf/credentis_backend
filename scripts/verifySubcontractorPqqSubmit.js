const API = 'http://127.0.0.1:3000/api';

const login = async (email, password) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.message || 'login failed');
  return json.data.token;
};

const get = async (path, token) => {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.message || `GET ${path} failed`);
  return json.data;
};

const post = async (path, token, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.message || `POST ${path} failed`);
  return json.data;
};

const buildAnswers = (questions) => {
  const answers = {};
  for (const q of questions) {
    const t = q.question_type;
    if (t === 'yes_no') answers[q.question_id] = false;
    else if (t === 'number_input') answers[q.question_id] = 10;
    else if (t === 'insurance_input') {
      answers[q.question_id] = { policy_number: 'POL-123', coverage: 10000000, expiry_date: '2027-12-31' };
    } else if ((t || '').startsWith('file_upload')) answers[q.question_id] = 'mock-file.pdf';
    else answers[q.question_id] = 'mock answer';
  }
  return answers;
};

const run = async () => {
  const token = await login('sub@sticksandplanks.ie', 'Password123!');
  const invitations = await get('/onboarding/invitations', token);
  const invited = invitations.find((i) => i.status === 'invited');
  if (!invited) throw new Error('No invited PQQ found for subcontractor');

  const invitationDetail = await get(`/onboarding/invitations/${invited.id}`, token);
  const tpl = await get(`/onboarding/templates/${invitationDetail.pqq_template_id}`, token);
  const answers = buildAnswers(tpl.questions || []);

  const submitted = await post('/onboarding/pqq', token, {
    invitation_id: invited.id,
    answers,
  });

  const invitationsAfter = await get('/onboarding/invitations', token);
  const updated = invitationsAfter.find((i) => i.id === invited.id);

  console.log(JSON.stringify({
    invitation_id: invited.id,
    submit_success: !!submitted?.id,
    submission_id: submitted?.id || null,
    submission_status: submitted?.status || null,
    invitation_status_after_submit: updated?.status || null,
  }, null, 2));
};

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

