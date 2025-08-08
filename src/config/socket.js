const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

// Import services
let roomService;
let notificationService;

// Socket instance
let io;

// Connected users map
const connectedUsers = new Map(); // userId -> Set of socket IDs
const socketToUser = new Map(); // socketId -> userId

// Initialize socket.io server
const initializeSocket = (server) => {
  // Lazy load services to avoid circular dependencies
  roomService = require('../services/roomService');
  notificationService = require('../services/notificationService');

  io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: Token not provided'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;

      return next();
    } catch (error) {
      logger.error(`Socket authentication error: ${error.message}`);
      return next(new Error('Authentication error'));
    }
  });

  // Handle socket connections
  io.on('connection', (socket) => {
    const userId = socket.userId;

    // Add to connected users map
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);
    socketToUser.set(socket.id, userId);

    logger.info(`User ${userId} connected with socket ${socket.id}`);

    // Emit user online status to friends
    emitUserStatus(userId, true);

    // Join personal room for direct messages
    socket.join(`user:${userId}`);

    // Handle room joining
    socket.on('join-room', async (roomId) => {
      try {
        // Check if user can join room
        const canJoin = await roomService.canUserJoinRoom(userId, roomId);

        if (canJoin) {
          socket.join(`room:${roomId}`);

          // Notify room participants about new user
          socket.to(`room:${roomId}`).emit('user-joined', {
            userId,
            roomId,
            timestamp: new Date(),
          });

          // Update room participant status
          await roomService.joinRoom(userId, roomId);

          // Get current room data and send to the user
          const roomData = await roomService.getRoomDetails(roomId);
          socket.emit('room-data', roomData);

          logger.info(`User ${userId} joined room ${roomId}`);
        } else {
          socket.emit('room-join-error', {
            message: 'Cannot join room. Room may be locked or you need an invitation.',
          });
        }
      } catch (error) {
        logger.error(`Error joining room: ${error.message}`);
        socket.emit('room-join-error', { message: 'Failed to join room' });
      }
    });

    // Handle room leaving
    socket.on('leave-room', async (roomId) => {
      try {
        socket.leave(`room:${roomId}`);

        // Update room participant status
        await roomService.leaveRoom(userId, roomId);

        // Notify room participants about user leaving
        socket.to(`room:${roomId}`).emit('user-left', {
          userId,
          roomId,
          timestamp: new Date(),
        });

        logger.info(`User ${userId} left room ${roomId}`);
      } catch (error) {
        logger.error(`Error leaving room: ${error.message}`);
      }
    });

    // Handle room messages
    socket.on('room-message', async (data) => {
      try {
        const { roomId, message } = data;

        // TODO: Save message to database if needed

        // Broadcast message to room
        io.to(`room:${roomId}`).emit('room-message', {
          userId,
          roomId,
          message,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error(`Error sending room message: ${error.message}`);
      }
    });

    // Handle game events
    socket.on('game-event', (data) => {
      try {
        const { roomId, gameId, eventType, eventData } = data;

        // Broadcast game event to room
        socket.to(`room:${roomId}`).emit('game-event', {
          userId,
          gameId,
          eventType,
          eventData,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error(`Error handling game event: ${error.message}`);
      }
    });

    // Handle join requests for locked rooms
    socket.on('request-room-join', async (roomId) => {
      try {
        // Create join request
        const request = await roomService.createJoinRequest(userId, roomId);

        // Get room host
        const room = await roomService.getRoomDetails(roomId);

        // Notify room host
        if (room && room.host) {
          // Send notification to host
          await notificationService.createNotification({
            userId: room.host.id,
            type: 'room_join_request',
            title: 'Room Join Request',
            message: `User wants to join your room`,
            data: {
              requestId: request.id,
              roomId,
              userId,
            },
          });

          // Emit socket event to host
          emitToUser(room.host.id, 'room-join-request', {
            requestId: request.id,
            roomId,
            userId,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error(`Error handling room join request: ${error.message}`);
        socket.emit('request-join-error', { message: 'Failed to request room join' });
      }
    });

    // Handle room join request response
    socket.on('respond-join-request', async (data) => {
      try {
        const { requestId, accept } = data;

        // Update request status in database
        const request = await roomService.updateJoinRequest(
          requestId,
          accept ? 'accepted' : 'rejected'
        );

        if (request && accept) {
          // Notify requesting user that they can join
          emitToUser(request.userId, 'join-request-accepted', {
            requestId,
            roomId: request.roomId,
          });

          // Send notification
          await notificationService.createNotification({
            userId: request.userId,
            type: 'room_join_request',
            title: 'Room Join Request Accepted',
            message: `Your request to join the room has been accepted`,
            data: {
              requestId,
              roomId: request.roomId,
            },
          });
        } else if (request) {
          // Notify requesting user that they were rejected
          emitToUser(request.userId, 'join-request-rejected', {
            requestId,
            roomId: request.roomId,
          });
        }
      } catch (error) {
        logger.error(`Error handling join request response: ${error.message}`);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        // Remove from connected users map
        const userSockets = connectedUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            connectedUsers.delete(userId);
            // Emit user offline status to friends
            emitUserStatus(userId, false);
          }
        }

        // Remove from socketToUser map
        socketToUser.delete(socket.id);

        // Auto-leave from all rooms
        const userRooms = await roomService.getUserActiveRooms(userId);
        for (const room of userRooms) {
          await roomService.leaveRoom(userId, room.id);

          // Notify room participants
          io.to(`room:${room.id}`).emit('user-left', {
            userId,
            roomId: room.id,
            timestamp: new Date(),
            reason: 'disconnected',
          });
        }

        logger.info(`User ${userId} disconnected from socket ${socket.id}`);
      } catch (error) {
        logger.error(`Error handling disconnect: ${error.message}`);
      }
    });
  });

  logger.info('Socket.io server initialized');
  return io;
};

// Get socket.io instance
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

// Check if user is online
const isUserOnline = (userId) => {
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
};

// Emit event to specific user across all their connections
const emitToUser = (userId, event, data) => {
  if (isUserOnline(userId)) {
    const userSockets = connectedUsers.get(userId);
    for (const socketId of userSockets) {
      getIO().to(socketId).emit(event, data);
    }
    return true;
  }
  return false;
};

// Emit user online/offline status to friends
const emitUserStatus = async (userId, isOnline) => {
  try {
    // TODO: Get user's friends from a service
    // For now we'll leave this as a placeholder
    // const friendIds = await friendService.getUserFriendIds(userId);
    // for (const friendId of friendIds) {
    //   emitToUser(friendId, 'friend-status-change', {
    //     userId,
    //     isOnline,
    //     timestamp: new Date()
    //   });
    // }
  } catch (error) {
    logger.error(`Error emitting user status: ${error.message}`);
  }
};

module.exports = {
  initializeSocket,
  getIO,
  isUserOnline,
  emitToUser,
};
