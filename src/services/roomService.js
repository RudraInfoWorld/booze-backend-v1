const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');
const socket = require('../config/socket');

// This will be lazy-loaded to avoid circular dependency
let notificationService;

/**
 * Create room
 * @param {Object} roomData - Room data
 * @returns {Promise<Object>} - Created room
 */
const createRoom = async (roomData) => {
  try {
    const { name, type, hostId } = roomData;
    
    if (!name || !hostId) {
      throw new AppError('Room name and host ID are required', 400);
    }
    
    // Validate room type
    const validTypes = ['public', 'private'];
    if (type && !validTypes.includes(type)) {
      throw new AppError('Invalid room type', 400);
    }
    
    // Create room
    const roomId = uuidv4();

    const isRoomExists = await db.query(
      'SELECT id FROM rooms WHERE host_id = ? and name = ?',
      [hostId ,name]
    );

    if (isRoomExists?.length > 0) {
      throw new AppError('Room with the same name already exists', 400);
    }
    
    await db.query(
      'INSERT INTO rooms (id, name, type, host_id) VALUES (?, ?, ?, ?)',
      [roomId, name, type || 'public', hostId]
    );
    
    // Add host as participant
    await db.query(
      'INSERT INTO room_participants (id, room_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), roomId, hostId]
    );
    
    // Get room details
    return getRoomDetails(roomId);
  } catch (error) {
    logger.error(`Create room error: ${error.message}`);
    throw error;
  }
};

/**
 * Get room details
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} - Room details
 */
const getRoomDetails = async (roomId) => {
  try {
    // Get room
    const [room] = await db.query(
      `SELECT r.id, r.name, r.type, r.is_locked, r.host_id, r.created_at,
      u.username AS host_username, u.profile_picture AS host_profile_picture
      FROM rooms r
      JOIN users u ON u.id = r.host_id
      WHERE r.id = ?`,
      [roomId]
    );
    
    if (!room) {
      throw new AppError('Room not found', 404);
    }
    
    // Get active participants
    const participants = await db.query(
      `SELECT rp.user_id, rp.joined_at, u.username, u.profile_picture
      FROM room_participants rp
      JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ? AND rp.is_active = TRUE`,
      [roomId]
    );
    
    // Get active game sessions
    const gameSessions = await db.query(
      `SELECT gs.id, gs.game_id, gs.started_at, g.name AS game_name
      FROM game_sessions gs
      JOIN games g ON g.id = gs.game_id
      WHERE gs.room_id = ? AND gs.status = 'active'`,
      [roomId]
    );
    
    // Format response
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      is_locked: !!room.is_locked,
      created_at: room.created_at,
      host: {
        id: room.host_id,
        username: room.host_username,
        profile_picture: room.host_profile_picture
      },
      participants: participants.map(p => ({
        id: p.user_id,
        username: p.username,
        profile_picture: p.profile_picture,
        joined_at: p.joined_at
      })),
      active_games: gameSessions.map(g => ({
        id: g.id,
        game_id: g.game_id,
        name: g.game_name,
        started_at: g.started_at
      })),
      participants_count: participants.length
    };
  } catch (error) {
    logger.error(`Get room details error: ${error.message}`);
    throw error;
  }
};

/**
 * Update room
 * @param {string} roomId - Room ID
 * @param {Object} updateData - Data to update
 * @param {string} userId - User making the update
 * @returns {Promise<Object>} - Updated room
 */
