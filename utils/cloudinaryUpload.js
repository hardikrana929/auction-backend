const cloudinary = require("../config/cloudinary");

const uploadToCloudinary = (buffer, folder, resourceType = "image") => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: resourceType,
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );

        uploadStream.end(buffer);
    });
};

const deleteFromCloudinary = (publicId) => {
    return new Promise((resolve, reject) => {
        if (!publicId) {
            return resolve(null);
        }

        cloudinary.uploader.destroy(
            publicId,
            {
                resource_type: "image",
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        );
    });
};

module.exports = {
    uploadToCloudinary,
    deleteFromCloudinary,
};