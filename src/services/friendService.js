const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../utils/errorHandler');
const db = require('../config/database');
const logger = require('../config/logger');
const userService = require('./userService');

// This will be lazy-loaded to avoid circular dependency
let notificationService;

/**
 * Send friend request
 * @param {string} requesterId - User sending request
 * @param {string} addresseeId - User receiving request
 * @returns {Promise<Object>} - Friendship object
 */
const sendFriendRequest = async (requesterId, addresseeId) => {
  try {
    // Lazy load notification service to prevent circular dependency
    if (!notificationService) {
      notificationService = require('./notificationService');
    }
    
    // Check if users exist
    await userService.getUserById(requesterId);
    await userService.getUserById(addresseeId);
    
    // Cannot send friend request to yourself
    if (requesterId === addresseeId) {
      throw new AppError('Cannot send friend request to yourself', 400);
    }
    
    // Check if friendship already exists
    const [existingFriendship] = await db.query(
      `SELECT id, status FROM friendships 
      WHERE (requester_id = ? AND addressee_id = ?) 
      OR (requester_id = ? AND addressee_id = ?)`,
      [requesterId, addresseeId, addresseeId, requesterId]
    );
    
    if (existingFriendship) {
      if (existingFriendship.status === 'blocked') {
        throw new AppError('Cannot send friend request', 400);
      }
      if (existingFriendship.status === 'accepted') {
        throw new AppError('Already friends', 400);
      }
      if (existingFriendship.status === 'pending') {
        throw new AppError('Friend request already sent', 400);
      }
      // If rejected, allow sending again
    }
    
    // Create new friendship
    const friendshipId = uuidv4();
    
    await db.query(
      'INSERT INTO friendships (id, requester_id, addressee_id, status) VALUES (?, ?, ?, ?)',
      [friendshipId, requesterId, addresseeId, 'pending']
    );
    
    // Send notification to addressee
    await notificationService.createNotification({
      userId: addresseeId,
      type: 'friend_request',
      title: 'Friend Request',
      message: `You received a friend request`,
      data: {
        requesterId,
        friendshipId
      }
    });
    
    return {
      id: friendshipId,
      requesterId,
      addresseeId,
      status: 'pending',
      created_at: new Date()
    };
  } catch (error) {
    logger.error(`Send friend request error: ${error.message}`);
    throw error;
  }
};

/**
 * Accept friend request
 * @param {string} friendshipId - Friendship ID
 * @param {string} userId - User accepting request
 * @returns {Promise<Object>} - Updated friendship object
 */
const acceptFriendRequest = async (friendshipId, userId) => {
  try {
    // Lazy load notification service to prevent circular dependency
    if (!notificationService) {
      notificationService = require('./notificationService');
    }
    
    // Get friendship
    const [friendship] = await db.query(
      'SELECT id, requester_id, addressee_id, status FROM friendships WHERE id = ?',
      [friendshipId]
    );
    
    if (!friendship) {
      throw new AppError('Friend request not found', 404);
    }
    
    // Check if user is the addressee
    if (friendship.addressee_id !== userId) {
      throw new AppError('Not authorized to accept this friend request', 403);
    }
    
    // Check if status is pending
    if (friendship.status !== 'pending') {
      throw new AppError('Friend request already processed', 400);
    }
    
    // Update friendship status
    await db.query(
      'UPDATE friendships SET status = ? WHERE id = ?',
      ['accepted', friendshipId]
    );
    
    // Send notification to requester
    await notificationService.createNotification({
      userId: friendship.requester_id,
      type: 'friend_request',
      title: 'Friend Request Accepted',
      message: `Your friend request has been accepted`,
      data: {
        addresseeId: userId,
        friendshipId
      }
    });
    
    return {
      id: friendshipId,
      requesterId: friendship.requester_id,
      addresseeId: friendship.addressee_id,
      status: 'accepted'
    };
  } catch (error) {
    logger.error(`Accept friend request error: ${error.message}`);
    throw error;
  }
};

/**
 * Reject friend request
 * @param {string} friendshipId - Friendship ID
 * @param {string} userId - User rejecting request
 * @returns {Promise<Object>} - Updated friendship object
 */
