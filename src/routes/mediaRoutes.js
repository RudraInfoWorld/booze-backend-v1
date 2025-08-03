const express = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const mediaController = require('../controllers/mediaController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fileType = req.body.type === 'recording' ? 'recordings' : 'screenshots';
    cb(null, `uploads/media/${fileType}/`);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, req.user.id + '-' + uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for recordings
  fileFilter: function (req, file, cb) {
    if (req.body.type === 'screenshot') {
      // Accept images only
      if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
        return cb(new Error('Only image files are allowed for screenshots!'), false);
      }
    } else if (req.body.type === 'recording') {
      // Accept video/audio files
      if (!file.originalname.match(/\.(mp4|webm|mov|mp3|wav)$/)) {
        return cb(new Error('Only video/audio files are allowed for recordings!'), false);
      }
    } else {
      return cb(new Error('Invalid media type!'), false);
    }
    cb(null, true);
  }
});

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/media
 * @desc Store media (screenshot or recording)
 * @access Private
 */
router.post(
  '/',
  upload.single('file'),
  [
    body('room_id').notEmpty().withMessage('Room ID is required'),
    body('type').notEmpty().withMessage('Media type is required')
      .isIn(['screenshot', 'recording']).withMessage('Media type must be screenshot or recording')
  ],
  mediaController.storeMedia
);

/**
 * @route GET /api/media/user
 * @desc Get user's media records
 * @access Private
 */
router.get(
  '/user',
  mediaController.getUserMediaRecords
);

/**
 * @route GET /api/media/rooms/:room_id
 * @desc Get room media records
 * @access Private
 */
router.get(
  '/rooms/:room_id',
  mediaController.getRoomMediaRecords
);

/**
 * @route DELETE /api/media/:media_id
 * @desc Delete media record
 * @access Private
 */
router.delete(
  '/:media_id',
  mediaController.deleteMedia
);

module.exports = router;