require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration — allow client and ACP agent origins
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:5173'
    ];
    // Allow requests with no origin (agents, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Allow any origin for /acp routes (agents come from various origins)
      callback(null, true);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Lazy MongoDB connection (works with Vercel serverless)
let dbConnected = false;
async function ensureDB() {
  if (dbConnected || mongoose.connection.readyState === 1) {
    dbConnected = true;
    return;
  }

  let mongoUri = process.env.MONGODB_URI;

  const isPlaceholder = !mongoUri || mongoUri.includes('username:password') || mongoUri.includes('placeholder');
  if (isPlaceholder) {
    console.log('No real MongoDB URI detected — starting in-memory MongoDB...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
    console.log('In-memory MongoDB started at:', mongoUri);
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');
  dbConnected = true;

  // Auto-seed if database is empty and using placeholder
  if (isPlaceholder) {
    await seedIfEmpty();
  }
}

async function seedIfEmpty() {
  const Product = require('./models/Product');
  const User = require('./models/User');

  const productCount = await Product.countDocuments();
  if (productCount > 0) return;

  console.log('Seeding database with sample data...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@pottery.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  await User.create({
    email: adminEmail,
    password: adminPassword,
    name: 'Admin',
    phone: '9876543210',
    isAdmin: true
  });

  const sampleProducts = [
    {
      name: 'Handcrafted Ceramic Bowl',
      description: 'A beautiful handcrafted ceramic bowl with a rustic glaze finish. Perfect for serving salads or as a decorative piece.',
      price: 1299,
      images: [
        'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800',
        'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800'
      ],
      category: 'bowls', quantity: 10,
      dimensions: { height: '8cm', width: '15cm', weight: '400g' },
      materials: ['Ceramic', 'Natural Clay', 'Food-safe glaze'],
      careInstructions: 'Hand wash only. Not suitable for microwave.',
      story: 'This bowl was crafted on the potter\'s wheel using traditional techniques.',
      isFeatured: true, tags: ['handmade', 'ceramic', 'rustic', 'bowl']
    },
    {
      name: 'Modern Minimalist Plate Set',
      description: 'Set of 2 elegant white ceramic plates with a smooth matte finish.',
      price: 1899,
      images: [
        'https://images.unsplash.com/photo-1610288672862-3d6f3c2c7d91?w=800',
        'https://images.unsplash.com/photo-1615485500834-bc10199bc255?w=800'
      ],
      category: 'plates', quantity: 8,
      dimensions: { height: '2cm', width: '25cm', weight: '600g' },
      materials: ['High-quality ceramic', 'Matte glaze'],
      careInstructions: 'Dishwasher safe. Microwave safe.',
      story: 'Inspired by Scandinavian design, combining functionality with aesthetic appeal.',
      isFeatured: true, tags: ['minimalist', 'modern', 'white', 'plates']
    },
    {
      name: 'Terracotta Coffee Mug',
      description: 'Warm terracotta coffee mug with a comfortable handle. Keeps your beverage warm longer.',
      price: 599,
      images: [
        'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800',
        'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=800'
      ],
      category: 'cups', quantity: 15,
      dimensions: { height: '10cm', width: '8cm', weight: '250g' },
      materials: ['Terracotta', 'Natural clay'],
      careInstructions: 'Hand wash recommended. Not microwave safe.',
      story: 'Made from natural terracotta clay with excellent heat retention.',
      isFeatured: false, tags: ['terracotta', 'coffee', 'mug', 'handmade']
    },
    {
      name: 'Blue Glazed Vase',
      description: 'Stunning blue-glazed ceramic vase with unique drip patterns.',
      price: 2499,
      images: [
        'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=800',
        'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=800'
      ],
      category: 'vases', quantity: 5,
      dimensions: { height: '25cm', width: '12cm', weight: '800g' },
      materials: ['Stoneware', 'Blue glaze'],
      careInstructions: 'Wipe clean with damp cloth. Handle with care.',
      story: 'The blue glaze creates unique patterns as it flows during firing.',
      isFeatured: true, tags: ['vase', 'blue', 'decorative', 'flowers']
    },
    {
      name: 'Rustic Serving Platter',
      description: 'Large oval serving platter with a beautiful rustic finish.',
      price: 1799,
      images: ['https://images.unsplash.com/photo-1610288672862-3d6f3c2c7d91?w=800'],
      category: 'plates', quantity: 6,
      dimensions: { height: '3cm', width: '35cm', weight: '1.2kg' },
      materials: ['Ceramic', 'Rustic glaze'],
      careInstructions: 'Hand wash only. Not oven safe.',
      story: 'Perfect for family gatherings, combining functionality with artisanal beauty.',
      isFeatured: false, tags: ['platter', 'serving', 'rustic', 'entertaining']
    },
    {
      name: 'Handpainted Decorative Pot',
      description: 'Small decorative pot with intricate handpainted designs.',
      price: 899,
      images: ['https://images.unsplash.com/photo-1610016302534-828f0f697d3f?w=800'],
      category: 'decorative', quantity: 12,
      dimensions: { height: '12cm', width: '10cm', weight: '300g' },
      materials: ['Ceramic', 'Hand-painted glaze'],
      careInstructions: 'Wipe clean. Not food safe.',
      story: 'Each design is hand-painted by the artist, making every piece unique.',
      isFeatured: false, tags: ['decorative', 'handpainted', 'pot', 'unique']
    },
    {
      name: 'Textured Mixing Bowl',
      description: 'Large mixing bowl with an interesting textured exterior.',
      price: 1499,
      images: ['https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800'],
      category: 'bowls', quantity: 7,
      dimensions: { height: '12cm', width: '25cm', weight: '900g' },
      materials: ['Stoneware', 'Food-safe glaze'],
      careInstructions: 'Dishwasher safe. Oven safe up to 180C.',
      story: 'The textured exterior provides a good grip while mixing.',
      isFeatured: false, tags: ['bowl', 'mixing', 'textured', 'kitchen']
    },
    {
      name: 'Ceramic Espresso Cup Set',
      description: 'Set of 4 small espresso cups with matching saucers.',
      price: 1199,
      images: ['https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800'],
      category: 'cups', quantity: 10,
      dimensions: { height: '6cm', width: '6cm', weight: '150g each' },
      materials: ['Porcelain', 'Glossy glaze'],
      careInstructions: 'Dishwasher and microwave safe.',
      story: 'Designed for espresso lovers, sized perfectly for a double shot.',
      isFeatured: false, tags: ['espresso', 'coffee', 'cups', 'set']
    }
  ];

  await Product.insertMany(sampleProducts);
  console.log(`Seeded ${sampleProducts.length} products + admin user (${adminEmail})`);
}

// DB middleware — ensures connection before handling requests
app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('DB connection error:', err);
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// Routes (registered synchronously so Vercel can see them)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/googleAuth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/agent', require('./routes/agent'));

// ACP (Agentic Commerce Protocol) routes
app.use('/acp', require('./routes/acp'));
app.use('/acp', require('./routes/acpProductFeed'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Pottery Store API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      orders: '/api/orders',
      payment: '/api/payment',
      acp_checkout: '/acp/checkout_sessions',
      acp_product_feed: '/acp/products.json'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Only listen when running directly (not on Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
