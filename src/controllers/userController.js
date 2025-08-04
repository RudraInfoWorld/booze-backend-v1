const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const userService = require('../services/userService');
const logger = require('../config/logger');

/**
 * Get user profile
 */
const getProfile = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

/**
 * Get user by username
 */
const getUserByUsername = catchAsync(async (req, res) => {
  const { username } = req.params;
  
  const user = await userService.getUserByUsername(username);
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

/**
 * Check username availability
 */
const checkUsername = catchAsync(async (req, res) => {
  const { username } = req.query;
  
  if (!username) {
    throw new AppError('Username is required', 400);
  }
  
  const isAvailable = await userService.isUsernameAvailable(username);
  
  res.status(200).json({
    status: 'success',
    data: {
      username,
      available: isAvailable
    }
  });
});

/**
 * Update user profile
 */
const updateProfile = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const updateData = {
    username: req.body.username,
    bio: req.body.bio,
    interests: req.body.interests,
    vibe_preference: req.body.vibe_preference,
    mode_preference: req.body.mode_preference,
    email : req.body.email
  };
  
  // Remove undefined fields
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });
  
  const updatedUser = await userService.updateProfile(req.user.id, updateData);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    },
    message: 'Profile updated successfully'
  });
});

/**
 * Upload profile picture
 */
const uploadProfilePicture = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  // TODO: UPLOAD ON CLOUDINARY AND REMOVE FROM LOCAL.
  
  const updatedUser = await userService.uploadProfilePicture(req.user.id, req.file);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    },
    message: 'Profile picture uploaded successfully'
  });
});

/**
 * Generate AI avatar
 */
const generateAIAvatar = catchAsync(async (req, res) => {
  const updatedUser = await userService.generateAIAvatar(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    },
    message: 'AI avatar generated successfully'
  });
});

/**
 * Update account status
 */
const updateAccountStatus = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { status } = req.body;
  
  const updatedUser = await userService.updateAccountStatus(req.user.id, status);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser
    },
    message: 'Account status updated successfully'
  });
});

/**
 * Delete account
 */
const deleteAccount = catchAsync(async (req, res) => {
  await userService.deleteAccount(req.user.id);
  
  res.status(200).json({
    status: 'success',
    message: 'Account deleted successfully'
  });
});

/**
 * Search users
 */
const searchUsers = catchAsync(async (req, res) => {
  const { q , limit = 10 } = req.query;
  const q_limit = parseInt(limit) || 10;
  
  if (!q) {
    throw new AppError('Search query is required', 400);
  }
  const users = await userService.searchUsers(q, q_limit);
  
  res.status(200).json({
    status: 'success',
    data: {
      users
    }
  });
});

module.exports = {
  getProfile,
  getUserByUsername,
  checkUsername,
  updateProfile,
  uploadProfilePicture,
  generateAIAvatar,
  updateAccountStatus,
  deleteAccount,
  searchUsers
};