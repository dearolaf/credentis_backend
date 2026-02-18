const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database (creates tables on first run)
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:5173', '*'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/credentials', require('./routes/credentials'));
app.use('/api/badges', require('./routes/badges'));
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/consent', require('./routes/consent'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'Credentis',
    version: '1.0.0-poc',
    timestamp: new Date().toISOString(),
    blockchain: 'hyperledger-fabric-testnet (mock)',
    features: [
      'Digital Identity & DID',
      'Verifiable Credentials (W3C)',
      'Blockchain Anchoring',
      'RBAC',
      'GDPR Consent Management',
      'Audit Trail',
      'Badges & Awards',
      'PQQ Onboarding'
    ]
  });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
  const users = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all();
  const projects = db.prepare('SELECT status, COUNT(*) as count FROM projects GROUP BY status').all();
  const credentials = db.prepare('SELECT status, COUNT(*) as count FROM credentials GROUP BY status').all();
  const badges = db.prepare('SELECT COUNT(*) as count FROM badges').get();
  const awards = db.prepare('SELECT COUNT(*) as count FROM awards').get();
  const auditEntries = db.prepare('SELECT COUNT(*) as count FROM audit_log').get();

  res.json({
    success: true,
    data: { users, projects, credentials, badges: badges.count, awards: awards.count, auditEntries: auditEntries.count },
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Credentis Platform API Server`);
  console.log(`  Running on http://127.0.0.1:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Blockchain: Hyperledger Fabric (testnet mock)`);
  console.log(`========================================\n`);
});


module.exports = app;
