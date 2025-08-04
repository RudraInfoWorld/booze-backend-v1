const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');
const firebase = require('firebase-admin');

// Initialize Firebase if not already initialized
let firebaseInitialized = false;
const initializeFirebase = async () => {
  try {
    if (!firebaseInitialized && process.env.NODE_ENV !== 'test') {
      firebase.initializeApp({
        credential: firebase.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL
        })
      });
      firebaseInitialized = true;
      logger.info('Firebase initialized');
    }
  } catch (error) {
    logger.error(`Firebase initialization error: ${error.message}`);
    // Allow application to continue without Firebase
  }
};

/**
 * Create notification
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Object>} - Created notification
 */
const createNotification = async (notificationData) => {
  try {
    const { userId, type, title, message, data } = notificationData;
    
    if (!userId || !type || !title || !message) {
      throw new AppError('Missing required notification data', 400);
    }
    
    // Check user notification settings
    const [settings] = await db.query(
      'SELECT * FROM notification_settings WHERE user_id = ?',
      [userId]
    );
    
    // If user has disabled this notification type, don't create it
    if (settings) {
      if (type === 'friend_request' && !settings.friend_requests) return null;
      if (type === 'room_invite' && !settings.room_invites) return null;
      if (type === 'room_join_request' && !settings.room_join_requests) return null;
      if (type === 'game_invite' && !settings.game_invites) return null;
      if (type === 'system' && !settings.system_notifications) return null;
    }
    
    // Create notification in database
    const notificationId = uuidv4();
    
    await db.query(
      `INSERT INTO notifications 
      (id, user_id, type, title, message, data) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [notificationId, userId, type, title, message, JSON.stringify(data || {})]
    );
    
    // Get the created notification
    const [notification] = await db.query(
      'SELECT * FROM notifications WHERE id = ?',
      [notificationId]
    );
    
    // Send push notification if user has device tokens
    await sendPushNotification(userId, title, message, type, data);
    
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: JSON.parse(notification.data || '{}'),
      is_read: notification.is_read,
      created_at: notification.created_at
    };
  } catch (error) {
    logger.error(`Create notification error: ${error.message}`);
    throw new AppError('Failed to create notification', 500);
  }
};

/**
 * Send push notification
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {string} type - Notification type
 * @param {Object} data - Additional data
 * @returns {Promise<boolean>} - Success status
 */
const sendPushNotification = async (userId, title, body, type, data) => {
  try {
    // Initialize Firebase if not already initialized
    await initializeFirebase();
    
    if (!firebaseInitialized) {
      logger.warn('Firebase not initialized, skipping push notification');
      return false;
    }
    
    // Get user's device tokens
    const deviceTokens = await db.query(
      'SELECT device_token, device_type FROM device_tokens WHERE user_id = ?',
      [userId]
    );
    
    if (!deviceTokens || deviceTokens.length === 0) {
      return false;
    }
    
    // Group tokens by device type
    const tokens = {
      ios: deviceTokens.filter(d => d.device_type === 'ios').map(d => d.device_token),
      android: deviceTokens.filter(d => d.device_type === 'android').map(d => d.device_token),
      web: deviceTokens.filter(d => d.device_type === 'web').map(d => d.device_token)
    };
    
    // Send to all device types
    const promises = [];
    
    // iOS devices
    if (tokens.ios.length > 0) {
      promises.push(firebase.messaging().sendMulticast({
        tokens: tokens.ios,
        notification: {
          title,
          body
        },
        data: {
          ...data,
          type,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      }));
    }
    
    // Android devices
    if (tokens.android.length > 0) {
      promises.push(firebase.messaging().sendMulticast({
        tokens: tokens.android,
        notification: {
          title,
          body
        },
        data: {
          ...data,
          type
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            click_action: 'FLUTTER_NOTIFICATION_CLICK'
          }
        }
      }));
    }
    
    // Web devices
    if (tokens.web.length > 0) {
      promises.push(firebase.messaging().sendMulticast({
        tokens: tokens.web,
        notification: {
          title,
          body
        },
        data: {
          ...data,
          type
        },
        webpush: {
          notification: {
            icon: '/images/icon.jpg'
          }
        }
      }));
    }
    
    await Promise.all(promises);
    return true;
  } catch (error) {
    logger.error(`Send push notification error: ${error.message}`);
    return false;
  }
};

/**
 * Get user notifications
 * @param {string} userId - User ID
 * @param {number} limit - Results limit
 * @param {number} offset - Results offset
 * @param {boolean} unreadOnly - Get only unread notifications
 * @returns {Promise<Array>} - Notifications
 */
const getUserNotifications = async (userId, limit = 20, offset = 0, unreadOnly = false) => {
  try {
    // Build query
    let query = `
      SELECT id, type, title, message, data, is_read, created_at 
      FROM notifications 
      WHERE user_id = ?
    `;
    
    const params = [userId];
    
    if (unreadOnly) {
      query += ' AND is_read = FALSE';
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    // Get notifications
    const notifications = await db.query(query, params);
    
    // Parse data field
    return notifications.map(n => ({
      ...n,
      data: JSON.parse(n.data || '{}')
    }));
  } catch (error) {
    logger.error(`Get user notifications error: ${error.message}`);
    throw new AppError('Failed to get notifications', 500);
  }
};

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const markNotificationRead = async (notificationId, userId) => {
  try {
    // Check if notification belongs to user
    const [notification] = await db.query(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    
    if (!notification) {
      throw new AppError('Notification not found', 404);
    }
    
    // Mark as read
    await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = ?',
      [notificationId]
    );
    
    return true;
  } catch (error) {
    logger.error(`Mark notification read error: ${error.message}`);
    throw error;
  }
};

/**
 * Mark all notifications as read
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Number of updated notifications
 */
const markAllNotificationsRead = async (userId) => {
  try {
    const result = await db.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
      [userId]
    );
    
    return result.affectedRows || 0;
  } catch (error) {
    logger.error(`Mark all notifications read error: ${error.message}`);
    throw new AppError('Failed to mark notifications as read', 500);
  }
};

/**
 * Delete notification
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteNotification = async (notificationId, userId) => {
  try {
    // Check if notification belongs to user
    const [notification] = await db.query(
      'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
    
    if (!notification) {
      throw new AppError('Notification not found', 404);
    }
    
    // Delete notification
    await db.query(
      'DELETE FROM notifications WHERE id = ?',
      [notificationId]
    );
    
    return true;
  } catch (error) {
    logger.error(`Delete notification error: ${error.message}`);
    throw error;
  }
};

/**
 * Delete all notifications
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Number of deleted notifications
 */
const deleteAllNotifications = async (userId) => {
  try {
    const result = await db.query(
      'DELETE FROM notifications WHERE user_id = ?',
      [userId]
    );
    
    return result.affectedRows || 0;
  } catch (error) {
    logger.error(`Delete all notifications error: ${error.message}`);
    throw new AppError('Failed to delete notifications', 500);
  }
};

/**
 * Update notification settings
 * @param {string} userId - User ID
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} - Updated settings
 */
const updateNotificationSettings = async (userId, settings) => {
  try {
    // Check if settings exist
    const [existingSettings] = await db.query(
      'SELECT user_id FROM notification_settings WHERE user_id = ?',
      [userId]
    );
    
    const validFields = [
      'friend_requests', 
      'room_invites', 
      'room_join_requests', 
      'game_invites', 
      'system_notifications'
    ];
    
    // Create update query
    let updateQuery = 'UPDATE notification_settings SET ';
    const updateValues = [];
    const updateFields = [];
    
    // Add fields to update
    for (const field of validFields) {
      if (settings[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(settings[field] ? 1 : 0); // Convert to boolean
      }
    }
    
    if (updateFields.length === 0) {
      throw new AppError('No valid settings provided', 400);
    }
    
    updateQuery += updateFields.join(', ');
    updateQuery += ' WHERE user_id = ?';
    updateValues.push(userId);
    
    // If settings don't exist, create them
    if (!existingSettings) {
      // Create default settings with user_id
      const defaultSettings = {
        user_id: userId,
        friend_requests: true,
        room_invites: true,
        room_join_requests: true,
        game_invites: true,
        system_notifications: true
      };
      
      // Override with provided settings
      for (const field of validFields) {
        if (settings[field] !== undefined) {
          defaultSettings[field] = !!settings[field]; // Convert to boolean
        }
      }
      
      await db.query(
        `INSERT INTO notification_settings 
        (user_id, friend_requests, room_invites, room_join_requests, game_invites, system_notifications)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          defaultSettings.friend_requests, 
          defaultSettings.room_invites,
          defaultSettings.room_join_requests,
          defaultSettings.game_invites,
          defaultSettings.system_notifications
        ]
      );
    } else {
      // Update existing settings
      await db.query(updateQuery, updateValues);
    }
    
    // Get updated settings
    const [updatedSettings] = await db.query(
      'SELECT * FROM notification_settings WHERE user_id = ?',
      [userId]
    );
    
    return {
      friend_requests: !!updatedSettings.friend_requests,
      room_invites: !!updatedSettings.room_invites,
      room_join_requests: !!updatedSettings.room_join_requests,
      game_invites: !!updatedSettings.game_invites,
      system_notifications: !!updatedSettings.system_notifications
    };
  } catch (error) {
    logger.error(`Update notification settings error: ${error.message}`);
    throw error;
  }
};

