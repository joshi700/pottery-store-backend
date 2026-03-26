const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');

// Initialize Google OAuth client
const getGoogleClient = () => {
  return new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
};

// @route   POST /api/auth/google
// @desc    Login or register with Google
// @access  Public
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential is required'
      });
    }

    // Verify the Google token
    const client = getGoogleClient();
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId, picture } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email not provided by Google'
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (user) {
      // Existing user — link Google ID if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    } else {
      // New user — create account with a random password (they'll use Google login)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await User.create({
        email,
        name: name || email.split('@')[0],
        phone: '',
        password: randomPassword,
        googleId,
      });
    }

    // Generate JWT token
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        isAdmin: user.isAdmin,
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Google authentication failed',
      error: error.message
    });
  }
});

module.exports = router;