const updateRoom = async (roomId, updateData, userId) => {
  try {
    // Check if room exists
    const [room] = await db.query(
      'SELECT id, host_id FROM rooms WHERE id = ?',
      [roomId]
    );
    
    if (!room) {
      throw new AppError('Room not found', 404);
    }
    
    // Check if user is host
    if (room.host_id !== userId) {
      throw new AppError('Only the room host can update the room', 403);
    }

    if(updateData?.name) {
      const isRoomExists = await db.query(
        `SELECT id FROM rooms WHERE host_id = ? and name like "%${updateData?.name}%"`,
        [userId ]
      );
    
      if (isRoomExists?.length > 0) {
        throw new AppError('Room with the same name already exists', 400);
      }
    }
    
    // Prepare update query
    let updateQuery = 'UPDATE rooms SET ';
    const updateValues = [];
    const updateFields = [];
    
    // Add fields to update
    if (updateData.name) {
      updateFields.push('name = ?');
      updateValues.push(updateData.name);
    }
    
    if (updateData.type !== undefined) {
      if (!['public', 'private'].includes(updateData.type)) {
        throw new AppError('Invalid room type', 400);
      }
      updateFields.push('type = ?');
      updateValues.push(updateData.type);
    }
    
    if (updateData.is_locked !== undefined) {
      updateFields.push('is_locked = ?');
      updateValues.push(updateData.is_locked ? 1 : 0);
    }
    
    if (updateFields.length === 0) {
      return getRoomDetails(roomId);
    }
    
    // Complete update query
    updateQuery += updateFields.join(', ');
    updateQuery += ' WHERE id = ?';
    updateValues.push(roomId);
    
    // Update room
    await db.query(updateQuery, updateValues);
    
    // Emit room update event via socket
    try {
      const io = socket.getIO();
      io.to(`room:${roomId}`).emit('room-updated', {
        roomId,
        updates: updateData
      });
    } catch (socketErr) {
      logger.error(`Socket emit error: ${socketErr.message}`);
    }
    
    // Get updated room
    return getRoomDetails(roomId);
  } catch (error) {
    logger.error(`Update room error: ${error.message}`);
    throw error;
  }
};

/**
 * Join room
 * @param {string} userId - User ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} - Room participant
 */
const joinRoom = async (userId, roomId) => {
  try {
    // Check if room exists
    const [room] = await db.query(
      'SELECT id, is_locked FROM rooms WHERE id = ?',
      [roomId]
    );
    
    if (!room) {
      throw new AppError('Room not found', 404);
    }
    
    // Check if room is locked
    if (room.is_locked) {
      // Check if user has an accepted join request
      const [joinRequest] = await db.query(
        `SELECT id FROM room_join_requests 
        WHERE room_id = ? AND user_id = ? AND status = 'accepted'`,
        [roomId, userId]
      );
      
      if (!joinRequest) {
        throw new AppError('Room is locked. Request to join or use an invite.', 403);
      }
      
      // Delete the join request as it's now fulfilled
      await db.query(
        'DELETE FROM room_join_requests WHERE id = ?',
        [joinRequest.id]
      );
    }
    
    // Check if user is already an active participant
    const [existingParticipant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = TRUE',
      [roomId, userId]
    );
    
    if (existingParticipant) {
      // Update last activity time if needed
      return {
        roomId,
        userId,
        joined_at: new Date()
      };
    }
    
    // Check if user was previously in the room but left
    const [inactiveParticipant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = FALSE',
      [roomId, userId]
    );
    
    if (inactiveParticipant) {
      // Reactivate participant
      await db.query(
        'UPDATE room_participants SET is_active = TRUE, left_at = NULL, joined_at = NOW() WHERE id = ?',
        [inactiveParticipant.id]
      );
    } else {
      // Add new participant
      await db.query(
        'INSERT INTO room_participants (id, room_id, user_id) VALUES (?, ?, ?)',
        [uuidv4(), roomId, userId]
      );
    }
    
    return {
      roomId,
      userId,
      joined_at: new Date()
    };
  } catch (error) {
    logger.error(`Join room error: ${error.message}`);
    throw error;
  }
};

/**
 * Leave room
 * @param {string} userId - User ID
 * @param {string} roomId - Room ID
 * @returns {Promise<boolean>} - Success status
 */
