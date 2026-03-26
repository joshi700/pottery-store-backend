const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// Protect admin routes - verify admin JWT token against Admin collection
exports.isAdmin = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const admin = await Admin.findById(decoded.id).select('-password');
    if (!admin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin account not found.'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Invalid admin token.'
    });
  }
};
