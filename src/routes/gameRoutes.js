const express = require('express');
const { body } = require('express-validator');
const gameController = require('../controllers/gameController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/games
 * @desc Get all games
 * @access Private
 */
router.get(
  '/',
  gameController.getGames
);

/**
 * @route GET /api/games/:game_id
 * @desc Get game by ID
 * @access Private
 */
router.get(
  '/:game_id',
  gameController.getGameById
);

/**
 * @route POST /api/games/sessions
 * @desc Create game session
 * @access Private
 */
router.post(
  '/sessions',
  [
    body('game_id').notEmpty().withMessage('Game ID is required'),
    body('room_id').notEmpty().withMessage('Room ID is required')
  ],
  gameController.createGameSession
);

/**
 * @route GET /api/games/sessions/:session_id
 * @desc Get game session
 * @access Private
 */
router.get(
  '/sessions/:session_id',
  gameController.getGameSession
);

/**
 * @route POST /api/games/sessions/:session_id/join
 * @desc Join game session
 * @access Private
 */
router.post(
  '/sessions/:session_id/join',
  gameController.joinGameSession
);

/**
 * @route POST /api/games/sessions/:session_id/leave
 * @desc Leave game session
 * @access Private
 */
router.post(
  '/sessions/:session_id/leave',
  gameController.leaveGameSession
);

/**
 * @route POST /api/games/sessions/:session_id/end
 * @desc End game session
 * @access Private
 */
router.post(
  '/sessions/:session_id/end',
  gameController.endGameSession
);

/**
 * @route PUT /api/games/sessions/:session_id/players/:user_id/score
 * @desc Update player score
 * @access Private
 */
router.put(
  '/sessions/:session_id/players/:user_id/score',
  [
    body('score').notEmpty().withMessage('Score is required')
      .isNumeric().withMessage('Score must be a number')
  ],
  gameController.updatePlayerScore
);

/**
 * @route GET /api/games/rooms/:room_id/sessions
 * @desc Get active game sessions in room
 * @access Private
 */
router.get(
  '/rooms/:room_id/sessions',
  gameController.getActiveGameSessionsInRoom
);

/**
 * @route POST /api/games/sessions/:session_id/invite
 * @desc Invite user to game
 * @access Private
 */
router.post(
  '/sessions/:session_id/invite',
  [
    body('user_id').notEmpty().withMessage('User ID is required')
  ],
  gameController.inviteToGame
);

module.exports = router;