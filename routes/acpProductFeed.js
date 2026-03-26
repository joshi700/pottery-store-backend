const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// ============================================================
// GET /acp/products.json — ACP Product Feed
// Returns structured product data for AI agent discovery
// ============================================================
router.get('/products.json', async (req, res) => {
  try {
    const products = await Product.find({ isAvailable: true, quantity: { $gt: 0 } })
      .sort({ isFeatured: -1, createdAt: -1 });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const feed = {
      version: '1.0',
      merchant: {
        name: 'Pottery Store',
        url: clientUrl,
        currency: 'inr',
        country: 'IN'
      },
      products: products.map(product => ({
        id: product._id.toString(),
        title: product.name,
        description: product.description,
        url: `${clientUrl}/product/${product._id}`,
        price: {
          amount: Math.round(product.price * 100), // paise
          currency: 'inr'
        },
        images: product.images.map(img => ({ url: img })),
        availability: {
          in_stock: product.isAvailable && product.quantity > 0,
          quantity: product.quantity
        },
        category: product.category,
        attributes: {
          materials: product.materials || [],
          dimensions: product.dimensions || {},
          care_instructions: product.careInstructions || '',
          artist_story: product.story || ''
        },
        tags: product.tags || [],
        featured: product.isFeatured
      })),
      updated_at: new Date().toISOString()
    };

    res.json(feed);
  } catch (error) {
    console.error('ACP product feed error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'Failed to generate product feed'
    });
  }
});

module.exports = router;
