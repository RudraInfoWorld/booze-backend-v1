const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');
const socket = require('../config/socket');

// This will be lazy-loaded to avoid circular dependency
let notificationService;

/**
 * Get all available games
 * @returns {Promise<Array>} - List of games
 */
const getGames = async () => {
  try {
    const games = await db.query(
      'SELECT id, name, description, rules, min_players, max_players FROM games'
    );
    
    return games;
  } catch (error) {
    logger.error(`Get games error: ${error.message}`);
    throw new AppError('Failed to get games', 500);
  }
};

/**
 * Get game by ID
 * @param {string} gameId - Game ID
 * @returns {Promise<Object>} - Game details
 */
const getGameById = async (gameId) => {
  try {
    const [game] = await db.query(
      'SELECT id, name, description, rules, min_players, max_players FROM games WHERE id = ?',
      [gameId]
    );
    
    if (!game) {
      throw new AppError('Game not found', 404);
    }
    
    return game;
  } catch (error) {
    logger.error(`Get game error: ${error.message}`);
    throw error;
  }
};

/**
 * Create game session
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>} - Created session
 */
const createGameSession = async (sessionData) => {
  try {
    const { gameId, roomId, createdBy } = sessionData;
    
    // Validate required fields
    if (!gameId || !roomId || !createdBy) {
      throw new AppError('Game ID, room ID, and creator ID are required', 400);
    }
    
    // Check if game exists
    const [game] = await db.query(
      'SELECT id, min_players, max_players FROM games WHERE id = ?',
      [gameId]
    );
    
    if (!game) {
      throw new AppError('Game not found', 404);
    }
    
    // Check if room exists
    const [room] = await db.query(
      'SELECT id FROM rooms WHERE id = ?',
      [roomId]
    );
    
    if (!room) {
      throw new AppError('Room not found', 404);
    }
    
    // Check if user is in room
    const [participant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = TRUE',
      [roomId, createdBy]
    );
    
    if (!participant) {
      throw new AppError('You must be in the room to start a game', 403);
    }
    
    // Check for active game session of the same game in the room
    const [activeSession] = await db.query(
      `SELECT id FROM game_sessions 
      WHERE room_id = ? AND game_id = ? AND status = 'active'`,
      [roomId, gameId]
    );
    
    if (activeSession) {
      throw new AppError('A session of this game is already active in this room', 400);
    }
    
    // Create game session
    const sessionId = uuidv4();
    
    await db.query(
      `INSERT INTO game_sessions 
      (id, game_id, room_id, status, created_by) 
      VALUES (?, ?, ?, 'active', ?)`,
      [sessionId, gameId, roomId, createdBy]
    );
    
    // Add creator as first participant
    await db.query(
      'INSERT INTO game_participants (id, game_session_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), sessionId, createdBy]
    );
    
    // Get session details
    return getGameSession(sessionId);
  } catch (error) {
    logger.error(`Create game session error: ${error.message}`);
    throw error;
  }
};

/**
 * Get game session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object>} - Session details
 */
const getGameSession = async (sessionId) => {
  try {
    // Get session
    const [session] = await db.query(
      `SELECT gs.id, gs.game_id, gs.room_id, gs.status, gs.started_at, 
      g.name AS game_name, g.description AS game_description, 
      g.min_players, g.max_players
      FROM game_sessions gs
      JOIN games g ON g.id = gs.game_id
      WHERE gs.id = ?`,
      [sessionId]
    );
    
    if (!session) {
      throw new AppError('Game session not found', 404);
    }
    
    // Get participants
    const participants = await db.query(
      `SELECT gp.user_id, gp.score, gp.joined_at, u.username, u.profile_picture
      FROM game_participants gp
      JOIN users u ON u.id = gp.user_id
      WHERE gp.game_session_id = ? AND gp.left_at IS NULL`,
      [sessionId]
    );
    
    return {
      id: session.id,
      game: {
        id: session.game_id,
        name: session.game_name,
        description: session.game_description,
        min_players: session.min_players,
        max_players: session.max_players
      },
      room_id: session.room_id,
      status: session.status,
      started_at: session.started_at,
      participants: participants.map(p => ({
        user_id: p.user_id,
        username: p.username,
        profile_picture: p.profile_picture,
        score: p.score,
        joined_at: p.joined_at
      })),
      participants_count: participants.length
    };
  } catch (error) {
    logger.error(`Get game session error: ${error.message}`);
    throw error;
  }
};

/**
 * Join game session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Updated session
 */