const leaveRoom = async (userId, roomId) => {
  try {
    // Check if user is in room
    const [participant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = TRUE',
      [roomId, userId]
    );
    
    if (!participant) {
      return false; // User is not in room
    }
    
    // Mark participant as inactive
    await db.query(
      'UPDATE room_participants SET is_active = FALSE, left_at = NOW() WHERE id = ?',
      [participant.id]
    );
    
    // Check if there are any active participants left
    const [activeParticipantsCount] = await db.query(
      'SELECT COUNT(*) as count FROM room_participants WHERE room_id = ? AND is_active = TRUE',
      [roomId]
    );
    
    // If room is empty, check if it should be automatically closed
    // This could be based on room settings or other criteria
    if (activeParticipantsCount.count === 0) {
      // For now, we'll just log it - you could delete the room or mark it as inactive
      logger.info(`Room ${roomId} is now empty`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Leave room error: ${error.message}`);
    throw new AppError('Failed to leave room', 500);
  }
};

/**
 * Get public rooms
 * @param {Object} filters - Filter options
 * @param {number} limit - Results limit
 * @param {number} offset - Results offset
 * @returns {Promise<Array>} - Public rooms
 */
const getPublicRooms = async (filters = {}, limit = 20, offset = 0) => {
  try {
    // Build query
    let query = `
      SELECT r.id, r.name, r.type, r.is_locked, r.host_id, r.created_at,
      u.username AS host_username, u.profile_picture AS host_profile_picture,
      (SELECT COUNT(*) FROM room_participants WHERE room_id = r.id AND is_active = TRUE) AS participants_count
      FROM rooms r
      JOIN users u ON u.id = r.host_id
      WHERE r.type = 'public'
    `;
    
    const params = [];
    
    // Add filters
    if (filters.name) {
      query += ' AND r.name LIKE ?';
      params.push(`%${filters.name}%`);
    }
    
    // Add sorting
    query += ' ORDER BY participants_count DESC, r.created_at DESC';
    
    // Add pagination
    query += ` LIMIT ${limit} OFFSET ${offset}`;

    // Execute query
    const rooms = await db.query(query, params);
    
    // Get active games for each room
    const roomsWithGames = await Promise.all(rooms.map(async (room) => {
      const activeGames = await db.query(
        `SELECT gs.id, gs.game_id, g.name AS game_name
        FROM game_sessions gs
        JOIN games g ON g.id = gs.game_id
        WHERE gs.room_id = ? AND gs.status = 'active'`,
        [room.id]
      );
      
      return {
        id: room.id,
        name: room.name,
        type: room.type,
        is_locked: !!room.is_locked,
        created_at: room.created_at,
        host: {
          id: room.host_id,
          username: room.host_username,
          profile_picture: room.host_profile_picture
        },
        participants_count: room.participants_count,
        active_games: activeGames.map(g => ({
          id: g.id,
          game_id: g.game_id,
          name: g.game_name
        }))
      };
    }));
    
    return roomsWithGames;
  } catch (error) {
    logger.error(`Get public rooms error: ${error.message}`);
    throw new AppError('Failed to get public rooms', 500);
  }
};

/**
 * Get user's active rooms
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Active rooms
 */
const getUserActiveRooms = async (userId) => {
  try {
    // Get active rooms
    const rooms = await db.query(
      `SELECT r.id, r.name, r.type, r.is_locked, r.host_id, r.created_at
      FROM rooms r
      JOIN room_participants rp ON rp.room_id = r.id
      WHERE rp.user_id = ? AND rp.is_active = TRUE`,
      [userId]
    );
    
    return rooms;
  } catch (error) {
    logger.error(`Get user active rooms error: ${error.message}`);
    throw new AppError('Failed to get active rooms', 500);
  }
};

/**
 * Create join request for locked room
 * @param {string} userId - User ID
 * @param {string} roomId - Room ID
 * @returns {Promise<Object>} - Join request
 */
const createJoinRequest = async (userId, roomId) => {
  try {
    // Lazy load notification service to prevent circular dependency
    if (!notificationService) {
      notificationService = require('./notificationService');
    }
    
    // Check if room exists and is locked
    const [room] = await db.query(
      'SELECT id, host_id, is_locked FROM rooms WHERE id = ?',
      [roomId]
    );
    
    if (!room) {
      throw new AppError('Room not found', 404);
    }
    
    if (!room.is_locked) {
      throw new AppError('Room is not locked, you can join directly', 400);
    }
    
    // Check if user already has a pending request
    const [existingRequest] = await db.query(
      `SELECT id FROM room_join_requests 
      WHERE room_id = ? AND user_id = ? AND status = 'pending'`,
      [roomId, userId]
    );
    
    if (existingRequest) {
      throw new AppError('Join request already pending', 400);
    }
    
    // Create join request
    const requestId = uuidv4();
    
    await db.query(
      'INSERT INTO room_join_requests (id, room_id, user_id) VALUES (?, ?, ?)',
      [requestId, roomId, userId]
    );
    
    // Get user info for notification
    const [user] = await db.query(
      'SELECT username FROM users WHERE id = ?',
      [userId]
    );
    
    // Notify room host
    await notificationService.createNotification({
      userId: room.host_id,
      type: 'room_join_request',
      title: 'Room Join Request',
      message: `${user.username} wants to join your room`,
      data: {
        requestId,
        roomId,
        userId
      }
    });
    
    return {
      id: requestId,
      roomId,
      userId,
      status: 'pending',
      created_at: new Date()
    };
  } catch (error) {
    logger.error(`Create join request error: ${error.message}`);
    throw error;
  }
};

/**
 * Update join request
 * @param {string} requestId - Request ID
 * @param {boolean} accept - Whether to accept
 * @returns {Promise<Object>} - Updated request
 */
const updateJoinRequest = async (requestId, accept) => {
  try {
    // Lazy load notification service to prevent circular dependency
    if (!notificationService) {
      notificationService = require('./notificationService');
    }
    
    // Get join request
    const [request] = await db.query(
      `SELECT id, room_id, user_id, status 
      FROM room_join_requests 
      WHERE id = ?`,
      [requestId]
    );
    
    if (!request) {
      throw new AppError('Join request not found', 404);
    }
    
    if (request.status !== 'pending') {
      throw new AppError('Join request already processed', 400);
    }
    
    // Update request status
    await db.query(
      'UPDATE room_join_requests SET status = ? WHERE id = ?',
      [accept ? 'accepted' : 'rejected', requestId]
    );
    
    // If accepted, notify user
    if (accept) {
      // Get room info
      const [room] = await db.query(
        'SELECT name FROM rooms WHERE id = ?',
        [request.room_id]
      );
      
      // Notify user
      await notificationService.createNotification({
        userId: request.user_id,
        type: 'room_join_request',
        title: 'Room Join Request Accepted',
        message: `Your request to join "${room.name}" has been accepted`,
        data: {
          requestId,
          roomId: request.room_id
        }
      });
      
      // Emit socket event
      try {
        socket.emitToUser(request.user_id, 'room-join-accepted', {
          requestId,
          roomId: request.room_id
        });
      } catch (socketErr) {
        logger.error(`Socket emit error: ${socketErr.message}`);
      }
    }
    
    return {
      id: requestId,
      roomId: request.room_id,
      userId: request.user_id,
      status: accept ? 'accepted' : 'rejected'
    };
  } catch (error) {
    logger.error(`Update join request error: ${error.message}`);
    throw error;
  }
};

/**
 * Check if user can join room
 * @param {string} userId - User ID
 * @param {string} roomId - Room ID
 * @returns {Promise<boolean>} - Whether user can join
 */
const canUserJoinRoom = async (userId, roomId) => {
  try {
    // Get room
    const [room] = await db.query(
      'SELECT is_locked, host_id FROM rooms WHERE id = ?',
      [roomId]
    );
    
    if (!room) {
      return false;
    }
    
    // Host can always join
    if (room.host_id === userId) {
      return true;
    }
    
    // If room is not locked, anyone can join
    if (!room.is_locked) {
      return true;
    }
    
    // Check for accepted join request
    const [joinRequest] = await db.query(
      `SELECT id FROM room_join_requests 
      WHERE room_id = ? AND user_id = ? AND status = 'accepted'`,
      [roomId, userId]
    );
    
    return !!joinRequest;
  } catch (error) {
    logger.error(`Check user can join room error: ${error.message}`);
    return false;
  }
};

/**
 * Get pending join requests for room
 * @param {string} roomId - Room ID
 * @param {string} hostId - Host ID
 * @returns {Promise<Array>} - Pending join requests
 */
const getPendingJoinRequests = async (roomId, hostId) => {
  try {
    // Check if user is room host
    const [room] = await db.query(
      'SELECT id FROM rooms WHERE id = ? AND host_id = ?',
      [roomId, hostId]
    );
    
    if (!room) {
      throw new AppError('Room not found or you are not the host', 404);
    }
    
    // Get pending requests
    const requests = await db.query(
      `SELECT rjr.id, rjr.user_id, rjr.created_at, u.username, u.profile_picture
      FROM room_join_requests rjr
      JOIN users u ON u.id = rjr.user_id
      WHERE rjr.room_id = ? AND rjr.status = 'pending'
      ORDER BY rjr.created_at ASC`,
      [roomId]
    );
    
    return requests.map(r => ({
      id: r.id,
      user: {
        id: r.user_id,
        username: r.username,
        profile_picture: r.profile_picture
      },
      created_at: r.created_at
    }));
  } catch (error) {
    logger.error(`Get pending join requests error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  createRoom,
  getRoomDetails,
  updateRoom,
  joinRoom,
  leaveRoom,
  getPublicRooms,
  getUserActiveRooms,
  createJoinRequest,
  updateJoinRequest,
  canUserJoinRoom,
  getPendingJoinRequests
};