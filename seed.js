require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected');

    // Clear existing data
    await User.deleteMany({});
    await Product.deleteMany({});
    console.log('🗑️  Cleared existing data');

    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pottery.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const admin = await User.create({
      email: adminEmail,
      password: adminPassword,
      name: 'Admin',
      phone: '9876543210',
      isAdmin: true
    });
    console.log(`✅ Admin user created: ${adminEmail}`);

    // Sample products
    const sampleProducts = [
      {
        name: 'Handcrafted Ceramic Bowl',
        description: 'A beautiful handcrafted ceramic bowl with a rustic glaze finish. Perfect for serving salads or as a decorative piece.',
        price: 1299,
        images: [
          'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800',
          'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800'
        ],
        category: 'bowls',
        quantity: 1,
        dimensions: {
          height: '8cm',
          width: '15cm',
          weight: '400g'
        },
        materials: ['Ceramic', 'Natural Clay', 'Food-safe glaze'],
        careInstructions: 'Hand wash only. Not suitable for microwave.',
        story: 'This bowl was crafted on the potter\'s wheel using traditional techniques. Each piece is unique with slight variations in color and texture.',
        isFeatured: true,
        tags: ['handmade', 'ceramic', 'rustic', 'bowl']
      },
      {
        name: 'Modern Minimalist Plate Set',
        description: 'Set of 2 elegant white ceramic plates with a smooth matte finish. Perfect for everyday dining or special occasions.',
        price: 1899,
        images: [
          'https://images.unsplash.com/photo-1610288672862-3d6f3c2c7d91?w=800',
          'https://images.unsplash.com/photo-1615485500834-bc10199bc255?w=800'
        ],
        category: 'plates',
        quantity: 1,
        dimensions: {
          height: '2cm',
          width: '25cm',
          weight: '600g'
        },
        materials: ['High-quality ceramic', 'Matte glaze'],
        careInstructions: 'Dishwasher safe. Microwave safe.',
        story: 'Inspired by Scandinavian design, these plates combine functionality with aesthetic appeal.',
        isFeatured: true,
        tags: ['minimalist', 'modern', 'white', 'plates']
      },
      {
        name: 'Terracotta Coffee Mug',
        description: 'Warm terracotta coffee mug with a comfortable handle. Keeps your beverage warm longer.',
        price: 599,
        images: [
          'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800',
          'https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=800'
        ],
        category: 'cups',
        quantity: 1,
        dimensions: {
          height: '10cm',
          width: '8cm',
          weight: '250g'
        },
        materials: ['Terracotta', 'Natural clay'],
        careInstructions: 'Hand wash recommended. Not microwave safe.',
        story: 'Made from natural terracotta clay, this mug has excellent heat retention properties.',
        isFeatured: false,
        tags: ['terracotta', 'coffee', 'mug', 'handmade']
      },
      {
        name: 'Blue Glazed Vase',
        description: 'Stunning blue-glazed ceramic vase with unique drip patterns. Perfect for fresh flowers or as a standalone piece.',
        price: 2499,
        images: [
          'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=800',
          'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=800'
        ],
        category: 'vases',
        quantity: 1,
        dimensions: {
          height: '25cm',
          width: '12cm',
          weight: '800g'
        },
        materials: ['Stoneware', 'Blue glaze'],
        careInstructions: 'Wipe clean with damp cloth. Handle with care.',
        story: 'The blue glaze creates unique patterns as it flows during firing, making each vase one of a kind.',
        isFeatured: true,
        tags: ['vase', 'blue', 'decorative', 'flowers']
      },
      {
        name: 'Rustic Serving Platter',
        description: 'Large oval serving platter with a beautiful rustic finish. Ideal for entertaining guests.',
        price: 1799,
        images: [
          'https://images.unsplash.com/photo-1610288672862-3d6f3c2c7d91?w=800'
        ],
        category: 'plates',
        quantity: 1,
        dimensions: {
          height: '3cm',
          width: '35cm',
          weight: '1.2kg'
        },
        materials: ['Ceramic', 'Rustic glaze'],
        careInstructions: 'Hand wash only. Not oven safe.',
        story: 'Perfect for family gatherings, this platter combines functionality with artisanal beauty.',
        isFeatured: false,
        tags: ['platter', 'serving', 'rustic', 'entertaining']
      },
      {
        name: 'Handpainted Decorative Pot',
        description: 'Small decorative pot with intricate handpainted designs. Great for small plants or as a trinket holder.',
        price: 899,
        images: [
          'https://images.unsplash.com/photo-1610016302534-828f0f697d3f?w=800'
        ],
        category: 'decorative',
        quantity: 1,
        dimensions: {
          height: '12cm',
          width: '10cm',
          weight: '300g'
        },
        materials: ['Ceramic', 'Hand-painted glaze'],
        careInstructions: 'Wipe clean. Not food safe.',
        story: 'Each design is hand-painted by the artist, making every piece unique.',
        isFeatured: false,
        tags: ['decorative', 'handpainted', 'pot', 'unique']
      },
      {
        name: 'Textured Mixing Bowl',
        description: 'Large mixing bowl with an interesting textured exterior. Functional and beautiful.',
        price: 1499,
        images: [
          'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=800'
        ],
        category: 'bowls',
        quantity: 1,
        dimensions: {
          height: '12cm',
          width: '25cm',
          weight: '900g'
        },
        materials: ['Stoneware', 'Food-safe glaze'],
        careInstructions: 'Dishwasher safe. Oven safe up to 180°C.',
        story: 'The textured exterior provides a good grip while mixing, combining form and function.',
        isFeatured: false,
        tags: ['bowl', 'mixing', 'textured', 'kitchen']
      },
      {
        name: 'Ceramic Espresso Cup Set',
        description: 'Set of 4 small espresso cups with matching saucers. Perfect for your morning coffee ritual.',
        price: 1199,
        images: [
          'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800'
        ],
        category: 'cups',
        quantity: 1,
        dimensions: {
          height: '6cm',
          width: '6cm',
          weight: '150g each'
        },
        materials: ['Porcelain', 'Glossy glaze'],
        careInstructions: 'Dishwasher and microwave safe.',
        story: 'Designed for espresso lovers, these cups are sized perfectly for a double shot.',
        isFeatured: false,
        tags: ['espresso', 'coffee', 'cups', 'set']
      }
    ];

    await Product.insertMany(sampleProducts);
    console.log(`✅ Created ${sampleProducts.length} sample products`);

    console.log('\n✨ Database seeded successfully!');
    console.log('\n📝 Admin Credentials:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log('\n⚠️  Please change the admin password after first login!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedDatabase();
