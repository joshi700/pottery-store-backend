require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./models/Admin');

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@pottery.com' });
    if (existingAdmin) {
      console.log('Admin account already exists (admin@pottery.com)');
      process.exit(0);
    }

    // Create default admin
    await Admin.create({
      email: 'admin@pottery.com',
      password: 'admin123456',
      name: 'Store Admin'
    });

    console.log('Default admin account created:');
    console.log('  Email: admin@pottery.com');
    console.log('  Password: admin123456');
    console.log('  (Change this password after first login)');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
