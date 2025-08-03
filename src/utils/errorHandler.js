/**
 * Custom error handler class for API errors
 * Extends the built-in Error class with additional properties
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Operational errors are expected errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Creates a custom error for async error handling in routes
 * @param {Function} fn - The async function to catch errors from
 * @returns {Function} - Express middleware function
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = {
  AppError,
  catchAsync
};