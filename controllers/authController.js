const User = require('../models/User');
const generateToken = require('../utils/generateToken');

//Register User
const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        //Validate user input 
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            })
        }

        //Check user existence 
        const exitUser = await User.findOne({ email });
        if (exitUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists"
            });
        }

        //Create new User
        const user = await User.create({
            name,
            email,
            password,
        })

        const token = generateToken(user._id);
        return res.status(201).json({
            success: true,
            message: "User Registered Successfully",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            token,
        });

    } catch (error) {
        console.error("Register Error :", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
}

//Login User
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        //Input validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            })
        }
        const user = await User.findOne({ email }).select("+password");
        //Valid User or not 
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid Email or Password"
            })
        }
        //Check user is active or not
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: "User is not active."
            })
        }

        //password check
        const isPpasswordMatched = await user.comparePassword(password);
        if (!isPpasswordMatched) {
            return res.status(401).json({
                success: false,
                message: "Invalid Password."
            })
        }

        const token = generateToken(user._id);

        return res.status(200).json({
            success: true,
            message: "Login Successful",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            token,
        });
    } catch (error) {
        console.error("Login Error :", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        })
    }
}

//Get User Profile
const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }
        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("Get User Profile Error :", error);
        return res.status(500).json({
            success: false,
            message: "Server Error"
        })
    }
}

module.exports = { registerUser, loginUser, getUserProfile };