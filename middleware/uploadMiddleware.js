const path = require("path");
const multer = require("multer");

const storage = multer.memoryStorage();
const allowedMimeTypes = new Set(["image/jpeg", "image/png"]);
const allowedExtensions = new Set([".jpg", ".jpeg", ".png"]);

const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
        return cb(new Error("Only JPG, JPEG and PNG image files are allowed"), false);
    }
    cb(null, true);
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1,
    },
});
