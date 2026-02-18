const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Initialize DB
const db = require('../config/database');
const MockBlockchain = require('../utils/blockchain');

console.log('Seeding Credentis database with mock data...\n');

// Clear existing data
const tables = ['audit_log', 'data_access_requests', 'consent_records', 'tokens', 'awards', 'badges', 'credentials', 'project_assignments', 'project_delegations', 'pqq_submissions', 'projects', 'users'];
tables.forEach(t => db.prepare(`DELETE FROM ${t}`).run());

const passwordHash = bcrypt.hashSync('Password123!', 10);

// ===== USERS =====
const users = {
  // Clients
  clients: [
    { id: uuidv4(), email: 'client@energycorp.ie', role: 'client', first_name: 'Patrick', last_name: 'O\'Brien', phone: '+353-1-555-0101', nationality: 'Irish', company_name: 'EnergyCorp Ireland', company_registration: 'IE-2020-44521' },
    { id: uuidv4(), email: 'client@infradev.de', role: 'client', first_name: 'Klaus', last_name: 'Weber', phone: '+49-30-555-0201', nationality: 'German', company_name: 'InfraDev GmbH', company_registration: 'DE-HRB-98765' },
  ],
  // Contractors
  contractors: [
    { id: uuidv4(), email: 'contractor@buildright.ie', role: 'contractor', first_name: 'Michael', last_name: 'Fitzgerald', phone: '+353-1-555-0301', nationality: 'Irish', company_name: 'BuildRight Construction', company_registration: 'IE-2018-33210' },
    { id: uuidv4(), email: 'contractor@euroworks.pl', role: 'contractor', first_name: 'Marek', last_name: 'Nowak', phone: '+48-22-555-0401', nationality: 'Polish', company_name: 'EuroWorks Sp. z o.o.', company_registration: 'PL-KRS-0000567890' },
    { id: uuidv4(), email: 'contractor@greenbuild.ie', role: 'contractor', first_name: 'Siobhan', last_name: 'Kelly', phone: '+353-1-555-0501', nationality: 'Irish', company_name: 'GreenBuild Solutions', company_registration: 'IE-2019-55432' },
  ],
  // Subcontractors
  subcontractors: [
    { id: uuidv4(), email: 'sub@elecspec.ie', role: 'subcontractor', first_name: 'Declan', last_name: 'Murphy', phone: '+353-1-555-0601', nationality: 'Irish', company_name: 'ElecSpec Electrical', company_registration: 'IE-2021-11223' },
    { id: uuidv4(), email: 'sub@steelfix.ro', role: 'subcontractor', first_name: 'Ion', last_name: 'Ionescu', phone: '+40-21-555-0701', nationality: 'Romanian', company_name: 'SteelFix Romania SRL', company_registration: 'RO-J40-2345-2019' },
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
    insertUser.run(u.id, u.email, passwordHash, u.role, u.first_name, u.last_name, u.phone || null, u.nationality || null, u.date_of_birth || null, did, u.company_name || null, u.company_registration || null, isWorker ? 'none' : 'accepted', isWorker ? 'none' : 'accepted', isWorker ? 0 : 1);
  }
});
insertUsers();
console.log(`✓ Created ${allUsers.length} users (${users.clients.length} clients, ${users.contractors.length} contractors, ${users.subcontractors.length} subcontractors, ${users.workers.length} workers)`);

