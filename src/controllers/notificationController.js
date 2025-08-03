const { validationResult } = require('express-validator');
const { catchAsync, AppError } = require('../utils/errorHandler');
const notificationService = require('../services/notificationService');
const logger = require('../config/logger');

/**
 * Get user notifications
 */
const getUserNotifications = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const unreadOnly = req.query.unread === 'true';
  
  const notifications = await notificationService.getUserNotifications(
    req.user.id, 
    limit, 
    offset, 
    unreadOnly
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      notifications,
      count: notifications.length,
      limit,
      offset
    }
  });
});

/**
 * Mark notification as read
 */
const markNotificationRead = catchAsync(async (req, res) => {
  const { notification_id } = req.params;
  
  await notificationService.markNotificationRead(notification_id, req.user.id);
  
  res.status(200).json({
    status: 'success',
    message: 'Notification marked as read'
  });
});

/**
 * Mark all notifications as read
 */
const markAllNotificationsRead = catchAsync(async (req, res) => {
  const count = await notificationService.markAllNotificationsRead(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      count
    },
    message: 'All notifications marked as read'
  });
});

/**
 * Delete notification
 */
const deleteNotification = catchAsync(async (req, res) => {
  const { notification_id } = req.params;
  
  await notificationService.deleteNotification(notification_id, req.user.id);
  
  res.status(200).json({
    status: 'success',
    message: 'Notification deleted'
  });
});

/**
 * Delete all notifications
 */
const deleteAllNotifications = catchAsync(async (req, res) => {
  const count = await notificationService.deleteAllNotifications(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      count
    },
    message: 'All notifications deleted'
  });
});

/**
 * Get notification settings
 */
const getNotificationSettings = catchAsync(async (req, res) => {
  const settings = await notificationService.getNotificationSettings(req.user.id);
  
  res.status(200).json({
    status: 'success',
    data: {
      settings
    }
  });
});

/**
 * Update notification settings
 */
const updateNotificationSettings = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const settings = {
    friend_requests: req.body.friend_requests,
    room_invites: req.body.room_invites,
    room_join_requests: req.body.room_join_requests,
    game_invites: req.body.game_invites,
    system_notifications: req.body.system_notifications
  };
  
  // Remove undefined fields
  Object.keys(settings).forEach(key => {
    if (settings[key] === undefined) {
      delete settings[key];
    }
  });
  
  const updatedSettings = await notificationService.updateNotificationSettings(req.user.id, settings);
  
  res.status(200).json({
    status: 'success',
    data: {
      settings: updatedSettings
    },
    message: 'Notification settings updated'
  });
});

/**
 * Register device token for push notifications
 */
const registerDeviceToken = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { device_token, device_type } = req.body;
  
  await notificationService.registerDeviceToken(req.user.id, device_token, device_type);
  
  res.status(200).json({
    status: 'success',
    message: 'Device token registered successfully'
  });
});

/**
 * Unregister device token
 */
const unregisterDeviceToken = catchAsync(async (req, res) => {
  // Validate input
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  
  const { device_token } = req.body;
  
  await notificationService.unregisterDeviceToken(device_token);
  
  res.status(200).json({
    status: 'success',
    message: 'Device token unregistered successfully'
  });
});

module.exports = {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  getNotificationSettings,
  updateNotificationSettings,
  registerDeviceToken,
  unregisterDeviceToken
};