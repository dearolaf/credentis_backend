const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Initialize DB
const db = require('../config/database');
const MockBlockchain = require('../utils/blockchain');

console.log('Seeding Credentis database with mock data...\n');

// Clear existing data
const tables = [
  'audit_log',
  'data_access_requests',
  'consent_records',
  'tokens',
  'awards',
  'badges',
  'credentials',
  'project_assignments',
  'project_delegations',
  'worker_dar_satisfaction',
  'project_dar_requirements',
  'pqq_submissions',
  'pqq_invitations',
  'pqq_template_questions',
  'pqq_expiry_tracking_config',
  'pqq_validation_rules_reference',
  'pqq_question_types_reference',
  'pqq_template_sections',
  'pqq_template_metadata',
  'pqq_templates',
  'projects',
  'users'
];
db.prepare('PRAGMA foreign_keys = OFF').run();
tables.forEach(t => db.prepare(`DELETE FROM ${t}`).run());
db.prepare('PRAGMA foreign_keys = ON').run();

const passwordHash = bcrypt.hashSync('Password123!', 10);

// ===== USERS =====
// Investor demo: single end‑to‑end chain around HyperDC Co / 24MW Data Centre – West Dublin
const users = {
  // Clients (only HyperDC Co)
  clients: [
    {
      id: uuidv4(),
      email: 'client@hyperdc.co',
      role: 'client',
      first_name: 'Patrick',
      last_name: "O'Brien",
      phone: '+353-1-555-0101',
      nationality: 'Irish',
      company_name: 'HyperDC Co',
      company_registration: 'IE-2025-44521',
    },
  ],
  // Contractors (only BuildRight Construction Ltd)
  contractors: [
    {
      id: uuidv4(),
      email: 'contractor@buildright.ie',
      role: 'contractor',
      first_name: 'Michael',
      last_name: 'Fitzgerald',
      phone: '+353-1-555-0301',
      nationality: 'Irish',
      company_name: 'BuildRight Construction Ltd',
      company_registration: 'IE-2018-33210',
    },
  ],
  // Subcontractors (ElecSpec Electrical, Sticks and Planks Scaffolding)
  subcontractors: [
    {
      id: uuidv4(),
      email: 'sub@elecspec.ie',
      role: 'subcontractor',
      first_name: 'Declan',
      last_name: 'Murphy',
      phone: '+353-1-555-0601',
      nationality: 'Irish',
      company_name: 'ElecSpec Electrical',
      company_registration: 'IE-2021-11223',
    },
    {
      id: uuidv4(),
      email: 'sub@sticksandplanks.ie',
      role: 'subcontractor',
      first_name: 'Katie',
      last_name: 'Doyle',
      phone: '+353-1-555-0701',
      nationality: 'Irish',
      company_name: 'Sticks and Planks Scaffolding',
      company_registration: 'IE-2022-77889',
    },
  ],
  // Workers
  workers: [
    { id: uuidv4(), email: 'sean.murphy@email.ie', role: 'worker', first_name: 'Sean', last_name: 'Murphy', phone: '+353-87-555-1001', nationality: 'Irish', date_of_birth: '1988-03-15' },
    { id: uuidv4(), email: 'piotr.kowalski@email.pl', role: 'worker', first_name: 'Piotr', last_name: 'Kowalski', phone: '+48-502-555-1002', nationality: 'Polish', date_of_birth: '1990-07-22' },
    { id: uuidv4(), email: 'andrei.popescu@email.ro', role: 'worker', first_name: 'Andrei', last_name: 'Popescu', phone: '+40-722-555-1003', nationality: 'Romanian', date_of_birth: '1985-11-08' },
    { id: uuidv4(), email: 'hans.mueller@email.de', role: 'worker', first_name: 'Hans', last_name: 'Mueller', phone: '+49-170-555-1004', nationality: 'German', date_of_birth: '1992-01-30' },
    { id: uuidv4(), email: 'aoife.ryan@email.ie', role: 'worker', first_name: 'Aoife', last_name: 'Ryan', phone: '+353-87-555-1005', nationality: 'Irish', date_of_birth: '1995-05-12' },
    { id: uuidv4(), email: 'tomasz.zielinski@email.pl', role: 'worker', first_name: 'Tomasz', last_name: 'Zielinski', phone: '+48-503-555-1006', nationality: 'Polish', date_of_birth: '1987-09-18' },
    { id: uuidv4(), email: 'elena.dimitrescu@email.ro', role: 'worker', first_name: 'Elena', last_name: 'Dimitrescu', phone: '+40-723-555-1007', nationality: 'Romanian', date_of_birth: '1993-12-25' },
    { id: uuidv4(), email: 'ciaran.walsh@email.ie', role: 'worker', first_name: 'Ciaran', last_name: 'Walsh', phone: '+353-86-555-1008', nationality: 'Irish', date_of_birth: '1989-06-05' },
    { id: uuidv4(), email: 'jan.novak@email.pl', role: 'worker', first_name: 'Jan', last_name: 'Novak', phone: '+48-504-555-1009', nationality: 'Polish', date_of_birth: '1991-04-14' },
    { id: uuidv4(), email: 'fritz.schneider@email.de', role: 'worker', first_name: 'Fritz', last_name: 'Schneider', phone: '+49-171-555-1010', nationality: 'German', date_of_birth: '1986-08-20' },
    { id: uuidv4(), email: 'james.smith@email.uk', role: 'worker', first_name: 'James', last_name: 'Smith', phone: '+44-7700-555-1011', nationality: 'British', date_of_birth: '1994-02-28' },
    { id: uuidv4(), email: 'katarzyna.wozniak@email.pl', role: 'worker', first_name: 'Katarzyna', last_name: 'Wozniak', phone: '+48-505-555-1012', nationality: 'Polish', date_of_birth: '1996-10-03' },
    { id: uuidv4(), email: 'liam.odowd@email.ie', role: 'worker', first_name: 'Liam', last_name: "O'Dowd", phone: '+353-85-555-1013', nationality: 'Irish', date_of_birth: '1984-07-17' },
    { id: uuidv4(), email: 'dragos.marin@email.ro', role: 'worker', first_name: 'Dragos', last_name: 'Marin', phone: '+40-724-555-1014', nationality: 'Romanian', date_of_birth: '1990-03-09' },
    { id: uuidv4(), email: 'anna.schmidt@email.de', role: 'worker', first_name: 'Anna', last_name: 'Schmidt', phone: '+49-172-555-1015', nationality: 'German', date_of_birth: '1993-11-22' },
    { id: uuidv4(), email: 'niamh.brennan@email.ie', role: 'worker', first_name: 'Niamh', last_name: 'Brennan', phone: '+353-87-555-1016', nationality: 'Irish', date_of_birth: '1997-01-08' },
    { id: uuidv4(), email: 'pawel.kaczmarek@email.pl', role: 'worker', first_name: 'Pawel', last_name: 'Kaczmarek', phone: '+48-506-555-1017', nationality: 'Polish', date_of_birth: '1988-05-30' },
    { id: uuidv4(), email: 'mihai.stoica@email.ro', role: 'worker', first_name: 'Mihai', last_name: 'Stoica', phone: '+40-725-555-1018', nationality: 'Romanian', date_of_birth: '1991-09-11' },
    { id: uuidv4(), email: 'connor.byrne@email.ie', role: 'worker', first_name: 'Connor', last_name: 'Byrne', phone: '+353-86-555-1019', nationality: 'Irish', date_of_birth: '1986-12-15' },
    { id: uuidv4(), email: 'lukas.bauer@email.de', role: 'worker', first_name: 'Lukas', last_name: 'Bauer', phone: '+49-173-555-1020', nationality: 'German', date_of_birth: '1994-06-27' },
  ]
};

