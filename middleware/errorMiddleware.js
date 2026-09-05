const mongoose = require("mongoose");

// Global Error Handler
const errorHandler = (err, req, res, next) => {
    console.error("=================================");
    console.error("API ERROR");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("=================================");

    // Default values
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal server error";
    let errors = null;

    // Mongoose Validation Error
    if (err instanceof mongoose.Error.ValidationError) {
        statusCode = 400;
        message = "Validation failed";

        errors = Object.values(err.errors).map(
            (error) => ({
                field: error.path,
                message: error.message,
            })
        );
    }

    // Invalid MongoDB ObjectId
    else if (err instanceof mongoose.Error.CastError) {
        statusCode = 400;
        message = `Invalid ${err.path || "ID"}`;

        errors = {
            field: err.path,
            value: err.value,
        };
    }

    // Duplicate MongoDB key
    else if (err.code === 11000) {
        statusCode = 409;

        const duplicateFields = Object.keys(
            err.keyValue || {}
        );

        const field =
            duplicateFields.length > 0
                ? duplicateFields.join(", ")
                : "field";

        message = `Duplicate value for ${field}`;

        errors = err.keyValue;
    }

    // Mongoose Version Error
    else if (
        err instanceof mongoose.Error.VersionError
    ) {
        statusCode = 409;
        message =
            "Data was modified by another request. Please try again.";
    }

    // JWT Errors
    else if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        message = "Invalid authentication token";
    }

    // Expired JWT
    else if (err.name === "TokenExpiredError") {
        statusCode = 401;
        message = "Authentication token has expired";
    }

    // Syntax Error / Invalid JSON
    else if (
        err instanceof SyntaxError &&
        err.status === 400 &&
        "body" in err
    ) {
        statusCode = 400;
        message = "Invalid JSON request body";
    }

    // Production response
    const response = {
        success: false,
        message,
    };

    if (errors) {
        response.errors = errors;
    }

    // Don't expose stack in production
    if (process.env.NODE_ENV !== "production") {
        response.stack = err.stack;
    }

    return res.status(statusCode).json(response);
};

module.exports = errorHandler;