const rejectFriendRequest = async (friendshipId, userId) => {
  try {
    // Get friendship
    const [friendship] = await db.query(
      'SELECT id, requester_id, addressee_id, status FROM friendships WHERE id = ?',
      [friendshipId]
    );
    
    if (!friendship) {
      throw new AppError('Friend request not found', 404);
    }
    
    // Check if user is the addressee
    if (friendship.addressee_id !== userId) {
      throw new AppError('Not authorized to reject this friend request', 403);
    }
    
    // Check if status is pending
    if (friendship.status !== 'pending') {
      throw new AppError('Friend request already processed', 400);
    }
    
    // Update friendship status
    await db.query(
      'UPDATE friendships SET status = ? WHERE id = ?',
      ['rejected', friendshipId]
    );
    
    return {
      id: friendshipId,
      requesterId: friendship.requester_id,
      addresseeId: friendship.addressee_id,
      status: 'rejected'
    };
  } catch (error) {
    logger.error(`Reject friend request error: ${error.message}`);
    throw error;
  }
};

/**
 * Block user
 * @param {string} userId - User blocking
 * @param {string} blockedUserId - User being blocked
 * @returns {Promise<Object>} - Friendship object
 */
const blockUser = async (userId, blockedUserId) => {
  try {
    // Check if users exist
    await userService.getUserById(userId);
    await userService.getUserById(blockedUserId);
    
    // Cannot block yourself
    if (userId === blockedUserId) {
      throw new AppError('Cannot block yourself', 400);
    }
    
    // Check if friendship exists
    const [existingFriendship] = await db.query(
      `SELECT id, requester_id, addressee_id, status FROM friendships 
      WHERE (requester_id = ? AND addressee_id = ?) 
      OR (requester_id = ? AND addressee_id = ?)`,
      [userId, blockedUserId, blockedUserId, userId]
    );
    
    let friendshipId;
    
    if (existingFriendship) {
      // Update existing friendship
      friendshipId = existingFriendship.id;
      
      await db.query(
        'UPDATE friendships SET status = ?, requester_id = ?, addressee_id = ? WHERE id = ?',
        ['blocked', userId, blockedUserId, friendshipId]
      );
    } else {
      // Create new blocked relationship
      friendshipId = uuidv4();
      
      await db.query(
        'INSERT INTO friendships (id, requester_id, addressee_id, status) VALUES (?, ?, ?, ?)',
        [friendshipId, userId, blockedUserId, 'blocked']
      );
    }
    
    return {
      id: friendshipId,
      requesterId: userId,
      addresseeId: blockedUserId,
      status: 'blocked'
    };
  } catch (error) {
    logger.error(`Block user error: ${error.message}`);
    throw error;
  }
};

/**
 * Unblock user
 * @param {string} userId - User unblocking
 * @param {string} blockedUserId - User being unblocked
 * @returns {Promise<boolean>} - Success status
 */
const unblockUser = async (userId, blockedUserId) => {
  try {
    // Check if block exists
    const [block] = await db.query(
      `SELECT id FROM friendships 
      WHERE requester_id = ? AND addressee_id = ? AND status = ?`,
      [userId, blockedUserId, 'blocked']
    );
    
    if (!block) {
      throw new AppError('User not blocked', 404);
    }
    
    // Delete block
    await db.query(
      'DELETE FROM friendships WHERE id = ?',
      [block.id]
    );
    
    return true;
  } catch (error) {
    logger.error(`Unblock user error: ${error.message}`);
    throw error;
  }
};

/**
 * Remove friend
 * @param {string} userId - User removing friend
 * @param {string} friendId - Friend being removed
 * @returns {Promise<boolean>} - Success status
 */
const removeFriend = async (userId, friendId) => {
  try {
    // Check if friendship exists
    const [friendship] = await db.query(
      `SELECT id FROM friendships 
      WHERE ((requester_id = ? AND addressee_id = ?) 
      OR (requester_id = ? AND addressee_id = ?)) 
      AND status = ?`,
      [userId, friendId, friendId, userId, 'accepted']
    );
    
    if (!friendship) {
      throw new AppError('Friendship not found', 404);
    }
    
    // Delete friendship
    await db.query(
      'DELETE FROM friendships WHERE id = ?',
      [friendship.id]
    );
    
    return true;
  } catch (error) {
    logger.error(`Remove friend error: ${error.message}`);
    throw error;
  }
};

/**
 * Get user's friends
 * @param {string} userId - User ID
 * @param {number} limit - Results limit
 * @param {number} offset - Results offset
 * @returns {Promise<Array>} - Friends list
 */
