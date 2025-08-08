const express = require('express');
const { body, query } = require('express-validator');
const mediaController = require('../controllers/mediaController');
const { authenticate } = require('../middleware/auth');
const { uploadImage, uploadMedia } = require('../middleware/multer');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Dynamic middleware selector
function mediaUploadMiddleware(req, res, next) {
  const type = req.query.type;
  if (!type) {
    return res.status(400).json({ error: 'Media type is required' });
  }

  if (type === 'screenshot') {
    uploadImage.single('file')(req, res, next);
  } else if (type === 'recording') {
    uploadMedia.single('file')(req, res, next);
  } else {
    return res.status(400).json({ error: 'Invalid media type' });
  }
}

/**
 * @route POST /api/media
 * @desc Store media (screenshot or recording)
 * @access Private
 */
router.post(
  '/',
  mediaUploadMiddleware,
  [
    body('room_id').notEmpty().withMessage('Room ID is required'),
    query('type')
      .notEmpty()
      .withMessage('Media type is required')
      .isIn(['screenshot', 'recording'])
      .withMessage('Media type must be screenshot or recording'),
  ],
  mediaController.storeMedia
);

/**
 * @route GET /api/media/user
 * @desc Get user's media records
 * @access Private
 */
router.get('/user', mediaController.getUserMediaRecords);

/**
 * @route GET /api/media/rooms/:room_id
 * @desc Get room media records
 * @access Private
 */
router.get('/rooms/:room_id', mediaController.getRoomMediaRecords);

/**
 * @route DELETE /api/media/:media_id
 * @desc Delete media record
 * @access Private
 */
router.delete('/:media_id', mediaController.deleteMedia);

module.exports = router;
