const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Generate JWT token
 * @param {string} userId - User ID
 * @returns {string} - JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

/**
 * Generate refresh token
 * @param {string} userId - User ID
 * @returns {string} - Refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN
  });
};

/**
 * Generate a random 6-digit OTP
 * @returns {string} - 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP via SMS
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 * @returns {Promise} - Twilio API response
 */
const sendOTP = async (phone, otp) => {
  try {
    const message = await twilioClient.messages.create({
      body: `Your Booze app verification code is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    
    logger.info(`OTP sent to ${phone}: ${message.sid}`);
    return message;
  } catch (error) {
    logger.error(`Failed to send OTP: ${error.message}`);
    throw new AppError('Failed to send OTP. Please try again.', 500);
  }
};

/**
 * Request OTP for phone verification
 * @param {string} phone - Phone number
 * @returns {Promise} - OTP expiry time
 */
const requestOTP = async (phone) => {
  try {
    // Generate OTP
    const otp = generateOTP();
    
    // Calculate expiry time (5 minutes from now)
    const expiryTime = new Date();
    expiryTime.setSeconds(expiryTime.getSeconds() + parseInt(process.env.OTP_EXPIRY_TIME));
    
    // Delete any existing OTPs for this phone
    await db.query(
      'DELETE FROM otp_codes WHERE phone = ?',
      [phone]
    );
    
    // Store OTP in database
    await db.query(
      'INSERT INTO otp_codes (id, phone, code, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), phone, otp, expiryTime]
    );

    // TODO: Uncomment below line to enable sending OTP via SMS    
    // // Send OTP via SMS
    // await sendOTP(phone, otp);
    
    return {
      expiresAt: expiryTime
    };
  } catch (error) {
    logger.error(`OTP request error: ${error.message}`);
    throw new AppError('Failed to request OTP', 500);
  }
};

/**
 * Verify OTP
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 * @returns {Promise<boolean>} - Whether OTP is valid
 */
const verifyOTP = async (phone, otp) => {
  try {
    // Get OTP from database
    const [otpRecord] = await db.query(
      'SELECT id, code, expires_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1',
      [phone]
    );
    
    // Check if OTP exists
    if (!otpRecord) {
      throw new AppError('Invalid OTP or OTP expired', 400);
    }
    
    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expires_at)) {
      await db.query(
        'DELETE FROM otp_codes WHERE id = ?',
        [otpRecord.id]
      );
      throw new AppError('OTP has expired', 400);
    }
    
    // Check if OTP matches
    if (otpRecord.code !== otp) {
      throw new AppError('Invalid OTP', 400);
    }
    
    // Mark OTP as verified
    await db.query(
      'UPDATE otp_codes SET is_verified = TRUE WHERE id = ?',
      [otpRecord.id]
    );
    
    return true;
  } catch (error) {
    logger.error(`OTP verification error: ${error.message}`);
    throw error;
  }
};

/**
 * Register a new user with phone number
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - User object and tokens
 */
const registerWithPhone = async (userData) => {
  const { phone, otp } = userData;
  
  try {
    // Verify OTP
    await verifyOTP(phone, otp);
    
    // Check if user already exists
    const [existingUser] = await db.query(
      'SELECT id FROM users WHERE phone = ?',
      [phone]
    );
    
    if (existingUser) {
      throw new AppError('User with this phone number already exists', 400);
    }
    
    // Create user
    const userId = uuidv4();
    
    await db.query(
      'INSERT INTO users (id, phone) VALUES (?, ?)',
      [userId, phone]
    );
    
    // Create default notification settings
    await db.query(
      'INSERT INTO notification_settings (user_id) VALUES (?)',
      [userId]
    );
    
    // Generate tokens
    const token = generateToken(userId);
    const refreshToken = generateRefreshToken(userId);
    
    return {
      user: {
        id: userId,
        phone
      },
      token,
      refreshToken
    };
  } catch (error) {
    logger.error(`Registration error: ${error.message}`);
    throw error;
  }
};

/**
 * Login with phone number and OTP
 * @param {string} phone - Phone number
 * @param {string} otp - OTP code
 * @param {Object} deviceInfo - Device information
 * @returns {Promise<Object>} - User object and tokens
 */
const loginWithPhone = async (phone, otp, deviceInfo) => {
  try {
    // Verify OTP
    await verifyOTP(phone, otp);
    
    // Get user
    const [user] = await db.query(
      'SELECT id, phone, username, account_status FROM users WHERE phone = ?',
      [phone]
    );
    
    if (!user) {
      throw new AppError('User not found', 404);
    }
    
    if (user.account_status === 'deleted') {
      throw new AppError('This account has been deleted', 400);
    }
    
    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    
    // Create session
    const sessionId = uuidv4();
    await db.query(
      'INSERT INTO user_sessions (id, user_id, device_name, device_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, user.id, deviceInfo.deviceName, deviceInfo.deviceId, deviceInfo.ipAddress, deviceInfo.userAgent]
    );
    
    return {
      user: {
        id: user.id,
        phone: user.phone,
        username: user.username,
        status: user.account_status
      },
      token,
      refreshToken
    };
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    throw error;
  }
};

/**
 * Login with social provider
 * @param {Object} socialData - Social login data
 * @returns {Promise<Object>} - User object and tokens
 */
const loginWithSocial = async (socialData, deviceInfo) => {
  const { provider, providerId, email, name } = socialData;
  
  try {
    // Check if user exists by provider and providerId
    let [user] = await db.query(
      'SELECT id, email, username, account_status FROM users WHERE auth_provider = ? AND auth_provider_id = ?',
      [provider, providerId]
    );
    
    // If no user found but email exists, check by email
    if (!user && email) {
      [user] = await db.query(
        'SELECT id, email, username, account_status FROM users WHERE email = ?',
        [email]
      );
      
      // If user found by email, update their provider info
      if (user) {
        await db.query(
          'UPDATE users SET auth_provider = ?, auth_provider_id = ? WHERE id = ?',
          [provider, providerId, user.id]
        );
      }
    }
    
    // If still no user, create a new one
    if (!user) {
      const userId = uuidv4();
      
      await db.query(
        'INSERT INTO users (id, email, auth_provider, auth_provider_id) VALUES (?, ?, ?, ?)',
        [userId, email, provider, providerId]
      );
      
      // Create default notification settings
      await db.query(
        'INSERT INTO notification_settings (user_id) VALUES (?)',
        [userId]
      );
      
      user = {
        id: userId,
        email,
        username: null,
        account_status: 'active'
      };
    }
    
    if (user.account_status === 'deleted') {
      throw new AppError('This account has been deleted', 400);
    }
    
    // Generate tokens
    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    
    // Create session
    const sessionId = uuidv4();
    await db.query(
      'INSERT INTO user_sessions (id, user_id, device_name, device_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, user.id, deviceInfo.deviceName, deviceInfo.deviceId, deviceInfo.ipAddress, deviceInfo.userAgent]
    );
    
    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        status: user.account_status
      },
      token,
      refreshToken
    };
  } catch (error) {
    logger.error(`Social login error: ${error.message}`);
    throw error;
  }
};

/**
 * Refresh JWT token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} - New tokens
 */
const refreshToken = async (refreshToken) => {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Check if user exists
    const [user] = await db.query(
      'SELECT id FROM users WHERE id = ? AND account_status != "deleted"',
      [decoded.id]
    );
    
    if (!user) {
      throw new AppError('Invalid refresh token', 401);
    }
    
    // Generate new tokens
    const token = generateToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);
    
    return {
      token,
      refreshToken: newRefreshToken
    };
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);
    throw new AppError('Invalid refresh token', 401);
  }
};

/**
 * Logout user
 * @param {string} userId - User ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<boolean>} - Logout success
 */
const logout = async (userId, deviceId) => {
  try {
    // Invalidate session for the specific device
    if (deviceId) {
      await db.query(
        'UPDATE user_sessions SET is_active = FALSE WHERE user_id = ? AND device_id = ?',
        [userId, deviceId]
      );
    } else {
      // Invalidate all sessions for this user
      await db.query(
        'UPDATE user_sessions SET is_active = FALSE WHERE user_id = ?',
        [userId]
      );
    }
    
    return true;
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    throw new AppError('Logout failed', 500);
  }
};

/**
 * Get user's login activity
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Login sessions
 */
const getLoginActivity = async (userId) => {
  try {
    const sessions = await db.query(
      `SELECT id, device_name, device_id, ip_address, location, 
      login_time, last_active_time, is_active, user_agent 
      FROM user_sessions 
      WHERE user_id = ? 
      ORDER BY last_active_time DESC`,
      [userId]
    );
    
    return sessions;
  } catch (error) {
    logger.error(`Get login activity error: ${error.message}`);
    throw new AppError('Failed to retrieve login activity', 500);
  }
};

/**
 * Switch between active accounts
 * This is a placeholder function - actual implementation would depend on how you handle multiple accounts
 */
const switchAccount = async (userId, targetAccountId) => {
  // This would be implemented based on your multiple account management system
  throw new AppError('Not implemented', 501);
};

module.exports = {
  requestOTP,
  verifyOTP,
  registerWithPhone,
  loginWithPhone,
  loginWithSocial,
  refreshToken,
  logout,
  getLoginActivity,
  switchAccount
};