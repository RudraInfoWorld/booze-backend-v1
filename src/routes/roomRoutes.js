const express = require('express');
const { body } = require('express-validator');
const roomController = require('../controllers/roomController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/rooms
 * @desc Create room
 * @access Private
 */
router.post(
  '/',
  [
    body('name').notEmpty().withMessage('Room name is required')
      .isLength({ min: 3, max: 50 }).withMessage('Room name must be between 3 and 50 characters'),
    body('type').optional()
      .isIn(['public', 'private']).withMessage('Room type must be public or private')
  ],
  roomController.createRoom
);

/**
 * @route GET /api/rooms/:room_id
 * @desc Get room details
 * @access Private
 */
router.get(
  '/:room_id',
  roomController.getRoomDetails
);

/**
 * @route PUT /api/rooms/:room_id
 * @desc Update room
 * @access Private
 */
router.put(
  '/:room_id',
  [
    body('name').optional()
      .isLength({ min: 3, max: 50 }).withMessage('Room name must be between 3 and 50 characters'),
    body('type').optional()
      .isIn(['public', 'private']).withMessage('Room type must be public or private'),
    body('is_locked').optional()
      .isBoolean().withMessage('is_locked must be a boolean')
  ],
  roomController.updateRoom
);

/**
 * @route POST /api/rooms/:room_id/join
 * @desc Join room
 * @access Private
 */
router.post(
  '/join/:room_id',
  roomController.joinRoom
);

/**
 * @route POST /api/rooms/:room_id/leave
 * @desc Leave room
 * @access Private
 */
router.post(
  '/leave/:room_id',
  roomController.leaveRoom
);

/**
 * @route GET /api/rooms
 * @desc Get public rooms
 * @access Private
 */
router.get(
  '/',
  roomController.getPublicRooms
);

/**
 * @route GET /api/rooms/user/active
 * @desc Get user's active rooms
 * @access Private
 */
router.get(
  '/user/active',
  roomController.getUserActiveRooms
);

/**
 * @route POST /api/rooms/:room_id/join-request
 * @desc Request to join a locked room
 * @access Private
 */
router.post(
  '/:room_id/join-request',
  roomController.requestJoinRoom
);

/**
 * @route PUT /api/rooms/join-request/:request_id
 * @desc Respond to join request (accept/reject)
 * @access Private
 */
router.put(
  '/join-request/:request_id',
  [
    body('accept').notEmpty().withMessage('Accept status is required')
      .isBoolean().withMessage('Accept status must be a boolean')
  ],
  roomController.respondToJoinRequest
);

/**
 * @route GET /api/rooms/:room_id/join-requests
 * @desc Get pending join requests for a room
 * @access Private
 */
router.get(
  '/:room_id/join-requests',
  roomController.getPendingJoinRequests
);

module.exports = router;