// Insert all users
const insertUser = db.prepare(`
  INSERT INTO users (id, email, password_hash, role, first_name, last_name, phone, nationality, date_of_birth, did, company_name, company_registration, passport_status, biometric_status, is_verified, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

const allUsers = [...users.clients, ...users.contractors, ...users.subcontractors, ...users.workers];
const insertUsers = db.transaction(() => {
  for (const u of allUsers) {
    const did = MockBlockchain.createDID(u.id);
    const isWorker = u.role === 'worker';
    // For demo resets, workers (including Sean) start unverified so passport/selfie
    // verification can be shown live in the app.
    insertUser.run(
      u.id,
      u.email,
      passwordHash,
      u.role,
      u.first_name,
      u.last_name,
      u.phone || null,
      u.nationality || null,
      u.date_of_birth || null,
      did,
      u.company_name || null,
      u.company_registration || null,
      isWorker ? 'none' : 'accepted',
      isWorker ? 'none' : 'accepted',
      isWorker ? 0 : 1
    );
  }
});
insertUsers();
console.log(`✓ Created ${allUsers.length} users (${users.clients.length} clients, ${users.contractors.length} contractors, ${users.subcontractors.length} subcontractors, ${users.workers.length} workers)`);

// ===== PROJECTS =====
// Portfolio of Verified Projects for demo (professionals can apply to multiple projects)
const projectData = [
  {
    title: '24MW Data Centre – West Dublin',
    description: 'HyperDC Co Tier III+ data centre build in West Dublin, including full MEP fit-out and commissioning.',
    sector: 'construction',
    location: 'West Dublin, Ireland',
    country: 'Ireland',
    client_idx: 0,
    start_date: '2026-03-01',
    end_date: '2027-03-31',
    compliance: ['SafePass', 'Electrical Safety', 'Manual Handling', 'Working at Heights'],
    max_workers: 120,
  },
  {
    title: '18MW Data Centre – Cork East',
    description: 'Regional data centre shell and core build with electrical and commissioning work packages.',
    sector: 'construction',
    location: 'Cork, Ireland',
    country: 'Ireland',
    client_idx: 0,
    start_date: '2026-04-15',
    end_date: '2027-01-30',
    compliance: ['SafePass', 'Manual Handling', 'Working at Heights', 'Site Induction'],
    max_workers: 90,
  },
  {
    title: 'HyperDC Grid Connection Upgrade – Kildare',
    description: 'HV/LV infrastructure upgrade and electrical safety programme for new data hall capacity.',
    sector: 'energy',
    location: 'Kildare, Ireland',
    country: 'Ireland',
    client_idx: 0,
    start_date: '2026-05-01',
    end_date: '2026-12-20',
    compliance: ['SafePass', 'Electrical Safety', 'Arc Flash Awareness', 'Manual Handling'],
    max_workers: 70,
  },
  {
    title: 'HyperDC Campus Expansion – Limerick',
    description: 'Civil and structural expansion with scaffold-heavy access works and EHS controls.',
    sector: 'infrastructure',
    location: 'Limerick, Ireland',
    country: 'Ireland',
    client_idx: 0,
    start_date: '2026-06-10',
    end_date: '2027-06-10',
    compliance: ['SafePass', 'Working at Heights', 'Professional and Academic Qualifications', 'Site Induction'],
    max_workers: 110,
  },
  {
    title: 'HyperDC Operations Fit-out – Galway',
    description: 'Operational fit-out, snagging, and handover activities with specialist electrical scope.',
    sector: 'construction',
    location: 'Galway, Ireland',
    country: 'Ireland',
    client_idx: 0,
    start_date: '2026-07-01',
    end_date: '2027-02-28',
    compliance: ['SafePass', 'Manual Handling', 'Professional and Academic Qualifications', 'Arc Flash Awareness'],
    max_workers: 80,
  },
];

const projects = [];
const pqqTemplateIdForProject = 'tpl-construction-14';
const insertProject = db.prepare(`
  INSERT INTO projects (id, title, description, client_id, sector, location, country, start_date, end_date, status, compliance_requirements, privacy_settings, max_workers, pqq_template_id, pqq_due_days)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, '{"public": true}', ?, ?, ?)
