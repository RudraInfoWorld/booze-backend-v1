const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const roomService = require('../services/roomService');
const logger = require('../config/logger');

/**
 * Create room
 */
const createRoom = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const roomData = {
    name: req.body.name,
    type: req.body.type,
    hostId: req.user.id,
  };

  const room = await roomService.createRoom(roomData);

  res.status(201).json({
    status: 'success',
    data: {
      room,
    },
    message: 'Room created successfully',
  });
});

/**
 * Get room details
 */
const getRoomDetails = catchAsync(async (req, res) => {
  const { room_id } = req.params;

  const room = await roomService.getRoomDetails(room_id);

  res.status(200).json({
    status: 'success',
    data: {
      room,
    },
  });
});

/**
 * Update room
 */
const updateRoom = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const { room_id } = req.params;

  const updateData = {
    name: req.body.name,
    type: req.body.type,
    is_locked: req.body.is_locked,
  };

  // Remove undefined fields
  Object.keys(updateData).forEach((key) => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const room = await roomService.updateRoom(room_id, updateData, req.user.id);

  res.status(200).json({
    status: 'success',
    data: {
      room,
    },
    message: 'Room updated successfully',
  });
});

/**
 * Join room
 */
const joinRoom = catchAsync(async (req, res) => {
  const { room_id } = req.params;

  await roomService.joinRoom(req.user.id, room_id);

  res.status(200).json({
    status: 'success',
    message: 'Joined room successfully',
  });
});

/**
 * Leave room
 */
const leaveRoom = catchAsync(async (req, res) => {
  const { room_id } = req.params;

  await roomService.leaveRoom(req.user.id, room_id);

  res.status(200).json({
    status: 'success',
    message: 'Left room successfully',
  });
});

/**
 * Get public rooms
 */
const getPublicRooms = catchAsync(async (req, res) => {
  const filters = {
    name: req.query.name,
  };

  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;

  const rooms = await roomService.getPublicRooms(filters, limit, offset);

  res.status(200).json({
    status: 'success',
    data: {
      rooms,
      count: rooms.length,
      limit,
      offset,
    },
  });
});

/**
 * Get user's active rooms
 */
const getUserActiveRooms = catchAsync(async (req, res) => {
  const rooms = await roomService.getUserActiveRooms(req.user.id);

  res.status(200).json({
    status: 'success',
    data: {
      rooms,
      count: rooms.length,
    },
  });
});

/**
 * Request to join a locked room
 */
const requestJoinRoom = catchAsync(async (req, res) => {
  const { room_id } = req.params;

  const request = await roomService.createJoinRequest(req.user.id, room_id);

  res.status(201).json({
    status: 'success',
    data: {
      request,
    },
    message: 'Join request sent successfully',
  });
});

/**
 * Respond to join request (accept/reject)
 */
const respondToJoinRequest = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array(),
    });
  }

  const { request_id } = req.params;
  const { accept } = req.body;

  const request = await roomService.updateJoinRequest(request_id, accept);

  res.status(200).json({
    status: 'success',
    data: {
      request,
    },
    message: accept ? 'Join request accepted' : 'Join request rejected',
  });
});

/**
 * Get pending join requests for a room
 */
const getPendingJoinRequests = catchAsync(async (req, res) => {
  const { room_id } = req.params;

  const requests = await roomService.getPendingJoinRequests(room_id, req.user.id);

  res.status(200).json({
    status: 'success',
    data: {
      requests,
      count: requests.length,
    },
  });
});

module.exports = {
  createRoom,
  getRoomDetails,
  updateRoom,
  joinRoom,
  leaveRoom,
  getPublicRooms,
  getUserActiveRooms,
  requestJoinRoom,
  respondToJoinRequest,
  getPendingJoinRequests,
};