// ===== PROJECTS =====
const projectData = [
  { title: 'Dublin Metro North - Tunnel Section B', description: 'Major tunnelling works for Dublin Metro North project, Section B from Glasnevin to Drumcondra.', sector: 'infrastructure', location: 'Dublin, Ireland', country: 'Ireland', client_idx: 0, start_date: '2026-03-01', end_date: '2027-06-30', compliance: ['SafePass', 'CSCS Card', 'Manual Handling', 'Confined Space'], max_workers: 150 },
  { title: 'Cork Wind Farm - Phase 2', description: 'Installation of 40 wind turbines in Cork harbour area, including foundation and electrical works.', sector: 'energy', location: 'Cork, Ireland', country: 'Ireland', client_idx: 0, start_date: '2026-04-15', end_date: '2027-02-28', compliance: ['SafePass', 'Working at Heights', 'Arc Flash Awareness', 'First Aid'], max_workers: 80 },
  { title: 'Berlin Data Centre Campus', description: 'Construction of Tier IV data centre campus in Berlin suburbs with full MEP fit-out.', sector: 'construction', location: 'Berlin, Germany', country: 'Germany', client_idx: 1, start_date: '2026-02-15', end_date: '2027-08-31', compliance: ['SafePass', 'CSCS Card', 'Electrical Safety', 'Fire Marshal'], max_workers: 200 },
  { title: 'Limerick Hospital Extension', description: 'Extension of A&E department at University Hospital Limerick, including new wards and diagnostic suites.', sector: 'construction', location: 'Limerick, Ireland', country: 'Ireland', client_idx: 0, start_date: '2026-05-01', end_date: '2027-04-30', compliance: ['SafePass', 'Manual Handling', 'Infection Control', 'First Aid'], max_workers: 60 },
  { title: 'Hamburg Port Modernisation', description: 'Upgrade of cargo handling systems and terminal infrastructure at Hamburg port.', sector: 'infrastructure', location: 'Hamburg, Germany', country: 'Germany', client_idx: 1, start_date: '2026-06-01', end_date: '2027-12-31', compliance: ['SafePass', 'Marine Safety', 'Manual Handling', 'Working at Heights'], max_workers: 120 },
  { title: 'Galway Solar Array Installation', description: 'Large-scale solar panel array installation across 50 hectares in Galway.', sector: 'energy', location: 'Galway, Ireland', country: 'Ireland', client_idx: 0, start_date: '2026-03-15', end_date: '2026-11-30', compliance: ['SafePass', 'Electrical Safety', 'Manual Handling'], max_workers: 40 },
  { title: 'Frankfurt Office Tower Refurbishment', description: 'Full interior refurbishment of 25-storey commercial office tower in Frankfurt business district.', sector: 'construction', location: 'Frankfurt, Germany', country: 'Germany', client_idx: 1, start_date: '2026-04-01', end_date: '2027-03-31', compliance: ['SafePass', 'Working at Heights', 'Asbestos Awareness', 'Fire Marshal'], max_workers: 90 },
  { title: 'Waterford Bridge Rehabilitation', description: 'Structural rehabilitation and widening of N25 bridge over River Suir.', sector: 'infrastructure', location: 'Waterford, Ireland', country: 'Ireland', client_idx: 0, start_date: '2026-07-01', end_date: '2027-06-30', compliance: ['SafePass', 'CSCS Card', 'Working at Heights', 'Traffic Management'], max_workers: 45 },
];

const projects = [];
const insertProject = db.prepare(`
  INSERT INTO projects (id, title, description, client_id, sector, location, country, start_date, end_date, status, compliance_requirements, privacy_settings, max_workers)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, '{"public": true}', ?)
`);

const insertProjects = db.transaction(() => {
  for (const p of projectData) {
    const id = uuidv4();
    insertProject.run(id, p.title, p.description, users.clients[p.client_idx].id, p.sector, p.location, p.country, p.start_date, p.end_date, JSON.stringify(p.compliance), p.max_workers);
    projects.push({ id, ...p });
  }
});
insertProjects();
console.log(`✓ Created ${projects.length} Verified Projects`);

// ===== DELEGATIONS =====
const delegationData = [
  { project_idx: 0, contractor_idx: 0, status: 'approved' },
  { project_idx: 0, contractor_idx: 1, status: 'approved' },
  { project_idx: 1, contractor_idx: 2, status: 'approved' },
  { project_idx: 2, contractor_idx: 1, status: 'approved' },
  { project_idx: 3, contractor_idx: 0, status: 'approved' },
  { project_idx: 4, contractor_idx: 1, status: 'pending' },
  { project_idx: 5, contractor_idx: 2, status: 'approved' },
  { project_idx: 6, contractor_idx: 0, status: 'approved' },
  { project_idx: 7, contractor_idx: 2, status: 'approved' },
];

const insertDelegation = db.prepare(`
  INSERT INTO project_delegations (id, project_id, delegator_id, delegatee_id, delegatee_role, scope, status, approved_by)
  VALUES (?, ?, ?, ?, 'contractor', '{}', ?, ?)
`);

const subdelegations = [
  { project_idx: 0, sub_idx: 0 },
  { project_idx: 2, sub_idx: 1 },
  { project_idx: 6, sub_idx: 0 },
];

const insertSubDelegation = db.prepare(`
  INSERT INTO project_delegations (id, project_id, delegator_id, delegatee_id, delegatee_role, scope, status, approved_by)
  VALUES (?, ?, ?, ?, 'subcontractor', '{}', 'approved', ?)
`);

