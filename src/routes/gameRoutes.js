const express = require('express');
const { body } = require('express-validator');
const gameController = require('../controllers/gameController');
const { authenticate } = require('../middleware/auth');
const { uploadImage, uploadDocs } = require('../middleware/multer');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/games/create
 * @desc Create game
 * @access Private
 */
router.post(
  '/create',
  uploadDocs.single('docs'),
  [
    body('name')
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ max: 255 })
      .withMessage('Name must be at most 255 characters'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('min_players')
      .notEmpty()
      .withMessage('Minimum players is required')
      .isInt({ min: 1 })
      .withMessage('Minimum players must be at least 1'),
    body('max_players')
      .notEmpty()
      .withMessage('Maximum players is required')
      .isInt({ min: 1 })
      .withMessage('Maximum players must be at least 1')
      .custom((value, { req }) => {
        if (req.body.min_players && value < req.body.min_players) {
          throw new Error('Maximum players must be greater than or equal to minimum players');
        }
        return true;
      }),
  ],
  gameController.createGame
);

/**
 * @route PUT /api/games/:game_id
 * @desc Update game
 * @access Private
 */
router.put(
  '/:game_id',
  uploadDocs.single('docs'),
  [
    body('name')
      .optional()
      .isString()
      .withMessage('Name must be a string')
      .isLength({ max: 255 })
      .withMessage('Name must be at most 255 characters'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('min_players')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Minimum players must be at least 1'),
    body('max_players')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Maximum players must be at least 1'),
  ],
  gameController.updateGame
);

/**
 * @route DELETE /api/games/:game_id
 * @desc Delete game
 * @access Private
 */
router.delete('/:game_id', gameController.deleteGame);

/**
 * @route GET /api/games
 * @desc Get all games
 * @access Private
 */
router.get('/', gameController.getGames);

/**
 * @route GET /api/games/:game_id
 * @desc Get game by ID
 * @access Private
 */
router.get('/:game_id', gameController.getGameById);

/**
 * @route POST /api/games/sessions
 * @desc Create game session
 * @access Private
 */
router.post(
  '/sessions',
  [
    body('game_id').notEmpty().withMessage('Game ID is required'),
    body('room_id').notEmpty().withMessage('Room ID is required'),
  ],
  gameController.createGameSession
);

/**
 * @route GET /api/games/sessions/:session_id
 * @desc Get game session
 * @access Private
 */
router.get('/sessions/:session_id', gameController.getGameSession);

/**
 * @route POST /api/games/sessions/:session_id/join
 * @desc Join game session
 * @access Private
 */
router.post('/sessions/:session_id/join', gameController.joinGameSession);

/**
 * @route POST /api/games/sessions/:session_id/leave
 * @desc Leave game session
 * @access Private
 */
router.post('/sessions/:session_id/leave', gameController.leaveGameSession);

/**
 * @route POST /api/games/sessions/:session_id/end
 * @desc End game session
 * @access Private
 */
router.post('/sessions/:session_id/end', gameController.endGameSession);

/**
 * @route PUT /api/games/sessions/:session_id/players/:user_id/score
 * @desc Update player score
 * @access Private
 */
router.put(
  '/sessions/:session_id/players/:user_id/score',
  [
    body('score')
      .notEmpty()
      .withMessage('Score is required')
      .isNumeric()
      .withMessage('Score must be a number'),
  ],
  gameController.updatePlayerScore
);

/**
 * @route GET /api/games/rooms/:room_id/sessions
 * @desc Get active game sessions in room
 * @access Private
 */
router.get('/rooms/:room_id/sessions', gameController.getActiveGameSessionsInRoom);

/**
 * @route POST /api/games/sessions/:session_id/invite
 * @desc Invite user to game
 * @access Private
 */
router.post(
  '/sessions/:session_id/invite',
  [body('user_id').notEmpty().withMessage('User ID is required')],
  gameController.inviteToGame
);

module.exports = router;
