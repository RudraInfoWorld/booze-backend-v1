const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * @route POST /api/auth/otp/request
 * @desc Request OTP for phone verification
 * @access Public
 */
router.post(
  '/otp/request',
  [
    body('phone').notEmpty().withMessage('Phone number is required')
      .matches(/^\+[1-9]\d{1,14}$/).withMessage('Please provide a valid international phone number with country code')
  ],
  authController.requestOTP
);

/**
 * @route POST /api/auth/register/phone
 * @desc Register with phone and OTP
 * @access Public
 */
router.post(
  '/register/phone',
  [
    body('phone').notEmpty().withMessage('Phone number is required')
      .matches(/^\+[1-9]\d{1,14}$/).withMessage('Please provide a valid international phone number with country code'),
    body('otp').notEmpty().withMessage('OTP is required')
      .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
  ],
  authController.registerWithPhone
);

/**
 * @route POST /api/auth/login/phone
 * @desc Login with phone and OTP
 * @access Public
 */
router.post(
  '/login/phone',
  [
    body('phone').notEmpty().withMessage('Phone number is required')
      .matches(/^\+[1-9]\d{1,14}$/).withMessage('Please provide a valid international phone number with country code'),
    body('otp').notEmpty().withMessage('OTP is required')
      .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
  ],
  authController.loginWithPhone
);

/**
 * @route POST /api/auth/login/social
 * @desc Login with social provider (Google, Apple)
 * @access Public
 */
router.post(
  '/login/social',
  [
    body('provider').notEmpty().withMessage('Provider is required')
      .isIn(['google', 'apple']).withMessage('Provider must be google or apple'),
    body('provider_token').notEmpty().withMessage('Provider token is required')
  ],
  authController.loginWithSocial
);

/**
 * @route POST /api/auth/token/refresh
 * @desc Refresh token
 * @access Public
 */
router.post(
  '/token/refresh',
  [
    body('refresh_token').notEmpty().withMessage('Refresh token is required')
  ],
  authController.refreshToken
);

/**
 * @route POST /api/auth/logout
 * @desc Logout
 * @access Private
 */
router.post(
  '/logout',
  authenticate,
  authController.logout
);

/**
 * @route GET /api/auth/sessions
 * @desc Get login activity
 * @access Private
 */
router.get(
  '/sessions',
  authenticate,
  authController.getLoginActivity
);

module.exports = router;