const joinGameSession = async (sessionId, userId) => {
  try {
    // Check if session exists and is active
    const [session] = await db.query(
      `SELECT gs.id, gs.room_id, gs.status, g.max_players
      FROM game_sessions gs
      JOIN games g ON g.id = gs.game_id
      WHERE gs.id = ?`,
      [sessionId]
    );
    
    if (!session) {
      throw new AppError('Game session not found', 404);
    }
    
    if (session.status !== 'active') {
      throw new AppError('Game session is not active', 400);
    }
    
    // Check if user is in the room
    const [participant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = TRUE',
      [session.room_id, userId]
    );
    
    if (!participant) {
      throw new AppError('You must be in the room to join the game', 403);
    }
    
    // Check if user is already in the game
    const [gameParticipant] = await db.query(
      'SELECT id FROM game_participants WHERE game_session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    
    if (gameParticipant) {
      // User is already in the game
      return getGameSession(sessionId);
    }
    
    // Check if game is full
    const [participantCount] = await db.query(
      'SELECT COUNT(*) as count FROM game_participants WHERE game_session_id = ? AND left_at IS NULL',
      [sessionId]
    );
    
    if (participantCount.count >= session.max_players) {
      throw new AppError('Game is full', 400);
    }
    
    // Add user to game
    await db.query(
      'INSERT INTO game_participants (id, game_session_id, user_id) VALUES (?, ?, ?)',
      [uuidv4(), sessionId, userId]
    );
    
    // Emit player joined event
    try {
      const [user] = await db.query(
        'SELECT username, profile_picture FROM users WHERE id = ?',
        [userId]
      );
      
      socket.getIO().to(`room:${session.room_id}`).emit('game-player-joined', {
        sessionId,
        player: {
          id: userId,
          username: user.username,
          profile_picture: user.profile_picture,
          score: 0
        }
      });
    } catch (socketErr) {
      logger.error(`Socket emit error: ${socketErr.message}`);
    }
    
    return getGameSession(sessionId);
  } catch (error) {
    logger.error(`Join game session error: ${error.message}`);
    throw error;
  }
};

/**
 * Leave game session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const leaveGameSession = async (sessionId, userId) => {
  try {
    // Check if session exists
    const [session] = await db.query(
      'SELECT id, room_id, status FROM game_sessions WHERE id = ?',
      [sessionId]
    );
    
    if (!session) {
      throw new AppError('Game session not found', 404);
    }
    
    // Check if user is in the game
    const [participant] = await db.query(
      'SELECT id FROM game_participants WHERE game_session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    
    if (!participant) {
      return false; // User is not in the game
    }
    
    // Mark participant as left
    await db.query(
      'UPDATE game_participants SET left_at = NOW() WHERE id = ?',
      [participant.id]
    );
    
    // Check if there are any participants left
    const [participantCount] = await db.query(
      'SELECT COUNT(*) as count FROM game_participants WHERE game_session_id = ? AND left_at IS NULL',
      [sessionId]
    );
    
    // If no participants left, end the game session
    if (participantCount.count === 0 && session.status === 'active') {
      await db.query(
        'UPDATE game_sessions SET status = ?, ended_at = NOW() WHERE id = ?',
        ['completed', sessionId]
      );
    }
    
    // Emit player left event
    try {
      socket.getIO().to(`room:${session.room_id}`).emit('game-player-left', {
        sessionId,
        userId
      });
    } catch (socketErr) {
      logger.error(`Socket emit error: ${socketErr.message}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Leave game session error: ${error.message}`);
    throw error;
  }
};

/**
 * End game session
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID (must be creator or room host)
 * @returns {Promise<boolean>} - Success status
 */
const endGameSession = async (sessionId, userId) => {
  try {
    // Check if session exists
    const [session] = await db.query(
      `SELECT gs.id, gs.room_id, gs.created_by, gs.status, r.host_id
      FROM game_sessions gs
      JOIN rooms r ON r.id = gs.room_id
      WHERE gs.id = ?`,
      [sessionId]
    );
    
    if (!session) {
      throw new AppError('Game session not found', 404);
    }
    
    if (session.status !== 'active') {
      throw new AppError('Game session is already ended', 400);
    }
    
    // Check if user is authorized to end the game
    // Only game creator or room host can end the game
    if (session.created_by !== userId && session.host_id !== userId) {
      throw new AppError('Only the game creator or room host can end the game', 403);
    }
    
    // End the game session
    await db.query(
      'UPDATE game_sessions SET status = ?, ended_at = NOW() WHERE id = ?',
      ['completed', sessionId]
    );
    
    // Mark all participants as left
    await db.query(
      `UPDATE game_participants 
      SET left_at = NOW() 
      WHERE game_session_id = ? AND left_at IS NULL`,
      [sessionId]
    );
    
    // Emit game ended event
    try {
      socket.getIO().to(`room:${session.room_id}`).emit('game-ended', {
        sessionId,
        endedBy: userId
      });
    } catch (socketErr) {
      logger.error(`Socket emit error: ${socketErr.message}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`End game session error: ${error.message}`);
    throw error;
  }
};

/**
 * Update player score
 * @param {string} sessionId - Session ID
 * @param {string} userId - User ID
 * @param {number} score - Score to add
 * @returns {Promise<Object>} - Updated participant
 */
const updatePlayerScore = async (sessionId, userId, score) => {
  try {
    // Check if session exists and is active
    const [session] = await db.query(
      'SELECT id, room_id, status FROM game_sessions WHERE id = ? AND status = ?',
      [sessionId, 'active']
    );
    
    if (!session) {
      throw new AppError('Active game session not found', 404);
    }
    
    // Check if user is in the game
    const [participant] = await db.query(
      'SELECT id, score FROM game_participants WHERE game_session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    
    if (!participant) {
      throw new AppError('User is not in this game session', 404);
    }
    
    // Validate score
    if (typeof score !== 'number') {
      throw new AppError('Score must be a number', 400);
    }
    
    // Update score
    const newScore = participant.score + score;
    
    await db.query(
      'UPDATE game_participants SET score = ? WHERE id = ?',
      [newScore, participant.id]
    );
    
    // Emit score updated event
    try {
      socket.getIO().to(`room:${session.room_id}`).emit('game-score-updated', {
        sessionId,
        userId,
        newScore,
        scoreChange: score
      });
    } catch (socketErr) {
      logger.error(`Socket emit error: ${socketErr.message}`);
    }
    
    return {
      userId,
      score: newScore
    };
  } catch (error) {
    logger.error(`Update player score error: ${error.message}`);
    throw error;
  }
};

/**
 * Get active game sessions in room
 * @param {string} roomId - Room ID
 * @returns {Promise<Array>} - Active game sessions
 */
const getActiveGameSessionsInRoom = async (roomId) => {
  try {
    // Get active sessions
    const sessions = await db.query(
      `SELECT gs.id, gs.game_id, gs.started_at, g.name AS game_name,
      (SELECT COUNT(*) FROM game_participants WHERE game_session_id = gs.id AND left_at IS NULL) AS participants_count
      FROM game_sessions gs
      JOIN games g ON g.id = gs.game_id
      WHERE gs.room_id = ? AND gs.status = 'active'`,
      [roomId]
    );
    
    return sessions.map(s => ({
      id: s.id,
      game_id: s.game_id,
      game_name: s.game_name,
      started_at: s.started_at,
      participants_count: s.participants_count
    }));
  } catch (error) {
    logger.error(`Get active game sessions error: ${error.message}`);
    throw new AppError('Failed to get active game sessions', 500);
  }
};

/**
 * Invite user to game
 * @param {string} sessionId - Session ID
 * @param {string} inviterId - User ID inviting
 * @param {string} inviteeId - User ID being invited
 * @returns {Promise<boolean>} - Success status
 */
const inviteToGame = async (sessionId, inviterId, inviteeId) => {
  try {
    // Lazy load notification service to prevent circular dependency
    if (!notificationService) {
      notificationService = require('./notificationService');
    }
    
    // Check if session exists and is active
    const [session] = await db.query(
      `SELECT gs.id, gs.room_id, gs.status, g.name AS game_name
      FROM game_sessions gs
      JOIN games g ON g.id = gs.game_id
      WHERE gs.id = ? AND gs.status = ?`,
      [sessionId, 'active']
    );
    
    if (!session) {
      throw new AppError('Active game session not found', 404);
    }
    
    // Check if inviter is in the game
    const [inviter] = await db.query(
      'SELECT user_id FROM game_participants WHERE game_session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, inviterId]
    );
    
    if (!inviter) {
      throw new AppError('You must be in the game to invite others', 403);
    }
    
    // Check if invitee is in the room but not in the game
    const [roomParticipant] = await db.query(
      'SELECT id FROM room_participants WHERE room_id = ? AND user_id = ? AND is_active = TRUE',
      [session.room_id, inviteeId]
    );
    
    if (!roomParticipant) {
      throw new AppError('User is not in the room', 400);
    }
    
    // Check if invitee is already in the game
    const [gameParticipant] = await db.query(
      'SELECT id FROM game_participants WHERE game_session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, inviteeId]
    );
    
    if (gameParticipant) {
      throw new AppError('User is already in the game', 400);
    }
    
    // Get inviter username
    const [inviterUser] = await db.query(
      'SELECT username FROM users WHERE id = ?',
      [inviterId]
    );
    
    // Send notification to invitee
    await notificationService.createNotification({
      userId: inviteeId,
      type: 'game_invite',
      title: 'Game Invite',
      message: `${inviterUser.username} invited you to join ${session.game_name}`,
      data: {
        sessionId,
        roomId: session.room_id,
        gameId: session.game_id,
        gameName: session.game_name,
        inviterId
      }
    });
    
    // Emit game invite event
    try {
      socket.emitToUser(inviteeId, 'game-invite', {
        sessionId,
        roomId: session.room_id,
        gameName: session.game_name,
        inviterId,
        inviterUsername: inviterUser.username
      });
    } catch (socketErr) {
      logger.error(`Socket emit error: ${socketErr.message}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Invite to game error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getGames,
  getGameById,
  createGameSession,
  getGameSession,
  joinGameSession,
  leaveGameSession,
  endGameSession,
  updatePlayerScore,
  getActiveGameSessionsInRoom,
  inviteToGame
};