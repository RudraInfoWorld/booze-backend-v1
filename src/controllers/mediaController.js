const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const mediaService = require('../services/mediaService');
const logger = require('../config/logger');

/**
 * Store media (screenshot or recording)
 */
const storeMedia = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }
  
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { room_id } = req.body;
  const { type } = req.query;
  
  const mediaData = {
    userId: req.user.id,
    roomId: room_id,
    type,
    file: req.file
  };
  
  const media = await mediaService.storeMedia(mediaData);
  
  res.status(201).json({
    status: 'success',
    data: {
      media
    },
    message: 'Media stored successfully'
  });
});

/**
 * Get user's media records
 */
const getUserMediaRecords = catchAsync(async (req, res) => {
  const type = req.query.type;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  const records = await mediaService.getUserMediaRecords(req.user.id, type, limit, offset);
  
  res.status(200).json({
    status: 'success',
    data: {
      records,
      count: records.length,
      limit,
      offset
    }
  });
});

/**
 * Get room media records
 */
const getRoomMediaRecords = catchAsync(async (req, res) => {
  const { room_id } = req.params;
  const type = req.query.type;
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  
  const records = await mediaService.getRoomMediaRecords(room_id, type, limit, offset);
  
  res.status(200).json({
    status: 'success',
    data: {
      records,
      count: records.length,
      limit,
      offset
    }
  });
});

/**
 * Delete media record
 */
const deleteMedia = catchAsync(async (req, res) => {
  const { media_id } = req.params;
  
  await mediaService.deleteMedia(media_id, req.user.id);
  
  res.status(200).json({
    status: 'success',
    message: 'Media deleted successfully'
  });
});

module.exports = {
  storeMedia,
  getUserMediaRecords,
  getRoomMediaRecords,
  deleteMedia
};