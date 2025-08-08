const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { uploadMediaToCloudinary, deleteMediaFromCloudinary } = require('../middleware/cloudinary');
const unlinkAsync = promisify(fs.unlink);

/**
 * Store screenshot or recording
 * @param {Object} mediaData - Media data
 * @returns {Promise<Object>} - Stored media record
 */
const storeMedia = async (mediaData) => {
  try {
    const { userId, roomId, type, file } = mediaData;
    
    if (!userId || !roomId || !type || !file) {
      throw new AppError('User ID, room ID, type, and file are required', 400);
    }
    
    // Validate media type
    const validTypes = ['screenshot', 'recording'];
    if (!validTypes.includes(type)) {
      throw new AppError('Invalid media type', 400);
    }
    
    // Check if user is in room
    const [participant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = TRUE',
      [roomId, userId]
    );
    
    if (!participant) {
      throw new AppError('You must be in the room to save media', 403);
    }
    //upload media to cloudinary
    const uploadedFile =  await uploadMediaToCloudinary(file, type)
    const { public_id = null ,  url = null  } = uploadedFile || {};
    // Create media record
    const mediaId = uuidv4();
    
    await db.query(
      'INSERT INTO media_records (id, user_id, room_id, type, file_path , file_id) VALUES (?, ?, ?, ?, ?, ?)',
      [mediaId, userId, roomId, type, url, public_id]
    );
    
    return {
      id: mediaId,
      userId,
      roomId,
      type,
      file_path: url,
      file_id: public_id,
      created_at: new Date()
    };
  } catch (error) {
    logger.error(`Store media error: ${error.message}`);
    throw error;
  }
};

/**
 * Get user's media records
 * @param {string} userId - User ID
 * @param {string} type - Optional media type filter
 * @param {number} limit - Results limit
 * @param {number} offset - Results offset
 * @returns {Promise<Array>} - Media records
 */
const getUserMediaRecords = async (userId, type = null, limit = 20, offset = 0) => {
  try {
    // Build query
    let query = `
      SELECT m.id, m.room_id, m.type, m.file_path, m.created_at,
      r.name AS room_name
      FROM media_records m
      JOIN rooms r ON r.id = m.room_id
      WHERE m.user_id = ?
    `;
    
    const params = [userId];
    
    if (type) {
      // Validate media type
      const validTypes = ['screenshot', 'recording'];
      if (!validTypes.includes(type)) {
        throw new AppError('Invalid media type', 400);
      }
      
      query += ' AND m.type = ?';
      params.push(type);
    }
    
    query += ` ORDER BY m.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    
    // Execute query
    const records = await db.query(query, params);
    
    return records.map(r => ({
      id: r.id,
      room_id: r.room_id,
      room_name: r.room_name,
      type: r.type,
      file_path: r.file_path,
      url: `${process.env.API_URL}/${r.file_path}`,
      created_at: r.created_at
    }));
  } catch (error) {
    logger.error(`Get user media records error: ${error.message}`);
    throw new AppError('Failed to get media records', 500);
  }
};

/**
 * Get room media records
 * @param {string} roomId - Room ID
 * @param {string} type - Optional media type filter
 * @param {number} limit - Results limit
 * @param {number} offset - Results offset
 * @returns {Promise<Array>} - Media records
 */
const getRoomMediaRecords = async (roomId, type = null, limit = 20, offset = 0) => {
  try {
    // Build query
    let query = `
      SELECT m.id, m.user_id, m.type, m.file_path, m.created_at,
      u.username
      FROM media_records m
      JOIN users u ON u.id = m.user_id
      WHERE m.room_id = ?
    `;
    
    const params = [roomId];
    
    if (type) {
      // Validate media type
      const validTypes = ['screenshot', 'recording'];
      if (!validTypes.includes(type)) {
        throw new AppError('Invalid media type', 400);
      }
      
      query += ' AND m.type = ?';
      params.push(type);
    }
    
    query += ` ORDER BY m.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    
    // Execute query
    const records = await db.query(query, params);
    
    return records.map(r => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username,
      type: r.type,
      file_path: r.file_path,
      url: `${process.env.API_URL}/${r.file_path}`,
      created_at: r.created_at
    }));
  } catch (error) {
    logger.error(`Get room media records error: ${error.message}`);
    throw new AppError('Failed to get media records', 500);
  }
};

/**
 * Delete media record
 * @param {string} mediaId - Media ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteMedia = async (mediaId, userId) => {
  try {
    // Check if media record exists and belongs to user
    const [media] = await db.query(
      'SELECT id, file_path , file_id FROM media_records WHERE id = ? AND user_id = ?',
      [mediaId, userId]
    );
    
    if (!media) {
      throw new AppError('Media record not found or you do not have permission', 404);
    }
    
    // Delete file
    if (media.file_id) {
      try {
        await deleteMediaFromCloudinary(media.file_id);
      } catch (error) {
        logger.warn(`Could not delete file: ${error.message}`);
      }
    }
    
    // Delete record from database
    await db.query(
      'DELETE FROM media_records WHERE id = ?',
      [mediaId]
    );
    
    return true;
  } catch (error) {
    logger.error(`Delete media error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  storeMedia,
  getUserMediaRecords,
  getRoomMediaRecords,
  deleteMedia
};