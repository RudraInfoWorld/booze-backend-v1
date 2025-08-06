const multer = require('multer');

const storage = multer.memoryStorage();

const uploadImage = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|avif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Multer middleware for document upload
const uploadDocs = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB limit
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(txt|pdf|doc|docx|xls|xlsx|ppt|pptx)$/i)) {
      return cb(new Error('Only document files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Multer middleware for video/audio files upload
const uploadMedia = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB limit
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(mp4|webm|mov|mp3|wav)$/)) {
      return cb(new Error('Only video/audio files are allowed for recordings!'), false);
    }
    cb(null, true);
  }
});

module.exports = {
  uploadImage,
  uploadDocs,
  uploadMedia
};