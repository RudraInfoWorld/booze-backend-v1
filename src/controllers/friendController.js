const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const friendService = require('../services/friendService');
const logger = require('../config/logger');

/**
 * Send friend request
 */
const sendFriendRequest = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { addressee_id } = req.body;
  
  const friendship = await friendService.sendFriendRequest(req.user.id, addressee_id);
  
  res.status(201).json({
    status: 'success',
    data: {
      friendship
    },
    message: 'Friend request sent successfully'
  });
});

/**
 * Accept friend request
 */
const acceptFriendRequest = catchAsync(async (req, res) => {
  const { request_id } = req.params;
  
  const friendship = await friendService.acceptFriendRequest(request_id, req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      friendship
    },
    message: 'Friend request accepted'
  });
});

/**
 * Reject friend request
 */
const rejectFriendRequest = catchAsync(async (req, res) => {
  const { request_id } = req.params;
  
  const friendship = await friendService.rejectFriendRequest(request_id, req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      friendship
    },
    message: 'Friend request rejected'
  });
});

/**
 * Block user
 */
const blockUser = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { user_id } = req.body;
  
  const friendship = await friendService.blockUser(req.user.id, user_id);
  
  res.status(200).json({
    status: 'success',
    data: {
      friendship
    },
    message: 'User blocked successfully'
  });
});

/**
 * Unblock user
 */
const unblockUser = catchAsync(async (req, res) => {
  const { user_id } = req.params;
  
  await friendService.unblockUser(req.user.id, user_id);
  
  res.status(200).json({
    status: 'success',
    message: 'User unblocked successfully'
  });
});

/**
 * Remove friend
 */
const removeFriend = catchAsync(async (req, res) => {
  const { friend_id } = req.params;
  
  await friendService.removeFriend(req.user.id, friend_id);
  
  res.status(200).json({
    status: 'success',
    message: 'Friend removed successfully'
  });
});

/**
 * Get friends list
 */
const getFriends = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  const friends = await friendService.getUserFriends(req.user.id, limit, offset);
  
  res.status(200).json({
    status: 'success',
    data: {
      friends,
      count: friends.length,
      limit,
      offset
    }
  });
});

/**
 * Get pending friend requests
 */
const getPendingRequests = catchAsync(async (req, res) => {
  const requests = await friendService.getPendingFriendRequests(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      requests,
      count: requests.length
    }
  });
});

/**
 * Get friend suggestions
 */
const getFriendSuggestions = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  const suggestions = await friendService.getFriendSuggestions(req.user.id, limit);
  
  res.status(200).json({
    status: 'success',
    data: {
      suggestions,
      count: suggestions.length
    }
  });
});

/**
 * Get friendship status with another user
 */
const getFriendshipStatus = catchAsync(async (req, res) => {
  const { user_id } = req.params;
  
  const status = await friendService.getFriendshipStatus(req.user.id, user_id);
  
  res.status(200).json({
    status: 'success',
    data: {
      status
    }
  });
});

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  blockUser,
  unblockUser,
  removeFriend,
  getFriends,
  getPendingRequests,
  getFriendSuggestions,
  getFriendshipStatus
};