const getUserFriends = async (userId, limit = 20, offset = 0) => {
  try {
    // Get friends as requester
    const requesterFriends = await db.query(
      `SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
      u.id AS friend_id, u.username, u.profile_picture, u.bio
      FROM friendships f
      JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = ? AND f.status = ? AND u.account_status != 'deleted'`,
      [userId, 'accepted']
    );
    
    // Get friends as addressee
    const addresseeFriends = await db.query(
      `SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
      u.id AS friend_id, u.username, u.profile_picture, u.bio
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = ? AND u.account_status != 'deleted'`,
      [userId, 'accepted']
    );
    
    // Combine and format results
    const allFriends = [
      ...requesterFriends.map(f => ({
        friendship_id: f.id,
        user_id: f.friend_id,
        username: f.username,
        profile_picture: f.profile_picture,
        bio: f.bio,
        created_at: f.created_at
      })),
      ...addresseeFriends.map(f => ({
        friendship_id: f.id,
        user_id: f.friend_id,
        username: f.username,
        profile_picture: f.profile_picture,
        bio: f.bio,
        created_at: f.created_at
      }))
    ];
    
    // Sort by username
    allFriends.sort((a, b) => a.username.localeCompare(b.username));
    
    // Apply pagination
    return allFriends.slice(offset, offset + limit);
  } catch (error) {
    logger.error(`Get user friends error: ${error.message}`);
    throw new AppError('Failed to get friends', 500);
  }
};

/**
 * Get user's friend requests
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Pending friend requests
 */
const getPendingFriendRequests = async (userId) => {
  try {
    // Get pending requests received by user
    const requests = await db.query(
      `SELECT f.id, f.requester_id, f.created_at,
      u.username, u.profile_picture, u.bio
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = ? AND u.account_status != 'deleted'
      ORDER BY f.created_at DESC`,
      [userId, 'pending']
    );
    
    return requests.map(r => ({
      request_id: r.id,
      user_id: r.requester_id,
      username: r.username,
      profile_picture: r.profile_picture,
      bio: r.bio,
      created_at: r.created_at
    }));
  } catch (error) {
    logger.error(`Get pending friend requests error: ${error.message}`);
    throw new AppError('Failed to get friend requests', 500);
  }
};

/**
 * Get friend suggestions
 * @param {string} userId - User ID
 * @param {number} limit - Results limit
 * @returns {Promise<Array>} - User suggestions
 */
const getFriendSuggestions = async (userId, limit = 10) => {
  try {
    // Get mutual friends (friends of friends)
    // This is a simple implementation - could be expanded with more advanced algorithms
    
    // Get current user's friends
    const userFriends = await getUserFriendsIds(userId);
    
    if (userFriends.length === 0) {
      // If no friends, return random users
      return getRandomUserSuggestions(userId, limit);
    }
    
    // Get friends of friends
    const placeholders = userFriends.map(() => '?').join(',');
    
    const mutualFriends = await db.query(
      `SELECT DISTINCT 
        u.id, u.username, u.profile_picture, u.bio,
        COUNT(DISTINCT f1.requester_id, f1.addressee_id) AS mutual_count
      FROM
        (SELECT 
          CASE 
            WHEN requester_id IN (${placeholders}) THEN addressee_id
            WHEN addressee_id IN (${placeholders}) THEN requester_id
          END AS friend_id
        FROM friendships
        WHERE 
          status = 'accepted' 
          AND (requester_id IN (${placeholders}) OR addressee_id IN (${placeholders}))
        ) AS ff
      JOIN users u ON u.id = ff.friend_id
      JOIN friendships f1 ON 
        (f1.requester_id = ff.friend_id AND f1.addressee_id IN (${placeholders}) AND f1.status = 'accepted')
        OR (f1.addressee_id = ff.friend_id AND f1.requester_id IN (${placeholders}) AND f1.status = 'accepted')
      WHERE 
        u.id != ? 
        AND u.account_status = 'active'
        AND u.id NOT IN (
          SELECT 
            CASE 
              WHEN requester_id = ? THEN addressee_id
              WHEN addressee_id = ? THEN requester_id
            END
          FROM friendships
          WHERE (requester_id = ? OR addressee_id = ?)
        )
      GROUP BY u.id
      ORDER BY mutual_count DESC, u.username
      LIMIT ?`,
      [
        ...userFriends, ...userFriends, ...userFriends, ...userFriends, 
        ...userFriends, ...userFriends,
        userId, userId, userId, userId, userId,
        limit
      ]
    );
    
    // If not enough mutual friends, supplement with random users
    if (mutualFriends.length < limit) {
      const randomUsers = await getRandomUserSuggestions(
        userId, 
        limit - mutualFriends.length, 
        mutualFriends.map(u => u.id)
      );
      
      return [...mutualFriends, ...randomUsers];
    }
    
    return mutualFriends;
  } catch (error) {
    logger.error(`Get friend suggestions error: ${error.message}`);
    throw new AppError('Failed to get friend suggestions', 500);
  }
};

