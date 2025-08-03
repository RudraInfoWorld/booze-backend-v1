const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/errorHandler');
const logger = require('../config/logger');
const db = require('../config/database');

/**
 * Protect routes - Verify that the user is authenticated
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from authorization header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const [user] = await db.query(
      'SELECT id, username, account_status FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user || user.account_status === 'deleted') {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // Check if token is in active sessions
    const [session] = await db.query(
      'SELECT id FROM user_sessions WHERE user_id = ? AND is_active = TRUE LIMIT 1',
      [decoded.id]
    );

    if (!session) {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }

    // Check if user changed password after token was issued
    // (Would require a password_changed_at field in the users table)

    // Grant access to protected route
    req.user = {
      id: user.id,
      username: user.username,
      status: user.account_status
    };

    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    return next(new AppError('Not authorized to access this route', 401));
  }
};

/**
 * Check if user is admin
 * This is just a placeholder - actual admin check would depend on your user roles system
 */
const authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      // Get user role from database
      const [userRole] = await db.query(
        'SELECT role FROM users WHERE id = ?',
        [req.user.id]
      );

      // Check if user role is in the allowed roles
      if (!roles.includes(userRole?.role)) {
        return next(new AppError('You do not have permission to perform this action', 403));
      }

      next();
    } catch (error) {
      logger.error(`Authorization error: ${error.message}`);
      return next(new AppError('Authorization failed', 403));
    }
  };
};

module.exports = {
  authenticate,
  authorize
};