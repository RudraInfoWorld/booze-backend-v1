const express = require('express');
const { body } = require('express-validator');
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/notifications
 * @desc Get user notifications
 * @access Private
 */
router.get('/', notificationController.getUserNotifications);

/**
 * @route PUT /api/notifications/:notification_id/read
 * @desc Mark notification as read
 * @access Private
 */
router.put('/read/:notification_id', notificationController.markNotificationRead);

/**
 * @route PUT /api/notifications/read-all
 * @desc Mark all notifications as read
 * @access Private
 */
router.put('/read-all', notificationController.markAllNotificationsRead);

/**
 * @route DELETE /api/notifications/:notification_id
 * @desc Delete notification
 * @access Private
 */
router.delete('/:notification_id', notificationController.deleteNotification); // @SKIPTEST

/**
 * @route DELETE /api/notifications
 * @desc Delete all notifications
 * @access Private
 */
router.delete('/', notificationController.deleteAllNotifications); // @SKIPTEST

/**
 * @route GET /api/notifications/settings
 * @desc Get notification settings
 * @access Private
 */
router.get('/settings', notificationController.getNotificationSettings);

/**
 * @route PUT /api/notifications/settings
 * @desc Update notification settings
 * @access Private
 */
router.put(
  '/settings',
  [
    body('friend_requests').optional().isBoolean(),
    body('room_invites').optional().isBoolean(),
    body('room_join_requests').optional().isBoolean(),
    body('game_invites').optional().isBoolean(),
    body('system_notifications').optional().isBoolean(),
  ],
  notificationController.updateNotificationSettings
);

/**
 * @route POST /api/notifications/device-token
 * @desc Register device token for push notifications
 * @access Private
 */
router.post(
  // @SKIPTEST
  '/device-token',
  [
    body('device_token').notEmpty().withMessage('Device token is required'),
    body('device_type')
      .notEmpty()
      .withMessage('Device type is required')
      .isIn(['ios', 'android', 'web'])
      .withMessage('Device type must be ios, android, or web'),
  ],
  notificationController.registerDeviceToken
);

/**
 * @route DELETE /api/notifications/device-token
 * @desc Unregister device token
 * @access Private
 */
router.delete(
  // @SKIPTEST
  '/device-token',
  [body('device_token').notEmpty().withMessage('Device token is required')],
  notificationController.unregisterDeviceToken
);

module.exports = router;
