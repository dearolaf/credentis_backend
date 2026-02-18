/**
 * Role-Based Access Control Middleware
 */

/**
 * Require specific roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`
      });
    }

    next();
  };
}

/**
 * Check if user has access to a specific project
 */
function requireProjectAccess(req, res, next) {
  const db = require('../config/database');
  const projectId = req.params.projectId || req.body.project_id;
  
  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: 'Project ID required.'
    });
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found.'
    });
  }

  // Client owns the project
  if (req.user.role === 'client' && project.client_id === req.user.id) {
    req.project = project;
    return next();
  }

  // Check delegation for contractor/subcontractor
  if (['contractor', 'subcontractor'].includes(req.user.role)) {
    const delegation = db.prepare(
      'SELECT * FROM project_delegations WHERE project_id = ? AND delegatee_id = ? AND status = ?'
    ).get(projectId, req.user.id, 'approved');

    if (delegation) {
      req.project = project;
      req.delegation = delegation;
      return next();
    }
  }

  // Workers assigned to project
  if (req.user.role === 'worker') {
    const assignment = db.prepare(
      'SELECT * FROM project_assignments WHERE project_id = ? AND worker_id = ? AND status IN (?, ?, ?)'
    ).get(projectId, req.user.id, 'approved', 'active', 'completed');

    if (assignment) {
      req.project = project;
      req.assignment = assignment;
      return next();
    }
  }

  // Admin has full access
  if (req.user.role === 'admin') {
    req.project = project;
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied to this project.'
  });
}

module.exports = { requireRole, requireProjectAccess };
