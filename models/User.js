const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({

    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        trim: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [8, "Password must be at least 8 characters long"],
        select: false
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },

    // Used by authController's forgotPassword/resetPassword flow.
    // Both are hidden by default (select: false) and only pulled in
    // explicitly via .select("+resetPasswordToken +resetPasswordExpires").
    resetPasswordToken: {
        type: String,
        select: false
    },
    resetPasswordExpires: {
        type: Date,
        select: false
    },

    // Forgot-password OTP (6-digit code sent by e-mail).
    // Only a keyed hash of the code is stored, never the code itself.
    passwordResetOtp: {
        type: String,
        select: false
    },
    passwordResetOtpExpires: {
        type: Date,
        select: false
    },
    passwordResetOtpAttempts: {
        type: Number,
        default: 0,
        select: false
    },
    passwordResetOtpSentAt: {
        type: Date,
        select: false
    }

},
    {
        timestamps: true
    }

);

// Speeds up the lookup in resetPassword() and lets expired/null tokens
// be excluded cheaply. sparse: true keeps users with no reset token
// (the vast majority, at any time) out of the index entirely.
userSchema.index(
    { resetPasswordToken: 1 },
    { sparse: true }
);

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return;
    }
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
}

module.exports = mongoose.model('User', userSchema);