const express = require('express');
const analyticsService = require('../services/analyticsService');
const { authenticate, authorize } = require('../middleware/auth');
const { catchAsync } = require('../utils/errorHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Analytics routes require admin role
router.use(authorize('admin'));

/**
 * @route GET /api/analytics/users
 * @desc Get daily active users
 * @access Private (Admin only)
 */
router.get(
  '/users',
  catchAsync(async (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const data = await analyticsService.getDailyActiveUsers(days);
    
    res.status(200).json({
      status: 'success',
      data
    });
  })
);

/**
 * @route GET /api/analytics/games
 * @desc Get game activity
 * @access Private (Admin only)
 */
router.get(
  '/games',
  catchAsync(async (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const data = await analyticsService.getGameActivity(days);
    
    res.status(200).json({
      status: 'success',
      data
    });
  })
);

/**
 * @route GET /api/analytics/rooms
 * @desc Get room activity
 * @access Private (Admin only)
 */
router.get(
  '/rooms',
  catchAsync(async (req, res) => {
    const days = parseInt(req.query.days) || 7;
    const data = await analyticsService.getRoomActivity(days);
    
    res.status(200).json({
      status: 'success',
      data
    });
  })
);

/**
 * @route POST /api/analytics/track
 * @desc Track metrics manually
 * @access Private (Admin only)
 */
router.post(
  '/track',
  catchAsync(async (req, res) => {
    // Track all metrics
    await analyticsService.trackDailyActiveUsers();
    
    // Track game activity for all games if game_id is not provided
    if (req.body.game_id) {
      await analyticsService.trackGameActivity(req.body.game_id);
    } else {
      const games = await db.query('SELECT id FROM games');
      for (const game of games) {
        await analyticsService.trackGameActivity(game.id);
      }
    }
    
    await analyticsService.trackRoomActivity();
    
    res.status(200).json({
      status: 'success',
      message: 'Analytics tracked successfully'
    });
  })
);

module.exports = router;