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

    const IMG_BASE = 'https://raw.githubusercontent.com/joshi700/pottery-store-backend/main/public/images/products';

    // Meenakshi Pottery - Real product catalog
    const sampleProducts = [
      // ===== PLATES & PLATTERS =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e71'),
        name: 'Leaf Imprint Oval Platters - Set of 2',
        description: 'A stunning pair of handcrafted oval platters with real leaf impressions pressed into the clay. One in warm amber glaze and the other in cool grey-blue. Perfect for serving appetizers or as decorative wall pieces.',
        price: 49.99,
        images: [
          `${IMG_BASE}/leaf-imprint-platters.jpg`
        ],
        category: 'plates',
        quantity: 5,
        dimensions: { height: '3cm', width: '30cm', weight: '800g' },
        materials: ['Stoneware', 'Natural leaf impressions', 'Food-safe glaze'],
        careInstructions: 'Hand wash only. Not microwave safe. Each piece is unique due to the natural leaf imprint process.',
        story: 'These platters are created by pressing real leaves into the wet clay before firing. The organic patterns left behind celebrate the beauty of nature in every piece.',
        isFeatured: true,
        tags: ['leaf-imprint', 'platter', 'serving', 'handmade', 'nature-inspired']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e72'),
        name: 'Abstract Geometric Serving Platter',
        description: 'A bold, large square serving platter featuring an abstract geometric pattern in deep blue and black. The sgraffito technique creates striking line work that makes this piece a conversation starter.',
        price: 54.99,
        images: [
          `${IMG_BASE}/abstract-geometric-platter.jpg`
        ],
        category: 'plates',
        quantity: 3,
        dimensions: { height: '3cm', width: '32cm', weight: '1.1kg' },
        materials: ['Stoneware', 'Blue and black glaze', 'Sgraffito technique'],
        careInstructions: 'Hand wash recommended. Food safe.',
        story: 'Inspired by contemporary abstract art, each line is carefully carved through the glaze to reveal the clay beneath, creating a unique geometric composition.',
        isFeatured: true,
        tags: ['geometric', 'abstract', 'platter', 'blue', 'sgraffito', 'modern']
      },

      // ===== JEWELRY =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e73'),
        name: 'Ceramic Bead Necklace',
        description: 'A beautiful handmade necklace featuring blue and pink textured cylindrical ceramic beads strung on a genuine leather cord. Each bead is individually hand-shaped and glazed.',
        price: 24.99,
        images: [
          `${IMG_BASE}/ceramic-bead-necklace.jpg`
        ],
        category: 'jewelry',
        quantity: 8,
        dimensions: { height: '2cm (beads)', width: '45cm (length)', weight: '40g' },
        materials: ['Porcelain beads', 'Leather cord', 'Metal clasp'],
        careInstructions: 'Avoid contact with water and perfume. Store flat to prevent leather stretching.',
        story: 'Each bead is individually wheel-thrown in miniature and glazed with unique patterns, making every necklace one of a kind.',
        isFeatured: true,
        tags: ['necklace', 'ceramic', 'beads', 'handmade', 'jewelry', 'leather']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e74'),
        name: 'Ceramic Feather Necklace',
        description: 'An elegant statement necklace featuring five delicate porcelain feather pendants alternating with brown clay disc accents. Strung on natural jute cord for an earthy, bohemian aesthetic.',
        price: 34.99,
        images: [
          `${IMG_BASE}/ceramic-feather-necklace.jpg`
        ],
        category: 'jewelry',
        quantity: 5,
        dimensions: { height: '6cm (feathers)', width: '50cm (length)', weight: '55g' },
        materials: ['Porcelain', 'Brown clay', 'Jute cord', 'Gold accents'],
        careInstructions: 'Handle delicately. The porcelain feathers are fragile. Store in a padded box.',
        story: 'Inspired by the lightness of real feathers, each porcelain piece is hand-shaped and painted with subtle gold accents to capture the organic beauty of nature.',
        isFeatured: true,
        tags: ['necklace', 'feather', 'porcelain', 'bohemian', 'statement', 'jewelry']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e75'),
        name: 'Ceramic Arc Pendant Necklace',
        description: 'A modern U-shaped ceramic pendant adorned with vibrant red and orange circular accents. Features a mixed-media cord with ceramic and glass beads in complementary tones.',
        price: 29.99,
        images: [
          `${IMG_BASE}/ceramic-arc-pendant.jpg`
        ],
        category: 'jewelry',
        quantity: 6,
        dimensions: { height: '5cm (pendant)', width: '6cm (pendant)', weight: '45g' },
        materials: ['Ceramic', 'Glass beads', 'Cotton cord', 'Glazed accents'],
        careInstructions: 'Avoid moisture. Clean gently with a dry cloth.',
        story: 'The arc shape symbolizes protection and embracing energy. Each dot of color is individually applied, making every pendant slightly different.',
        isFeatured: false,
        tags: ['necklace', 'pendant', 'arc', 'colorful', 'modern', 'jewelry']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e76'),
        name: 'Ocean Disc Ceramic Necklace',
        description: 'A stunning necklace featuring layered porcelain discs in ocean-inspired blue, white, and purple glazes. Each disc catches light beautifully, reminiscent of waves meeting the shore.',
        price: 27.99,
        images: [
          `${IMG_BASE}/ceramic-disc-necklace.jpg`
        ],
        category: 'jewelry',
        quantity: 7,
        dimensions: { height: '4cm (discs)', width: '40cm (length)', weight: '50g' },
        materials: ['Porcelain', 'Blue and purple glaze', 'Lapis lazuli beads', 'Leather cord'],
        careInstructions: 'Keep away from water. The glazes may vary with humidity.',
        story: 'Inspired by the colors of the Indian Ocean, these porcelain discs are dipped in multiple glazes to create a layered, wave-like effect.',
        isFeatured: false,
        tags: ['necklace', 'disc', 'ocean', 'blue', 'porcelain', 'jewelry']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e77'),
        name: 'Nautilus Shell Necklace',
        description: 'A striking necklace featuring three large round ceramic pendants with hand-painted blue nautilus shell motifs. Accented with small decorative beads on a natural suede cord.',
        price: 39.99,
        images: [
          `${IMG_BASE}/nautilus-shell-necklace.jpg`
        ],
        category: 'jewelry',
        quantity: 4,
        dimensions: { height: '5cm (pendants)', width: '48cm (length)', weight: '65g' },
        materials: ['Ceramic', 'Blue cobalt glaze', 'Decorative beads', 'Suede cord'],
        careInstructions: 'Handle with care. Ceramic pendants are durable but can chip if dropped.',
        story: 'The nautilus shell is a symbol of natural perfection and growth. Each spiral is carefully hand-painted using traditional cobalt blue pigment.',
        isFeatured: true,
        tags: ['necklace', 'nautilus', 'shell', 'blue', 'statement', 'jewelry']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e78'),
        name: 'Textured Crescent Pendant',
        description: 'A bold organic crescent-shaped pendant with a rich dotted texture in earthy golden and brown tones. Hung on a genuine leather cord for a primitive, elegant look.',
        price: 32.99,
        images: [
          `${IMG_BASE}/textured-crescent-pendant.jpg`
        ],
        category: 'jewelry',
        quantity: 6,
        dimensions: { height: '4cm', width: '10cm', weight: '35g' },
        materials: ['Stoneware', 'Textured glaze', 'Leather cord'],
        careInstructions: 'Wipe with dry cloth. Avoid prolonged water exposure.',
        story: 'The crescent shape is an ancient symbol found across cultures. The dotted texture is achieved by pressing tiny tools into wet clay before firing.',
        isFeatured: false,
        tags: ['pendant', 'crescent', 'textured', 'earthy', 'leather', 'jewelry']
      },

      // ===== WALL ART =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e79'),
        name: 'Ceramic Medallion Wall Art',
        description: 'A framed set of two handcrafted ceramic medallions with gold leaf accents on dark glazed clay. Mounted on natural burlap in a rustic wooden frame. A stunning centerpiece for any wall.',
        price: 89.99,
        images: [
          `${IMG_BASE}/ceramic-wall-art-frame.jpg`
        ],
        category: 'wall-art',
        quantity: 2,
        dimensions: { height: '60cm', width: '30cm', weight: '2.5kg' },
        materials: ['Ceramic', 'Gold leaf', 'Dark glaze', 'Burlap', 'Wooden frame'],
        careInstructions: 'Dust gently. Hang on a sturdy hook. Keep away from direct sunlight to preserve gold leaf.',
        story: 'These medallions combine the ancient art of gold leaf application with modern ceramic techniques. Each piece reflects light differently throughout the day.',
        isFeatured: true,
        tags: ['wall-art', 'medallion', 'gold-leaf', 'framed', 'luxury', 'home-decor']
      },

      // ===== VASES =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e7a'),
        name: 'Dark Textured Ceramic Vase',
        description: 'A large sculptural vase in dark matte clay with a hand-stitched texture pattern. Features an organic asymmetric shape that makes a bold statement. Perfect for displaying ceramic flower arrangements.',
        price: 59.99,
        images: [
          `${IMG_BASE}/dark-vase-ceramic-flowers.jpg`
        ],
        category: 'vases',
        quantity: 3,
        dimensions: { height: '35cm', width: '30cm', weight: '1.8kg' },
        materials: ['Dark stoneware', 'Matte glaze', 'Hand-textured surface'],
        careInstructions: 'Wipe with damp cloth. Water-tight for fresh flowers.',
        story: 'This vase breaks away from traditional symmetry, embracing the Japanese wabi-sabi aesthetic of beauty in imperfection.',
        isFeatured: false,
        tags: ['vase', 'dark', 'textured', 'sculptural', 'modern', 'large']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e7b'),
        name: 'Blue Geometric Cube Vase',
        description: 'A modern cube-shaped vase with intricate blue and white geometric sgraffito patterns. The bold abstract design makes this piece both a vase and a work of art.',
        price: 34.99,
        images: [
          `${IMG_BASE}/blue-geometric-cube-vase.jpg`
        ],
        category: 'vases',
        quantity: 5,
        dimensions: { height: '12cm', width: '12cm', weight: '600g' },
        materials: ['Stoneware', 'Blue cobalt glaze', 'Sgraffito technique'],
        careInstructions: 'Hand wash only. Waterproof interior.',
        story: 'The cube shape challenges traditional vase forms while the sgraffito technique creates patterns by scratching through layers of colored slip to reveal the clay beneath.',
        isFeatured: false,
        tags: ['vase', 'cube', 'geometric', 'blue', 'sgraffito', 'modern']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e7c'),
        name: 'Terracotta Sgraffito Vase',
        description: 'A warm terracotta vase with delicate white sgraffito floral and leaf patterns. Features a ceramic flower accent attached to the surface, blending sculpture with functional pottery.',
        price: 44.99,
        images: [
          `${IMG_BASE}/terracotta-sgraffito-vase.jpg`
        ],
        category: 'vases',
        quantity: 3,
        dimensions: { height: '20cm', width: '15cm', weight: '900g' },
        materials: ['Terracotta', 'White slip', 'Ceramic flower accent'],
        careInstructions: 'Handle the flower accent with care. Wipe clean with damp cloth.',
        story: 'This piece combines the ancient sgraffito technique with sculptural flower elements, creating a vase that is itself a bouquet.',
        isFeatured: false,
        tags: ['vase', 'terracotta', 'sgraffito', 'floral', 'handmade']
      },

      // ===== CERAMIC FLOWERS =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e7d'),
        name: 'Ceramic Flower Stem - Mint Poppy',
        description: 'A beautifully handcrafted ceramic flower in soft mint green tones. Each petal is individually shaped and glazed for a lifelike appearance. Perfect as everlasting floral decor.',
        price: 14.99,
        images: [
          `${IMG_BASE}/ceramic-flower-mint.jpg`
        ],
        category: 'flowers',
        quantity: 15,
        dimensions: { height: '30cm (with stem)', width: '8cm (bloom)', weight: '80g' },
        materials: ['Porcelain', 'Mint green glaze', 'Steel wire stem'],
        careInstructions: 'Dust gently. Handle petals with care as they are delicate.',
        story: 'Each petal is individually hand-shaped from thin porcelain sheets and assembled by hand. No two flowers are exactly alike, just like in nature.',
        isFeatured: false,
        tags: ['flower', 'ceramic', 'mint', 'poppy', 'decor', 'everlasting']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e7e'),
        name: 'Ceramic Flower Stem - Pink Peony',
        description: 'A gorgeous ceramic peony flower in soft pink with delicate petal details and a realistic textured center. Brings eternal spring to any room.',
        price: 16.99,
        images: [
          `${IMG_BASE}/ceramic-flower-pink.jpg`
        ],
        category: 'flowers',
        quantity: 12,
        dimensions: { height: '32cm (with stem)', width: '10cm (bloom)', weight: '90g' },
        materials: ['Porcelain', 'Pink and rose glaze', 'Steel wire stem'],
        careInstructions: 'Dust gently with soft brush. Keep away from edges to prevent breakage.',
        story: 'The peony symbolizes beauty and honor. These ceramic versions capture the lush fullness of a peony in full bloom, preserved forever in porcelain.',
        isFeatured: true,
        tags: ['flower', 'ceramic', 'pink', 'peony', 'decor', 'everlasting']
      },
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e7f'),
        name: 'Blue Ceramic Flower Bouquet',
        description: 'A vibrant bouquet of handcrafted ceramic flowers in shades of blue and white, displayed on wire stems with ceramic leaves. Makes a stunning centerpiece that never wilts.',
        price: 44.99,
        images: [
          `${IMG_BASE}/ceramic-flower-stems-blue.jpg`
        ],
        category: 'flowers',
        quantity: 4,
        dimensions: { height: '35cm', width: '20cm', weight: '300g' },
        materials: ['Porcelain', 'Blue cobalt glaze', 'Steel wire stems', 'Ceramic leaves'],
        careInstructions: 'Dust regularly. Handle individual stems with care.',
        story: 'This bouquet brings together multiple flower varieties in the classic blue-and-white palette. Each flower is kiln-fired twice for durability and color depth.',
        isFeatured: false,
        tags: ['bouquet', 'flowers', 'blue', 'ceramic', 'centerpiece', 'decor']
      },

      // ===== CUPS =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e80'),
        name: 'Hand-painted Ceramic Cups Collection',
        description: 'A curated set of artisan ceramic cups featuring unique hand-painted designs including colorful birds, trees, and botanical motifs. Each cup is a small canvas showcasing traditional Indian art forms.',
        price: 19.99,
        images: [
          `${IMG_BASE}/handpainted-ceramic-cups.jpg`
        ],
        category: 'cups',
        quantity: 10,
        dimensions: { height: '10cm', width: '8cm', weight: '250g' },
        materials: ['Stoneware', 'Hand-painted glaze', 'Food-safe finish'],
        careInstructions: 'Hand wash recommended to preserve painted details. Food and beverage safe.',
        story: 'Each cup features a different hand-painted motif inspired by Indian folk art traditions. Collect them all or mix and match for an eclectic table setting.',
        isFeatured: true,
        tags: ['cups', 'hand-painted', 'birds', 'botanical', 'folk-art', 'colorful']
      },

      // ===== PLANTERS =====
      {
        _id: new mongoose.Types.ObjectId('69c4cf9cab387e77f81d6e81'),
        name: 'Owl Illustration Ceramic Planters - Set of 2',
        description: 'A charming pair of sage green ceramic cube planters with beautifully detailed owl illustrations. Hand-painted with intricate feather details and golden flower accents at the base.',
        price: 39.99,
        images: [
          `${IMG_BASE}/owl-ceramic-planters.jpg`
        ],
        category: 'planters',
        quantity: 4,
        dimensions: { height: '15cm', width: '12cm', weight: '700g' },
        materials: ['Stoneware', 'Sage green glaze', 'Hand-painted illustration', 'Drainage hole'],
        careInstructions: 'Suitable for indoor plants. Has drainage hole. Wipe exterior with damp cloth.',
        story: 'These planters celebrate the wise owl, a beloved motif in Indian art. Each owl is hand-painted with intricate feather details that take hours to complete.',
        isFeatured: false,
        tags: ['planter', 'owl', 'illustrated', 'green', 'cube', 'indoor-plants']
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