/**
 * Get random user suggestions
 * @param {string} userId - User ID
 * @param {number} limit - Results limit
 * @param {Array} excludeIds - User IDs to exclude
 * @returns {Promise<Array>} - Random user suggestions
 */
const getRandomUserSuggestions = async (userId, limit = 10, excludeIds = []) => {
  try {
    // Get all user's friends
    const userFriends = await getUserFriendsIds(userId);
    
    // Combine all IDs to exclude
    const allExcludeIds = [userId, ...userFriends, ...excludeIds];
    const placeholders = allExcludeIds.map(() => '?').join(',');
    
    // Get random users
    const randomUsers = await db.query(
      `SELECT id, username, profile_picture, bio
      FROM users
      WHERE id NOT IN (${placeholders})
      AND account_status = 'active'
      ORDER BY RAND()
      LIMIT ?`,
      [...allExcludeIds, limit]
    );
    
    return randomUsers;
  } catch (error) {
    logger.error(`Get random user suggestions error: ${error.message}`);
    throw new AppError('Failed to get user suggestions', 500);
  }
};

/**
 * Get user's friend IDs
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Friend IDs
 */
const getUserFriendsIds = async (userId) => {
  try {
    // Get friends as requester
    const requesterFriends = await db.query(
      `SELECT addressee_id
      FROM friendships
      WHERE requester_id = ? AND status = ?`,
      [userId, 'accepted']
    );
    
    // Get friends as addressee
    const addresseeFriends = await db.query(
      `SELECT requester_id
      FROM friendships
      WHERE addressee_id = ? AND status = ?`,
      [userId, 'accepted']
    );
    
    // Combine and extract IDs
    return [
      ...requesterFriends.map(f => f.addressee_id),
      ...addresseeFriends.map(f => f.requester_id)
    ];
  } catch (error) {
    logger.error(`Get user friend IDs error: ${error.message}`);
    throw new AppError('Failed to get friend IDs', 500);
  }
};

/**
 * Check if users are friends
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<boolean>} - Whether users are friends
 */
const areFriends = async (userId1, userId2) => {
  try {
    const [friendship] = await db.query(
      `SELECT id FROM friendships 
      WHERE ((requester_id = ? AND addressee_id = ?) 
      OR (requester_id = ? AND addressee_id = ?)) 
      AND status = ?`,
      [userId1, userId2, userId2, userId1, 'accepted']
    );
    
    return !!friendship;
  } catch (error) {
    logger.error(`Check if users are friends error: ${error.message}`);
    throw new AppError('Failed to check friendship status', 500);
  }
};

/**
 * Get friendship status between users
 * @param {string} userId1 - First user ID
 * @param {string} userId2 - Second user ID
 * @returns {Promise<Object>} - Friendship status
 */
const getFriendshipStatus = async (userId1, userId2) => {
  try {
    const [friendship] = await db.query(
      `SELECT id, requester_id, addressee_id, status
      FROM friendships 
      WHERE (requester_id = ? AND addressee_id = ?) 
      OR (requester_id = ? AND addressee_id = ?)`,
      [userId1, userId2, userId2, userId1]
    );
    
    if (!friendship) {
      return { status: 'none' };
    }
    
    if (friendship.status === 'pending') {
      return {
        status: 'pending',
        isPendingOutgoing: friendship.requester_id === userId1,
        isPendingIncoming: friendship.addressee_id === userId1
      };
    }
    
    return { 
      status: friendship.status,
      isBlocked: friendship.status === 'blocked' && friendship.requester_id === userId1,
      isBlockedBy: friendship.status === 'blocked' && friendship.addressee_id === userId1
    };
  } catch (error) {
    logger.error(`Get friendship status error: ${error.message}`);
    throw new AppError('Failed to get friendship status', 500);
  }
};

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  blockUser,
  unblockUser,
  removeFriend,
  getUserFriends,
  getPendingFriendRequests,
  getFriendSuggestions,
  getUserFriendsIds,
  areFriends,
  getFriendshipStatus
};