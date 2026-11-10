const sendError = (res, error, fallback = "Request failed") => {
  if (error?.name === "ValidationError")
    return res
      .status(400)
      .json({
        success: false,
        message: Object.values(error.errors || {})[0]?.message || error.message,
      });
  if (error?.name === "CastError")
    return res
      .status(400)
      .json({ success: false, message: "Invalid identifier" });
  if (error?.code === 11000)
    return res
      .status(409)
      .json({
        success: false,
        message: "A record with this value already exists",
      });
  const status = Number(error?.statusCode);
  return res
    .status(status >= 400 && status < 500 ? status : 500)
    .json({
      success: false,
      message: status >= 400 && status < 500 ? error.message : fallback,
    });
};
module.exports = { sendError };
