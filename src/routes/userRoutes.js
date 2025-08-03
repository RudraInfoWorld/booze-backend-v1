const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/profile-pictures/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user.id + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

/**
 * @route GET /api/users/profile
 * @desc Get user profile
 * @access Private
 */
router.get(
  '/profile',
  authenticate,
  userController.getProfile
);

/**
 * @route GET /api/users/:username
 * @desc Get user by username
 * @access Private
 */
router.get(
  '/:username',
  authenticate,
  userController.getUserByUsername
);

/**
 * @route GET /api/users/check-username
 * @desc Check username availability
 * @access Private
 */
router.get(
  '/check-username',
  authenticate,
  userController.checkUsername
);

/**
 * @route PUT /api/users/profile
 * @desc Update user profile
 * @access Private
 */
router.put(
  '/profile',
  authenticate,
  [
    body('username').optional()
      .isLength({ min: 3, max: 20 }).withMessage('Username must be between 3 and 20 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers and underscore'),
    body('bio').optional()
      .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
    body('interests').optional()
      .isArray().withMessage('Interests must be an array'),
    body('vibe_preference').optional()
      .isIn(['chill', 'moderate', 'party']).withMessage('Invalid vibe preference'),
    body('mode_preference').optional()
      .isIn(['solo', 'social']).withMessage('Invalid mode preference')
  ],
  userController.updateProfile
);

/**
 * @route POST /api/users/profile-picture
 * @desc Upload profile picture
 * @access Private
 */
router.post(
  '/profile-picture',
  authenticate,
  upload.single('image'),
  userController.uploadProfilePicture
);

/**
 * @route POST /api/users/ai-avatar
 * @desc Generate AI avatar
 * @access Private
 */
router.post(
  '/ai-avatar',
  authenticate,
  userController.generateAIAvatar
);

/**
 * @route PUT /api/users/status
 * @desc Update account status
 * @access Private
 */
router.put(
  '/status',
  authenticate,
  [
    body('status').notEmpty().withMessage('Status is required')
      .isIn(['active', 'away', 'do_not_disturb', 'invisible']).withMessage('Invalid status')
  ],
  userController.updateAccountStatus
);

/**
 * @route DELETE /api/users/account
 * @desc Delete account
 * @access Private
 */
router.delete(
  '/account',
  authenticate,
  userController.deleteAccount
);

/**
 * @route GET /api/users/search
 * @desc Search users
 * @access Private
 */
router.get(
  '/search',
  authenticate,
  userController.searchUsers
);

module.exports = router;