const insertDelegations = db.transaction(() => {
  for (const d of delegationData) {
    const clientId = projects[d.project_idx].client_idx === 0 ? users.clients[0].id : users.clients[1].id;
    insertDelegation.run(uuidv4(), projects[d.project_idx].id, clientId, users.contractors[d.contractor_idx].id, d.status, d.status === 'approved' ? clientId : null);
  }
  for (const sd of subdelegations) {
    const clientId = projects[sd.project_idx].client_idx === 0 ? users.clients[0].id : users.clients[1].id;
    insertSubDelegation.run(uuidv4(), projects[sd.project_idx].id, users.contractors[0].id, users.subcontractors[sd.sub_idx].id, clientId);
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
      const role = roles[Math.floor(Math.random() * roles.length)];
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
const credentialTypes = [
  { type: 'SafePass', title: 'SafePass Card', issuer: 'SOLAS Ireland' },
  { type: 'CSCS', title: 'CSCS Card', issuer: 'CITB UK' },
  { type: 'ArcFlash', title: 'Arc Flash Awareness Certificate', issuer: 'ESB Training' },
  { type: 'FirstAid', title: 'First Aid Certificate', issuer: 'Red Cross' },
  { type: 'ManualHandling', title: 'Manual Handling Certificate', issuer: 'IOSH' },
  { type: 'WorkingAtHeights', title: 'Working at Heights Certificate', issuer: 'IPAF' },
  { type: 'ConfinedSpace', title: 'Confined Space Entry Certificate', issuer: 'City & Guilds' },
  { type: 'ElectricalSafety', title: 'Electrical Safety Certificate', issuer: 'NICEIC' },
  { type: 'AsbestosAwareness', title: 'Asbestos Awareness Certificate', issuer: 'UKATA' },
  { type: 'FireMarshal', title: 'Fire Marshal Certificate', issuer: 'NFPA' },
];

const insertCredential = db.prepare(`
  INSERT INTO credentials (id, worker_id, type, title, issuer, issue_date, expiry_date, status, data, vc_hash, blockchain_tx, is_verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

let credCount = 0;
const insertCredentials = db.transaction(() => {
  users.workers.forEach(worker => {
    // Each worker gets 3-6 credentials
    const numCreds = 3 + Math.floor(Math.random() * 4);
    const selectedCreds = [...credentialTypes].sort(() => Math.random() - 0.5).slice(0, numCreds);

    selectedCreds.forEach(cred => {
      const issueDate = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      // Some expired, some expiring soon, most valid
      let expiryDate;
      const rand = Math.random();
      if (rand < 0.1) {
        expiryDate = new Date(2025, Math.floor(Math.random() * 12), 15); // Expired
      } else if (rand < 0.25) {
        expiryDate = new Date(2026, 2, Math.floor(Math.random() * 28) + 1); // Expiring soon (within 30 days of Feb 2026)
      } else {
        expiryDate = new Date(2027, Math.floor(Math.random() * 12), 15); // Valid
      }

      const vcResult = MockBlockchain.createVC(cred.type, { id: worker.id, did: MockBlockchain.createDID(worker.id) }, { id: 'platform', name: cred.issuer }, { type: cred.type, title: cred.title });

      const status = expiryDate < new Date() ? 'expired' : 'valid';
      insertCredential.run(uuidv4(), worker.id, cred.type, cred.title, cred.issuer,
        issueDate.toISOString().split('T')[0], expiryDate.toISOString().split('T')[0],
        status, JSON.stringify(vcResult.vc), vcResult.vcHash, vcResult.blockchainTx);
      credCount++;
    });
  });
});
insertCredentials();
console.log(`✓ Created ${credCount} credentials across ${users.workers.length} workers`);

// ===== BADGES =====
const badgeTypes = [
  { type: 'compliance', title: 'SafePass Refresher Complete', description: 'Completed SafePass refresher training on time' },
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

// ===== PQQ SUBMISSIONS =====
const insertPQQ = db.prepare(`
  INSERT INTO pqq_submissions (id, company_id, project_id, submitted_by, status, company_profile, financial_status, compliance_status, documents)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let pqqCount = 0;
const insertPQQs = db.transaction(() => {
  [...users.contractors, ...users.subcontractors].forEach(company => {
    const project = projects[Math.floor(Math.random() * projects.length)];
    const statuses = ['approved', 'approved', 'under_review', 'pending'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    insertPQQ.run(uuidv4(), company.id, project.id, company.id, status,
      JSON.stringify({ name: company.company_name, registration: company.company_registration, employees: Math.floor(Math.random() * 200) + 20 }),
      JSON.stringify({ creditScore: Math.floor(Math.random() * 300) + 600, turnover: `€${Math.floor(Math.random() * 50) + 5}M` }),
      JSON.stringify({ taxCompliant: true, insuranceValid: true, safetyRecord: 'clean' }),
      JSON.stringify(['insurance_cert.pdf', 'tax_clearance.pdf', 'safety_statement.pdf']));
    pqqCount++;
  });
});
insertPQQs();
console.log(`✓ Created ${pqqCount} PQQ submissions`);

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
console.log(`  Client:        client@energycorp.ie`);
console.log(`  Client (DE):   client@infradev.de`);
console.log(`  Contractor:    contractor@buildright.ie`);
console.log(`  Contractor:    contractor@euroworks.pl`);
console.log(`  Subcontractor: sub@elecspec.ie`);
console.log(`  Professional:  sean.murphy@email.ie`);
console.log(`  Professional:  piotr.kowalski@email.pl`);
console.log(`  Professional:  andrei.popescu@email.ro`);
console.log('');
