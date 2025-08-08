const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { deleteMediaFromCloudinary } = require('../middleware/cloudinary');
const unlinkAsync = promisify(fs.unlink);

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - User object
 */
const getUserById = async (userId) => {
  try {
    const [user] = await db.query(
      `SELECT id, phone, email, username, bio, profile_picture, interests, 
      vibe_preference, account_status, mode_preference,is_admin, created_at
      FROM users WHERE id = ? AND account_status != 'deleted'`,
      [userId]
    );

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  } catch (error) {
    logger.error(`Get user error: ${error.message}`);
    throw error;
  }
};

/**
 * Get user by username
 * @param {string} username - Username
 * @returns {Promise<Object>} - User object
 */
const getUserByUsername = async (username) => {
  try {
    const [user] = await db.query(
      `SELECT id, username, bio, profile_picture, interests, 
      vibe_preference, account_status, created_at
      FROM users WHERE username = ? AND account_status != 'deleted'`,
      [username]
    );

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  } catch (error) {
    logger.error(`Get user by username error: ${error.message}`);
    throw error;
  }
};

/**
 * Check if username is available
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} - Whether username is available
 */
const isUsernameAvailable = async (username) => {
  try {
    const [user] = await db.query('SELECT id FROM users WHERE username = ?', [username]);

    return !user;
  } catch (error) {
    logger.error(`Username availability check error: ${error.message}`);
    throw new AppError('Failed to check username availability', 500);
  }
};

/**
 * Update user profile
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated user object
 */
const updateProfile = async (userId, updateData) => {
  try {
    const { username, bio, interests, vibe_preference, mode_preference, email } = updateData;

    // Check if username is being updated and is available
    if (username) {
      const [existingUser] = await db.query('SELECT id FROM users WHERE username = ? AND id != ?', [
        username,
        userId,
      ]);

      if (existingUser) {
        throw new AppError('Username already taken', 400);
      }
    }

    // Create update query
    let updateQuery = 'UPDATE users SET ';
    const updateValues = [];
    const updateFields = [];

    if (username) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }

    if (bio !== undefined) {
      updateFields.push('bio = ?');
      updateValues.push(bio);
    }

    if (interests) {
      updateFields.push('interests = ?');
      updateValues.push(JSON.stringify(interests));
    }

    if (vibe_preference) {
      updateFields.push('vibe_preference = ?');
      updateValues.push(vibe_preference);
    }

    if (mode_preference) {
      updateFields.push('mode_preference = ?');
      updateValues.push(mode_preference);
    }

    if (email) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }

    if (updateFields.length === 0) {
      return getUserById(userId);
    }

    updateQuery += updateFields.join(', ');
    updateQuery += ' WHERE id = ?';
    updateValues.push(userId);
    // Update user
    await db.query(updateQuery, updateValues);

    // Return updated user
    return getUserById(userId);
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    throw error;
  }
};

/**
 * Upload profile picture
 * @param {string} userId - User ID
 * @param {Object} file - Uploaded file object
 * @returns {Promise<Object>} - Updated user object
 */
const uploadProfilePicture = async (userId, public_id, url) => {
  try {
    // Get current profile picture
    const [user] = await db.query('SELECT profile_picture FROM users WHERE id = ?', [userId]);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Delete old profile picture if exists
    if (user.pic_id) {
      try {
        await deleteMediaFromCloudinary(user.pic_id);
      } catch (err) {
        logger.warn(`Could not delete old profile picture: ${err.message}`);
      }
    }

    // Set profile picture path in database
    await db.query('UPDATE users SET profile_picture = ? , pic_id = ? WHERE id = ?', [
      url,
      public_id,
      userId,
    ]);

    // Return updated user
    return getUserById(userId);
  } catch (error) {
    logger.error(`Upload profile picture error: ${error.message}`);
    throw error;
  }
};

/**
 * Update account status (active, ghost, private)
 * @param {string} userId - User ID
 * @param {string} status - New status
 * @returns {Promise<Object>} - Updated user object
 */
const updateAccountStatus = async (userId, status) => {
  try {
    // Validate status
    const validStatuses = ['active', 'ghost', 'private'];
    if (!validStatuses.includes(status)) {
      throw new AppError('Invalid account status', 400);
    }

    // Update status
    await db.query('UPDATE users SET account_status = ? WHERE id = ?', [status, userId]);

    // Return updated user
    return getUserById(userId);
  } catch (error) {
    logger.error(`Update account status error: ${error.message}`);
    throw error;
  }
};

/**
 * Delete user account
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteAccount = async (userId) => {
  try {
    // Set account status to deleted
    await db.query('UPDATE users SET account_status = ? WHERE id = ?', ['deleted', userId]);

    // Invalidate all sessions
    await db.query('UPDATE user_sessions SET is_active = FALSE WHERE user_id = ?', [userId]);

    return true;
  } catch (error) {
    logger.error(`Delete account error: ${error.message}`);
    throw new AppError('Failed to delete account', 500);
  }
};

/**
 * Search users by username
 * @param {string} searchTerm - Search term
 * @param {number} limit - Results limit
 * @returns {Promise<Array>} - Matching users
 */
const searchUsers = async (searchTerm, limit = 10) => {
  try {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;

    const users = await db.query(
      `SELECT id, username, bio, profile_picture FROM users 
      WHERE username LIKE ? AND account_status = 'active' 
      LIMIT ${safeLimit}`,
      [`%${searchTerm}%`]
    );

    return users;
  } catch (error) {
    logger.error(`Search users error: ${error.message}`);
    throw new AppError('Failed to search users', 500);
  }
};

/**
 * Mark user as admin
 * @param {string} userId
 * @param {boolean} isAdmin
 * @returns {Promise<boolean>} - Success status
 */
const markUserAsAdmin = async (userId, isAdmin) => {
  try {
    const isAdminValue = isAdmin == 'true' ? 1 : 0;
    const updatedUser = await db.query('UPDATE users SET is_admin = ? WHERE id = ?', [
      isAdminValue,
      userId,
    ]);
    return updatedUser;
  } catch (error) {
    logger.error(`Mark user as admin error: ${error.message}`);
    throw new AppError('Failed to mark user as admin', 500);
  }
};

module.exports = {
  getUserById,
  getUserByUsername,
  isUsernameAvailable,
  updateProfile,
  uploadProfilePicture,
  updateAccountStatus,
  deleteAccount,
  searchUsers,
  markUserAsAdmin,
};
