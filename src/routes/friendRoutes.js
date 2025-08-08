const express = require('express');
const { body } = require('express-validator');
const friendController = require('../controllers/friendController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/friends/requests
 * @desc Send friend request
 * @access Private
 */
router.post(
  '/requests',
  [body('addressee_id').notEmpty().withMessage('Addressee ID is required')],
  friendController.sendFriendRequest
);

/**
 * @route PUT /api/friends/requests/:request_id/accept
 * @desc Accept friend request
 * @access Private
 */
router.put('/requests/:request_id/accept', friendController.acceptFriendRequest);

/**
 * @route PUT /api/friends/requests/:request_id/reject
 * @desc Reject friend request
 * @access Private
 */
router.put('/requests/:request_id/reject', friendController.rejectFriendRequest);

/**
 * @route POST /api/friends/block
 * @desc Block user
 * @access Private
 */
router.post(
  '/block',
  [body('user_id').notEmpty().withMessage('User ID is required')],
  friendController.blockUser
);

/**
 * @route DELETE /api/friends/block/:user_id
 * @desc Unblock user
 * @access Private
 */
router.delete('/block/:user_id', friendController.unblockUser);

/**
 * @route DELETE /api/friends/:friend_id
 * @desc Remove friend
 * @access Private
 */
router.delete('/:friend_id', friendController.removeFriend);

/**
 * @route GET /api/friends
 * @desc Get friends list
 * @access Private
 */
router.get('/', friendController.getFriends);

/**
 * @route GET /api/friends/requests
 * @desc Get pending friend requests
 * @access Private
 */
router.get('/requests', friendController.getPendingRequests);

/**
 * @route GET /api/friends/suggestions
 * @desc Get friend suggestions
 * @access Private
 */
router.get('/suggestions', friendController.getFriendSuggestions);

/**
 * @route GET /api/friends/status/:user_id
 * @desc Get friendship status with another user
 * @access Private
 */
router.get('/status/:user_id', friendController.getFriendshipStatus);

module.exports = router;