`);

const insertProjects = db.transaction(() => {
  for (const p of projectData) {
    const id = uuidv4();
    insertProject.run(id, p.title, p.description, users.clients[p.client_idx].id, p.sector, p.location, p.country, p.start_date, p.end_date, JSON.stringify(p.compliance), p.max_workers, pqqTemplateIdForProject, 14);
    projects.push({ id, ...p });
  }
});
insertProjects();
console.log(`✓ Created ${projects.length} Verified Projects`);

// ===== DELEGATIONS =====
// HyperDC Co → BuildRight Construction Ltd (contractor) → ElecSpec / Sticks and Planks (subcontractors)
const delegationData = [
  { project_idx: 0, contractor_idx: 0, status: 'approved' },
  { project_idx: 1, contractor_idx: 0, status: 'approved' },
  { project_idx: 2, contractor_idx: 0, status: 'approved' },
  { project_idx: 3, contractor_idx: 0, status: 'approved' },
  { project_idx: 4, contractor_idx: 0, status: 'approved' },
];

const insertDelegation = db.prepare(`
  INSERT INTO project_delegations (id, project_id, delegator_id, delegatee_id, delegatee_role, scope, status, approved_by)
  VALUES (?, ?, ?, ?, 'contractor', '{}', ?, ?)
`);

const subdelegations = [
  { project_idx: 0, sub_idx: 0 }, // ElecSpec Electrical
  { project_idx: 0, sub_idx: 1 }, // Sticks and Planks Scaffolding
  { project_idx: 1, sub_idx: 0 },
  { project_idx: 1, sub_idx: 1 },
  { project_idx: 2, sub_idx: 0 },
  { project_idx: 2, sub_idx: 1 },
  { project_idx: 3, sub_idx: 0 },
  { project_idx: 3, sub_idx: 1 },
  { project_idx: 4, sub_idx: 0 },
  { project_idx: 4, sub_idx: 1 },
];

const insertSubDelegation = db.prepare(`
  INSERT INTO project_delegations (id, project_id, delegator_id, delegatee_id, delegatee_role, scope, status, approved_by)
  VALUES (?, ?, ?, ?, 'subcontractor', '{}', 'approved', ?)
