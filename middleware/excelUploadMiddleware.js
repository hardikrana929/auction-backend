const path = require("path");
const multer = require("multer");

// .xlsx only. Some browsers send application/octet-stream for Excel files, so
// the extension is the primary check; the controller additionally verifies the
// file really is a ZIP container (xlsx) before parsing it.
const allowedMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
  "application/zip",
]);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || "").toLowerCase();
  if (extension !== ".xlsx" || !allowedMimeTypes.has(file.mimetype)) {
    const error = new Error("Only Excel .xlsx files are allowed");
    error.statusCode = 400;
    return cb(error, false);
  }
  cb(null, true);
};

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
