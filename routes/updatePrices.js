const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// ONE-TIME endpoint to update all product prices
// DELETE THIS FILE after running it once
// Hit: GET https://your-backend.vercel.app/api/update-prices?key=meenakshi2026
router.get('/', async (req, res) => {
  try {
    // Simple secret key to prevent random access
    if (req.query.key !== 'meenakshi2026') {
      return res.status(403).json({ success: false, message: 'Invalid key' });
    }

    const priceUpdates = [
      { name: 'Handcrafted Ceramic Bowl',    newPrice: 29.99 },
      { name: 'Textured Mixing Bowl',        newPrice: 32.99 },
      { name: 'Terracotta Coffee Mug',       newPrice: 14.99 },
      { name: 'Ceramic Espresso Cup Set',    newPrice: 29.99 },
      { name: 'Handpainted Decorative Pot',  newPrice: 19.99 },
      { name: 'Modern Minimalist Plate Set', newPrice: 39.99 },
      { name: 'Rustic Serving Platter',      newPrice: 34.99 },
      { name: 'Blue Glazed Vase',            newPrice: 44.99 },
    ];

    const results = [];

    for (const update of priceUpdates) {
      const product = await Product.findOneAndUpdate(
        { name: update.name },
        { price: update.newPrice },
        { new: true }
      );

      results.push({
        name: update.name,
        updated: !!product,
        oldPrice: product ? undefined : 'not found',
        newPrice: product ? product.price : undefined
      });
    }

    res.json({
      success: true,
      message: 'Prices updated! DELETE this route now.',
      results
    });
  } catch (error) {
    console.error('Price update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
