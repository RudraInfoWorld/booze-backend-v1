const cloudinary = require("cloudinary").v2;
const logger = require('../config/logger');

// Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload media
const uploadMediaToCloudinary = (file , folder_name) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder: folder_name ? `Booze/${folder_name}` : "Booze",
      },
      (error, result) => {
        if (error) {
          logger.error("Error while uploading to Cloudinary:", error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    uploadStream.end(file.buffer);
  });
};

// Delete media by public_id
const deleteMediaFromCloudinary = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(
      publicId,
      { resource_type: "auto" }, 
      (error, result) => {
        if (error) {
          logger.error("Error while deleting from Cloudinary:", error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
  });
};

// Export both
module.exports = {
  uploadMediaToCloudinary,
  deleteMediaFromCloudinary
};