`);

const insertDelegations = db.transaction(() => {
  for (const d of delegationData) {
    const clientId = users.clients[projects[d.project_idx].client_idx].id;
    insertDelegation.run(
      uuidv4(),
      projects[d.project_idx].id,
      clientId,
      users.contractors[d.contract_idx ?? d.contractor_idx].id,
      d.status,
      d.status === 'approved' ? clientId : null
    );
  }
  for (const sd of subdelegations) {
    const clientId = users.clients[projects[sd.project_idx].client_idx].id;
    insertSubDelegation.run(
      uuidv4(),
      projects[sd.project_idx].id,
      users.contractors[0].id,
      users.subcontractors[sd.sub_idx].id,
      clientId
    );
  }
});
insertDelegations();
console.log(`✓ Created ${delegationData.length} contractor delegations + ${subdelegations.length} subcontractor delegations`);

// ===== WORKER ASSIGNMENTS =====
const workerAssignments = [];
const insertAssignment = db.prepare(`
  INSERT INTO project_assignments (id, project_id, worker_id, assigned_by, role_on_project, start_date, end_date, status, endorsement_status, endorsed_by, endorsed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const assignmentData = db.transaction(() => {
  const statuses = ['active', 'active', 'active', 'approved', 'pending', 'completed'];
  const roles = ['General Operative', 'Electrician', 'Welder', 'Carpenter', 'Plumber', 'Site Engineer', 'Safety Officer', 'Crane Operator'];
  const sean = users.workers[0];

  users.workers.forEach((worker, wIdx) => {
    // Assign each worker to 1-3 projects
    const numProjects = Math.min(1 + Math.floor(Math.random() * 3), projects.length);
    const assignedProjects = new Set();
    
    for (let i = 0; i < numProjects; i++) {
      let pIdx;
      do { pIdx = Math.floor(Math.random() * projects.length); } while (assignedProjects.has(pIdx));
      assignedProjects.add(pIdx);

      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const endorsed = ['active', 'completed'].includes(status);
      const endorser = users.contractors[Math.floor(Math.random() * users.contractors.length)];
      const role = (worker.id === sean.id) ? 'Electrical Engineer' : roles[Math.floor(Math.random() * roles.length)];
      const id = uuidv4();

      insertAssignment.run(id, projects[pIdx].id, worker.id, endorser.id, role,
        projects[pIdx].start_date, projects[pIdx].end_date,
        status, endorsed ? 'endorsed' : 'none',
        endorsed ? endorser.id : null, endorsed ? new Date().toISOString() : null);
      
      workerAssignments.push({ id, projectIdx: pIdx, workerIdx: wIdx, status });
    }
  });
});
assignmentData();
console.log(`✓ Created ${workerAssignments.length} worker-project assignments`);

// ===== CREDENTIALS =====
// Irish construction and data centre context: SOLAS, HSA, ESB, QQI, Irish institutions only.
const credentialTypes = [
  { type: 'SafePass', title: 'SafePass Card', issuer: 'SOLAS' },
  { type: 'ManualHandling', title: 'Manual Handling Certificate', issuer: 'SOLAS / HSA' },
  { type: 'WorkingAtHeights', title: 'Working at Heights Certificate', issuer: 'IPAF Ireland' },
  { type: 'ArcFlash', title: 'Arc Flash Awareness Certificate', issuer: 'ESB Networks' },
  { type: 'FirstAid', title: 'First Aid at Work Certificate', issuer: 'Irish Red Cross' },
  { type: 'FireSafety', title: 'Fire Safety Awareness Certificate', issuer: 'HSA' },
  { type: 'ConfinedSpace', title: 'Confined Space Entry Certificate', issuer: 'SOLAS' },
  { type: 'ElectricalSafety', title: 'Electrical Safety Certificate', issuer: 'Safe Electric (RECI)' },
  { type: 'AsbestosAwareness', title: 'Asbestos Awareness Certificate', issuer: 'HSA' },
  { type: 'QQI_L5_Scaffolding', title: 'QQI Level 5 Scaffolding', issuer: 'QQI' },
  { type: 'QQI_L6_Electrical', title: 'QQI Level 6 Electrical Apprenticeship', issuer: 'QQI' },
  { type: 'BEng_Electrical', title: 'BEng Electrical Engineering', issuer: 'TU Dublin' },
];

const insertCredential = db.prepare(`
  INSERT INTO credentials (id, worker_id, type, title, issuer, issue_date, expiry_date, status, data, vc_hash, blockchain_tx, is_verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

let credCount = 0;
const sean = users.workers[0]; // Sean Murphy – demo professional who submits BEng & QQI L6 Electrical Apprenticeship to verify

const insertCredentials = db.transaction(() => {
  users.workers.forEach(worker => {
    let selectedCreds;
    if (worker.id === sean.id) {
      // Sean: fixed set so he can verify with BEng + QQI L6 Electrical Apprenticeship (and EHS minimum)
      selectedCreds = credentialTypes.filter(c =>
        ['SafePass', 'ManualHandling', 'WorkingAtHeights', 'BEng_Electrical', 'QQI_L6_Electrical'].includes(c.type)
      );
    } else {
      const numCreds = 3 + Math.floor(Math.random() * 4);
      selectedCreds = [...credentialTypes].sort(() => Math.random() - 0.5).slice(0, numCreds);
    }

    selectedCreds.forEach(cred => {
      const issueDate = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      let expiryDate;
      if (cred.type === 'QQI_L6_Electrical' || cred.type === 'BEng_Electrical') {
        // QQI Electrical Apprenticeship and BEng qualifications do not expire
        expiryDate = null;
      } else {
        const rand = Math.random();
        if (rand < 0.1) {
          expiryDate = new Date(2025, Math.floor(Math.random() * 12), 15); // Expired
        } else if (rand < 0.25) {
          expiryDate = new Date(2026, 2, Math.floor(Math.random() * 28) + 1); // Expiring soon
        } else {
          expiryDate = new Date(2027, Math.floor(Math.random() * 12), 15); // Valid
        }
      }

      const vcResult = MockBlockchain.createVC(cred.type, { id: worker.id, did: MockBlockchain.createDID(worker.id) }, { id: 'platform', name: cred.issuer }, { type: cred.type, title: cred.title });

      const status = expiryDate == null ? 'valid' : (expiryDate < new Date() ? 'expired' : 'valid');
      insertCredential.run(uuidv4(), worker.id, cred.type, cred.title, cred.issuer,
        issueDate.toISOString().split('T')[0], expiryDate == null ? null : expiryDate.toISOString().split('T')[0],
        status, JSON.stringify(vcResult.vc), vcResult.vcHash, vcResult.blockchainTx);
      credCount++;
    });
  });
});
insertCredentials();
console.log(`✓ Created ${credCount} credentials across ${users.workers.length} workers (Sean has non-expiring BEng + QQI L6 Electrical Apprenticeship for verification)`);

// ===== BADGES =====
const badgeTypes = [
  { type: 'compliance', title: 'SafePass Valid', description: 'Maintains a currently valid SafePass certification' },
  { type: 'compliance', title: 'Site Induction Complete', description: 'Passed site induction assessment' },
  { type: 'skills', title: 'Arc Flash Awareness', description: 'Demonstrated arc flash safety competence' },
  { type: 'safety', title: 'Zero Accidents - 30 Days', description: '30 consecutive days without safety incidents' },
  { type: 'safety', title: 'Zero Accidents - 90 Days', description: '90 consecutive days without safety incidents' },
  { type: 'engagement', title: 'Toolbox Talk Champion', description: 'Actively participated in all toolbox talks this month' },
  { type: 'engagement', title: 'Never Late!', description: 'Perfect attendance record for the month' },
  { type: 'skills', title: 'First Aid Responder', description: 'Qualified and active as site first aid responder' },
  { type: 'safety', title: 'Hazard Spotter', description: 'Identified and reported a potential safety hazard' },
  { type: 'engagement', title: 'Team Player', description: 'Nominated by peers for outstanding teamwork' },
];

const insertBadge = db.prepare(`
  INSERT INTO badges (id, worker_id, type, title, description, issued_by, project_id, vc_hash, blockchain_tx)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let badgeCount = 0;
const insertBadges = db.transaction(() => {
  users.workers.forEach(worker => {
    const numBadges = 1 + Math.floor(Math.random() * 5);
    const selected = [...badgeTypes].sort(() => Math.random() - 0.5).slice(0, numBadges);

    selected.forEach(badge => {
      const issuer = [...users.contractors, ...users.subcontractors][Math.floor(Math.random() * (users.contractors.length + users.subcontractors.length))];
      const project = projects[Math.floor(Math.random() * projects.length)];
      const vcResult = MockBlockchain.createVC('BadgeCredential', { id: worker.id }, { id: issuer.id, name: `${issuer.first_name} ${issuer.last_name}` }, { badgeType: badge.type, title: badge.title });

      insertBadge.run(uuidv4(), worker.id, badge.type, badge.title, badge.description, issuer.id, project.id, vcResult.vcHash, vcResult.blockchainTx);
      badgeCount++;
    });
  });
});
insertBadges();
console.log(`✓ Created ${badgeCount} badges`);

// ===== AWARDS =====
const awardTypes = [
  { type: 'safety_champion', title: 'Safety Champion', description: 'Outstanding commitment to workplace safety standards' },
  { type: 'team_player', title: 'Team Player Award', description: 'Exceptional teamwork and collaboration on project' },
  { type: 'project_excellence', title: 'Project Excellence Award', description: 'Delivered exceptional quality work on project' },
  { type: 'innovation', title: 'Innovation Award', description: 'Proposed innovative solution improving project efficiency' },
  { type: 'mentorship', title: 'Mentorship Award', description: 'Provided excellent guidance and mentorship to junior professionals' },
];

const insertAward = db.prepare(`
  INSERT INTO awards (id, worker_id, type, title, description, issued_by, project_id, vc_hash, blockchain_tx)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let awardCount = 0;
const insertAwards = db.transaction(() => {
  // Give awards to top ~40% of workers
  const awardedWorkers = users.workers.filter(() => Math.random() > 0.6);
  awardedWorkers.forEach(worker => {
    const award = awardTypes[Math.floor(Math.random() * awardTypes.length)];
    const issuer = users.clients[Math.floor(Math.random() * users.clients.length)];
    const project = projects[Math.floor(Math.random() * projects.length)];
    const vcResult = MockBlockchain.createVC('AwardCredential', { id: worker.id }, { id: issuer.id, name: `${issuer.first_name} ${issuer.last_name}` }, { awardType: award.type, title: award.title });

    insertAward.run(uuidv4(), worker.id, award.type, award.title, award.description, issuer.id, project.id, vcResult.vcHash, vcResult.blockchainTx);
    awardCount++;
  });
});
insertAwards();
console.log(`✓ Created ${awardCount} awards`);

// ===== TOKENS =====
const tokenTypes = ['Coffee Voucher', 'Snack Voucher', 'Lunch Voucher', 'Badge Reward', 'Award Bonus'];
const insertToken = db.prepare(`
  INSERT INTO tokens (id, worker_id, type, title, value, is_redeemed, issued_by, project_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let tokenCount = 0;
const insertTokens = db.transaction(() => {
  users.workers.forEach(worker => {
    const numTokens = 2 + Math.floor(Math.random() * 8);
    for (let i = 0; i < numTokens; i++) {
      const tokenType = tokenTypes[Math.floor(Math.random() * tokenTypes.length)];
      const value = Math.floor(Math.random() * 5) + 1;
      const redeemed = Math.random() > 0.7 ? 1 : 0;
      const project = projects[Math.floor(Math.random() * projects.length)];
      insertToken.run(uuidv4(), worker.id, 'reward', tokenType, value, redeemed, users.clients[0].id, project.id);
      tokenCount++;
    }
  });
});
insertTokens();
console.log(`✓ Created ${tokenCount} tokens`);

// ===== PQQ TEMPLATES =====
const constructionPQQSections = [
  'Identity & Company Details', 'Financial Standing', 'Health & Safety', 'Quality Management',
  'Environmental', 'Equal Opportunities', 'Modern Slavery', 'Insurance', 'References',
  'Technical Capacity', 'Subcontracting', 'Compliance & Certifications', 'Data Protection', 'Declaration'
];
const pqqTemplateId = 'tpl-construction-14';
db.prepare(`
  INSERT INTO pqq_templates (id, name, sections) VALUES (?, ?, ?)
`).run(pqqTemplateId, '14-Section Construction PQQ', JSON.stringify(constructionPQQSections));
db.prepare(`
  INSERT OR REPLACE INTO pqq_template_metadata
  (template_id, template_name, template_version, standard_alignment, project_type, min_project_value, total_sections, total_questions, max_score, pass_threshold, default_deadline_days, status, created_date, last_modified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  pqqTemplateId,
  '€100m+ GC Data Centre PQQ',
  '1.0',
  'PAS 91:2013 principles',
  'General Contractor - Data Centre',
  100000000,
  14,
  28,
  100,
  70,
  14,
  'active',
  '2026-02-25',
  '2026-03-10'
);

const pqqSections = [
  ['sec_01', 1, 'Organisation Identity', 0, 0, 'pass_fail', 'Company registration and structure information'],
  ['sec_02', 2, 'Financial Standing', 15, 10, 'scored', 'Turnover, profitability, liquidity and credit rating'],
  ['sec_03', 3, 'Insurance', 15, 12, 'scored', 'EL, PL, PI and All Risk insurance coverage'],
  ['sec_04', 4, 'Exclusion Grounds', 0, 0, 'pass_fail', 'Criminal, bankruptcy, tax and blacklist checks'],
  ['sec_05', 5, 'Health & Safety', 20, 14, 'scored', 'H&S policy, ISO 45001, RIDDOR, HSE notices'],
  ['sec_06', 6, 'Environmental', 10, 6, 'scored', 'Environmental policy, ISO 14001, carbon reduction'],
  ['sec_07', 7, 'Quality', 10, 6, 'scored', 'Quality policy, ISO 9001, non-conformance rates'],
  ['sec_08', 8, 'Technical Experience', 15, 10, 'scored', 'Project references over €50m, data centre experience'],
  ['sec_09', 9, 'Key Personnel', 10, 7, 'scored', 'PM, QS, SHEQ and BIM manager qualifications'],
  ['sec_10', 10, 'Supply Chain', 5, 3, 'scored', 'Payment terms, modern slavery, subcontractor vetting'],
  ['sec_11', 11, 'BIM Capability', 5, 3, 'scored', 'BIM level 2, execution plans, software platforms'],
  ['sec_12', 12, 'EDI & Social Value', 5, 3, 'scored', 'EDI policy, apprenticeships, local employment'],
  ['sec_13', 13, 'Cyber Security', 5, 3, 'scored', 'Cyber essentials, GDPR, data breach history'],
  ['sec_14', 14, 'Legal', 0, 0, 'pass_fail', 'Litigation, judgements, disputes, anti-bribery'],
];
const insertPqqSection = db.prepare(`
  INSERT INTO pqq_template_sections
  (id, template_id, section_id, section_number, section_title, max_points, pass_threshold, scoring_type, display_order, description, calculation_method, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
pqqSections.forEach((s, idx) => {
  insertPqqSection.run(uuidv4(), pqqTemplateId, s[0], s[1], s[2], s[3], s[4], s[5], s[1], s[6], s[5] === 'pass_fail' ? 'all_required' : 'sum_points', null);
});

const insertQTypeRef = db.prepare(`
  INSERT OR REPLACE INTO pqq_question_types_reference (question_type, description, ui_component, data_fields, validation_logic)
  VALUES (?, ?, ?, ?, ?)
`);
[
  ['text_input', 'Single line text field', 'input type=text', 'value:string', 'length/format checks'],
  ['textarea', 'Multi-line text area', 'textarea', 'value:string', 'length checks'],
  ['number_input', 'Numeric input field', 'input type=number', 'value:number', 'min/max value checks'],
  ['yes_no', 'Yes/No radio buttons', 'radio buttons', 'value:boolean', 'required selection'],
  ['file_upload', 'Single file upload', 'file input', 'file:id,name,size', 'file type/size limits'],
  ['file_upload_cert', 'File upload with cert number and expiry', 'file + text + date', 'file+cert+expiry', 'expiry validation'],
  ['insurance_input', 'Insurance policy details', 'composite inputs', 'policy_number,coverage,expiry', 'coverage threshold + expiry'],
].forEach(r => insertQTypeRef.run(...r));

const insertValRuleRef = db.prepare(`
  INSERT OR REPLACE INTO pqq_validation_rules_reference (validation_rule, description, validation_value, pass_condition, alert_logic)
  VALUES (?, ?, ?, ?, ?)
`);
[
  ['none', 'No validation applied', '', 'Always pass', ''],
  ['regex', 'Regex pattern match', 'Pattern string', 'Matches pattern', 'Red if invalid format'],
  ['email_format', 'Valid email format', '', 'RFC compliant email', 'Red if invalid email'],
  ['min_value', 'Minimum numeric threshold', 'Numeric value', 'Input >= threshold', 'Red if below threshold'],
  ['max_value', 'Maximum numeric threshold', 'Numeric value', 'Input <= threshold', 'Red if above threshold'],
  ['min_coverage', 'Minimum insurance coverage', 'Coverage amount', 'Coverage >= threshold', 'Red if insufficient'],
  ['pass_if_no', 'Pass only if answer is No', '', 'Value must be false/No', 'Red if Yes'],
].forEach(r => insertValRuleRef.run(...r));

const pqqQuestions = [
  ['q_01', 'sec_01', 'Q1.1', 'Company legal name', 'text_input', 'string', 1, 0, 'none', null, 0],
  ['q_02', 'sec_01', 'Q1.2', 'Company registration number', 'text_input', 'string', 1, 0, 'regex', '^[A-Z0-9-]{5,}$', 0],
  ['q_03', 'sec_02', 'Q2.1', 'Turnover last year (€)', 'number_input', 'integer', 1, 5, 'min_value', '10000000', 0],
  ['q_04', 'sec_02', 'Q2.2', 'Profit before tax (€)', 'number_input', 'integer', 1, 5, 'min_value', '1', 0],
  ['q_05', 'sec_03', 'Q3.1', 'Employers Liability insurance', 'insurance_input', 'composite', 1, 5, 'min_coverage', '10000000', 0],
  ['q_06', 'sec_03', 'Q3.2', 'Public Liability insurance', 'insurance_input', 'composite', 1, 5, 'min_coverage', '10000000', 0],
  ['q_07', 'sec_04', 'Q4.1', 'Any conviction in last 5 years?', 'yes_no', 'boolean', 1, 0, 'pass_if_no', null, 1],
  ['q_08', 'sec_04', 'Q4.2', 'Any outstanding tax judgements?', 'yes_no', 'boolean', 1, 0, 'pass_if_no', null, 1],
  ['q_09', 'sec_05', 'Q5.1', 'ISO 45001 certificate', 'file_upload', 'pdf', 1, 7, 'none', null, 0],
  ['q_10', 'sec_05', 'Q5.2', 'RIDDOR incidents last 12 months', 'number_input', 'integer', 1, 7, 'min_value', '0', 0],
  ['q_11', 'sec_06', 'Q6.1', 'ISO 14001 certificate', 'file_upload', 'pdf', 1, 3, 'none', null, 0],
  ['q_12', 'sec_06', 'Q6.2', 'Carbon reduction policy uploaded', 'file_upload', 'pdf', 1, 3, 'none', null, 0],
  ['q_13', 'sec_07', 'Q7.1', 'ISO 9001 certificate', 'file_upload', 'pdf', 1, 3, 'none', null, 0],
  ['q_14', 'sec_07', 'Q7.2', 'Non-conformance process described', 'textarea', 'string', 1, 3, 'none', null, 0],
  ['q_15', 'sec_08', 'Q8.1', 'Project references over €50m (count)', 'number_input', 'integer', 1, 5, 'min_value', '3', 0],
  ['q_16', 'sec_08', 'Q8.2', 'Data centre references uploaded', 'file_upload', 'pdf', 1, 5, 'none', null, 0],
  ['q_17', 'sec_09', 'Q9.1', 'Project Manager CV', 'file_upload', 'pdf', 1, 3, 'none', null, 0],
  ['q_18', 'sec_09', 'Q9.2', 'SHEQ Manager CV', 'file_upload', 'pdf', 1, 4, 'none', null, 0],
  ['q_19', 'sec_10', 'Q10.1', 'Payment terms to subcontractors (days)', 'number_input', 'integer', 1, 2, 'max_value', '45', 0],
  ['q_20', 'sec_10', 'Q10.2', 'Modern slavery policy uploaded', 'file_upload', 'pdf', 1, 1, 'none', null, 0],
  ['q_21', 'sec_11', 'Q11.1', 'BIM Level achieved', 'number_input', 'integer', 1, 2, 'min_value', '2', 0],
  ['q_22', 'sec_11', 'Q11.2', 'BIM execution plan uploaded', 'file_upload', 'pdf', 1, 1, 'none', null, 0],
  ['q_23', 'sec_12', 'Q12.1', 'Local employment commitment (%)', 'number_input', 'decimal', 1, 1.5, 'min_value', '5', 0],
  ['q_24', 'sec_12', 'Q12.2', 'EDI policy uploaded', 'file_upload', 'pdf', 1, 1.5, 'none', null, 0],
  ['q_25', 'sec_13', 'Q13.1', 'Cyber Essentials certification', 'file_upload', 'pdf', 1, 2, 'none', null, 0],
  ['q_26', 'sec_13', 'Q13.2', 'Any data breach in last 3 years?', 'yes_no', 'boolean', 1, 1, 'pass_if_no', null, 0],
  ['q_27', 'sec_14', 'Q14.1', 'Any outstanding judgements?', 'yes_no', 'boolean', 1, 0, 'pass_if_no', null, 1],
  ['q_28', 'sec_14', 'Q14.2', 'Anti-bribery policy uploaded', 'file_upload', 'pdf', 1, 0, 'none', null, 0],
];
const insertPqqQuestion = db.prepare(`
  INSERT INTO pqq_template_questions
  (id, template_id, question_id, section_id, question_number, question_text, question_type, data_type, required, points, validation_rule, validation_value, autofail_if_yes, apply_amber_if_yes, apply_bonus_if_no, evidence_required)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
pqqQuestions.forEach((q) => {
  insertPqqQuestion.run(
    uuidv4(),
    pqqTemplateId,
    q[0], q[1], q[2], q[3], q[4], q[5],
    q[6] ? 1 : 0,
    q[7],
    q[8],
    q[9],
    q[10] ? 1 : 0,
    0,
    0,
    q[4].includes('file_upload') || q[4] === 'insurance_input' ? 'Supporting evidence required' : null
  );
});

const insertExpiryCfg = db.prepare(`
  INSERT INTO pqq_expiry_tracking_config (id, template_id, item_category, has_expiry, amber_alert_days, red_alert_days, escalation_logic, suspension_on_expiry)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
[
  ['insurance_policy', 1, 60, 30, '60d: Partner + Contractor; 30d: + Client VP', 1],
  ['iso_certificate', 1, 90, 60, '90d: Partner only; 60d: + Contractor', 0],
  ['policy_document', 1, 365, 0, 'No alerts (amber after 12mo)', 0],
  ['professional_qualification', 1, 90, 30, '90d: Partner only; 30d: + Contractor', 0],
  ['credit_rating', 1, 365, 0, 'Amber after 12mo, no escalation', 0],
].forEach((e) => {
  insertExpiryCfg.run(uuidv4(), pqqTemplateId, e[0], e[1], e[2], e[3], e[4], e[5]);
});
console.log('✓ Created PQQ template: 14-Section Construction PQQ');

// ===== PQQ INVITATIONS & SUBMISSIONS (demo flow) =====
const client = users.clients[0];
const contractor = users.contractors[0];
const sub1 = users.subcontractors[0];
const sub2 = users.subcontractors[1];
const vp = projects[0];

const dueDate = new Date();
dueDate.setDate(dueDate.getDate() + 14);
const dueStr = dueDate.toISOString().slice(0, 10);

// HyperDC invites BuildRight → BuildRight submits → HyperDC approves (pre-seeded as approved)
const inv1Id = uuidv4();
db.prepare(`
  INSERT INTO pqq_invitations (id, project_id, inviter_id, invitee_id, pqq_template_id, due_date, status)
  VALUES (?, ?, ?, ?, ?, ?, 'approved')
`).run(inv1Id, vp.id, client.id, contractor.id, pqqTemplateId, dueStr);

const sub1Id = uuidv4();
db.prepare(`
  INSERT INTO pqq_submissions (id, invitation_id, company_id, project_id, submitted_by, status, company_profile, financial_status, compliance_status, documents)
  VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)
`).run(sub1Id, inv1Id, contractor.id, vp.id, contractor.id,
  JSON.stringify({ name: contractor.company_name, registration: contractor.company_registration }),
  JSON.stringify({ creditScore: 720, turnover: '€12M', status: 'pass' }),
  JSON.stringify({ taxCompliant: true, insuranceValid: true, safetyRecord: 'clean' }),
  JSON.stringify(['insurance_cert.pdf', 'tax_clearance.pdf']));

db.prepare('UPDATE pqq_invitations SET pqq_submission_id = ? WHERE id = ?').run(sub1Id, inv1Id);

// BuildRight invites ElecSpec and Sticks and Planks (invited – partner to submit in demo)
const inv2Id = uuidv4();
const inv3Id = uuidv4();
db.prepare(`
  INSERT INTO pqq_invitations (id, project_id, inviter_id, invitee_id, pqq_template_id, due_date, status)
  VALUES (?, ?, ?, ?, ?, ?, 'invited')
`).run(inv2Id, vp.id, contractor.id, sub1.id, pqqTemplateId, dueStr);
db.prepare(`
  INSERT INTO pqq_invitations (id, project_id, inviter_id, invitee_id, pqq_template_id, due_date, status)
  VALUES (?, ?, ?, ?, ?, ?, 'invited')
`).run(inv3Id, vp.id, contractor.id, sub2.id, pqqTemplateId, dueStr);

console.log('✓ Created PQQ invitations (HyperDC→BuildRight approved; BuildRight→ElecSpec & Sticks and Planks invited)');

// ===== DAR (Data Access Request) – chain of authority =====
const insertDAR = db.prepare(`
  INSERT INTO project_dar_requirements (id, project_id, added_by_id, requirement_key, label, sort_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);
let darOrder = 0;
// Client (HyperDC) – base requirements
insertDAR.run(uuidv4(), vp.id, client.id, 'rtw', 'Right-to-Work status (from identity verification – passport not shared)', ++darOrder);
// Contractor (BuildRight) – EHS compliance (minimum: SafePass, Manual Handling, Working at Height)
insertDAR.run(uuidv4(), vp.id, contractor.id, 'safepass', 'SafePass', ++darOrder);
insertDAR.run(uuidv4(), vp.id, contractor.id, 'manual_handling', 'Manual Handling', ++darOrder);
insertDAR.run(uuidv4(), vp.id, contractor.id, 'working_at_heights', 'Working at Heights', ++darOrder);
// Subcontractor-level request should be generic; professional chooses which qualifications to submit.
insertDAR.run(uuidv4(), vp.id, sub1.id, 'professional_academic_qualifications', 'Submit Professional and Academic Qualifications', ++darOrder);
console.log('✓ Created DAR requirements (Client → Contractor → Subcontractors)');

// ===== DAR SATISFACTION =====
// Intentionally not pre-seeding Sean DAR/RTW satisfaction so live verification flow can be demonstrated.

// ===== AUDIT LOG ENTRIES =====
const insertAudit = db.prepare(`
  INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details, blockchain_tx, hash, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let auditCount = 0;
const insertAudits = db.transaction(() => {
  const actions = [
    'user_registered', 'user_login', 'passport_verified', 'biometric_verified',
    'credential_issued', 'project_created', 'project_delegated', 'worker_endorsed',
    'badge_issued', 'award_issued', 'consent_granted', 'pqq_submitted', 'compliance_check'
  ];

  // Create ~200 audit entries spread over 30 days
  for (let i = 0; i < 200; i++) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const actor = allUsers[Math.floor(Math.random() * allUsers.length)];
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const bcResult = MockBlockchain.anchorData({ action, actorId: actor.id, index: i });

    insertAudit.run(uuidv4(), actor.id, action, action.split('_')[0], uuidv4(),
      JSON.stringify({ action, mock: true }),
      bcResult.transactionId, bcResult.dataHash,
      date.toISOString());
    auditCount++;
  }
});
insertAudits();
console.log(`✓ Created ${auditCount} audit log entries`);

console.log('\n========================================');
console.log('  Mock data seeding complete!');
console.log('========================================');
console.log('\nTest Accounts (password for all: Password123!):');
console.log('  Scenario: HyperDC Co portfolio (5 VPs) → BuildRight → ElecSpec / Sticks and Planks');
console.log(`  Client:        client@hyperdc.co (HyperDC Co)`);
console.log(`  Contractor:    contractor@buildright.ie (BuildRight Construction Ltd)`);
console.log(`  Subcontractor: sub@elecspec.ie (ElecSpec Electrical)`);
console.log(`  Subcontractor: sub@sticksandplanks.ie (Sticks and Planks Scaffolding)`);
console.log(`  Professional:  sean.murphy@email.ie`);
console.log(`  Professional:  piotr.kowalski@email.pl`);
console.log(`  Professional:  andrei.popescu@email.ro`);
console.log('');
