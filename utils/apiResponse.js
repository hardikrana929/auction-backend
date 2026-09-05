// Success response
const successResponse = (
    res,
    statusCode = 200,
    message = "Success",
    data = null
) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

// Error response
const errorResponse = (
    res,
    statusCode = 500,
    message = "Server error",
    errors = null
) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(errors && { errors }),
    });
};

module.exports = {
    successResponse,
    errorResponse,
};