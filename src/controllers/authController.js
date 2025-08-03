const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const authService = require('../services/authService');
const logger = require('../config/logger');

/**
 * Request OTP for phone verification
 */
const requestOTP = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { phone } = req.body;
  
  // Request OTP
  const result = await authService.requestOTP(phone);
  
  res.status(200).json({
    status: 'success',
    data: {
      expires_at: result.expiresAt
    },
    message: 'OTP sent successfully'
  });
});

/**
 * Register with phone and OTP
 */
const registerWithPhone = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { phone, otp } = req.body;
  
  // Register user
  const result = await authService.registerWithPhone({ phone, otp });
  
  res.status(201).json({
    status: 'success',
    data: {
      user: result.user,
      token: result.token,
      refresh_token: result.refreshToken
    },
    message: 'Registration successful'
  });
});

/**
 * Login with phone and OTP
 */
const loginWithPhone = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { phone, otp } = req.body;
  
  // Get device info
  const deviceInfo = {
    deviceName: req.body.device_name || 'Unknown Device',
    deviceId: req.body.device_id || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Login user
  const result = await authService.loginWithPhone(phone, otp, deviceInfo);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: result.user,
      token: result.token,
      refresh_token: result.refreshToken
    },
    message: 'Login successful'
  });
});

/**
 * Login with social provider (Google, Apple)
 */
const loginWithSocial = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { provider, provider_token, email, name } = req.body;
  
  // Validate provider
  if (!['google', 'apple'].includes(provider)) {
    throw new AppError('Invalid provider', 400);
  }
  
  // Get device info
  const deviceInfo = {
    deviceName: req.body.device_name || 'Unknown Device',
    deviceId: req.body.device_id || null,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Login with social provider
  // This is a simplified version - in a real implementation you would verify the provider_token
  // with Google or Apple to get the user ID and other details
  const socialData = {
    provider,
    providerId: req.body.provider_id, // This would be verified and obtained from provider_token
    email,
    name
  };
  
  const result = await authService.loginWithSocial(socialData, deviceInfo);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: result.user,
      token: result.token,
      refresh_token: result.refreshToken
    },
    message: 'Social login successful'
  });
});

/**
 * Refresh token
 */
const refreshToken = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { refresh_token } = req.body;
  
  // Refresh token
  const result = await authService.refreshToken(refresh_token);
  
  res.status(200).json({
    status: 'success',
    data: {
      token: result.token,
      refresh_token: result.refreshToken
    }
  });
});

/**
 * Logout
 */
const logout = catchAsync(async (req, res) => {
  const deviceId = req.body.device_id;
  
  // Logout user
  await authService.logout(req.user.id, deviceId);
  
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

/**
 * Get login activity
 */
const getLoginActivity = catchAsync(async (req, res) => {
  // Get login activity
  const sessions = await authService.getLoginActivity(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      sessions
    }
  });
});

module.exports = {
  requestOTP,
  registerWithPhone,
  loginWithPhone,
  loginWithSocial,
  refreshToken,
  logout,
  getLoginActivity
};