/**
 * Get notification settings
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Notification settings
 */
const getNotificationSettings = async (userId) => {
  try {
    // Get settings or create default
    const [settings] = await db.query(
      'SELECT * FROM notification_settings WHERE user_id = ?',
      [userId]
    );
    
    if (!settings) {
      // Create default settings
      await db.query(
        'INSERT INTO notification_settings (user_id) VALUES (?)',
        [userId]
      );
      
      return {
        friend_requests: true,
        room_invites: true,
        room_join_requests: true,
        game_invites: true,
        system_notifications: true
      };
    }
    
    return {
      friend_requests: !!settings.friend_requests,
      room_invites: !!settings.room_invites,
      room_join_requests: !!settings.room_join_requests,
      game_invites: !!settings.game_invites,
      system_notifications: !!settings.system_notifications
    };
  } catch (error) {
    logger.error(`Get notification settings error: ${error.message}`);
    throw new AppError('Failed to get notification settings', 500);
  }
};

/**
 * Register device token for push notifications
 * @param {string} userId - User ID
 * @param {string} deviceToken - Device token
 * @param {string} deviceType - Device type (ios, android, web)
 * @returns {Promise<boolean>} - Success status
 */
const registerDeviceToken = async (userId, deviceToken, deviceType) => {
  try {
    // Validate device type
    const validTypes = ['ios', 'android', 'web'];
    if (!validTypes.includes(deviceType)) {
      throw new AppError('Invalid device type', 400);
    }
    
    // Check if token already exists
    const [existingToken] = await db.query(
      'SELECT id FROM device_tokens WHERE device_token = ?',
      [deviceToken]
    );
    
    if (existingToken) {
      // Update existing token
      await db.query(
        'UPDATE device_tokens SET user_id = ?, device_type = ? WHERE id = ?',
        [userId, deviceType, existingToken.id]
      );
    } else {
      // Create new token
      const tokenId = uuidv4();
      
      await db.query(
        'INSERT INTO device_tokens (id, user_id, device_token, device_type) VALUES (?, ?, ?, ?)',
        [tokenId, userId, deviceToken, deviceType]
      );
    }
    
    return true;
  } catch (error) {
    logger.error(`Register device token error: ${error.message}`);
    throw new AppError('Failed to register device token', 500);
  }
};

/**
 * Unregister device token
 * @param {string} deviceToken - Device token
 * @returns {Promise<boolean>} - Success status
 */
const unregisterDeviceToken = async (deviceToken) => {
  try {
    await db.query(
      'DELETE FROM device_tokens WHERE device_token = ?',
      [deviceToken]
    );
    
    return true;
  } catch (error) {
    logger.error(`Unregister device token error: ${error.message}`);
    throw new AppError('Failed to unregister device token', 500);
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  updateNotificationSettings,
  getNotificationSettings,
  registerDeviceToken,
  unregisterDeviceToken
};