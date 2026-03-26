const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { protect } = require('../middleware/auth');
const {
  createRazorpayOrder,
} = require('../utils/razorpay');

// ============================================================
// Agent-Friendly Product APIs (FR-8.1, FR-8.2)
// Read-only, structured, machine-readable product endpoints
// ============================================================

// @route   GET /api/agent/products
// @desc    Get all products in structured agent-friendly format
// @access  Public (read-only)
router.get('/products', async (req, res) => {
  try {
    const { category, available, search, minPrice, maxPrice, featured, limit = 50, page = 1 } = req.query;

    const query = {};

    if (category) query.category = category;
    if (available === 'true') query.isAvailable = true;
    if (available === 'false') query.isAvailable = false;
    if (featured === 'true') query.isFeatured = true;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(query)
      .select('name description price images category quantity isAvailable dimensions materials isFeatured tags')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: {
        products: products.map(p => ({
          id: p._id,
          name: p.name,
          description: p.description,
          price: {
            amount: p.price,
            currency: 'USD',
            formatted: `$${p.price.toLocaleString()}`,
          },
          images: p.images,
          category: p.category,
          availability: {
            inStock: p.isAvailable && p.quantity > 0,
            quantity: p.quantity,
          },
          dimensions: p.dimensions,
          materials: p.materials,
          isFeatured: p.isFeatured,
          tags: p.tags,
        })),
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit),
        },
      },
      meta: {
        apiVersion: '1.0',
        categories: ['bowls', 'plates', 'cups', 'vases', 'decorative', 'other'],
      },
    });
  } catch (error) {
    console.error('Agent products error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PRODUCTS_FETCH_ERROR',
        message: 'Failed to fetch products',
      },
    });
  }
});

// @route   GET /api/agent/products/:id
// @desc    Get single product detail for agents
// @access  Public (read-only)
router.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product not found',
        },
      });
    }

    res.json({
      success: true,
      data: {
        id: product._id,
        name: product.name,
        description: product.description,
        price: {
          amount: product.price,
          currency: 'USD',
          formatted: `$${product.price.toLocaleString()}`,
        },
        images: product.images,
        category: product.category,
        availability: {
          inStock: product.isAvailable && product.quantity > 0,
          quantity: product.quantity,
        },
        dimensions: product.dimensions,
        materials: product.materials,
        careInstructions: product.careInstructions,
        story: product.story,
        isFeatured: product.isFeatured,
        tags: product.tags,
      },
    });
  } catch (error) {
    console.error('Agent product detail error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PRODUCT_FETCH_ERROR',
        message: 'Failed to fetch product',
      },
    });
  }
});

// @route   GET /api/agent/categories
// @desc    Get all categories with product counts
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, availableCount: { $sum: { $cond: ['$isAvailable', 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        categories: categories.map(c => ({
          name: c._id,
          totalProducts: c.count,
          availableProducts: c.availableCount,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'CATEGORIES_ERROR', message: 'Failed to fetch categories' },
    });
  }
});

// ============================================================
// Agent Checkout API (FR-8.3, FR-8.4)
// Agents create orders on behalf of authenticated users
// Returns hosted checkout URL
// ============================================================

// @route   POST /api/agent/checkout
// @desc    Create order and return hosted checkout URL for an authenticated user
// @access  Private (requires user authentication)
router.post('/checkout', protect, async (req, res) => {
  try {
    const { items, shippingAddress, billingAddress } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ITEMS',
          message: 'At least one item is required',
        },
      });
    }

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ADDRESS',
          message: 'Shipping address is required',
        },
      });
    }

    // Validate and calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: `Product not found: ${item.productId}`,
          },
        });
      }

      if (!product.isInStock()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'OUT_OF_STOCK',
            message: `Product out of stock: ${product.name}`,
          },
        });
      }

      const qty = item.quantity || 1;
      if (product.quantity < qty) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_STOCK',
            message: `Only ${product.quantity} available for: ${product.name}`,
          },
        });
      }

      subtotal += product.price * qty;
      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images?.[0] || '',
        price: product.price,
        quantity: qty,
      });
    }

    const shippingCost = subtotal >= 2000 ? 0 : 99;
    const total = subtotal + shippingCost;

    const finalBilling = billingAddress || shippingAddress;

    // Create order in database
    const order = await Order.create({
      user: req.user.id,
      items: orderItems,
      shippingAddress,
      billingAddress: finalBilling,
      subtotal,
      shippingCost,
      total,
      paymentStatus: 'pending',
    });

    // Create Razorpay order
    const razorpayOrder = await createRazorpayOrder(
      total,
      order.orderNumber,
      {
        orderId: order._id.toString(),
        userId: req.user.id,
        source: 'agent',
      }
    );

    // Update order with Razorpay ID
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    // Build hosted checkout URL (Razorpay Payment Link style)
    // The agent/frontend can redirect the user to this URL
    const checkoutUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/checkout?orderId=${order._id}`;

    res.json({
      success: true,
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          subtotal,
          shippingCost,
          total,
          currency: 'USD',
          items: orderItems.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
        },
        payment: {
          razorpayOrderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID,
        },
        checkoutUrl,
        instructions: 'Redirect the user to the checkoutUrl or use the payment details to initiate payment through the Razorpay SDK.',
      },
    });
  } catch (error) {
    console.error('Agent checkout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHECKOUT_ERROR',
        message: 'Failed to create checkout',
        detail: error.message,
      },
    });
  }
});

module.exports = router;
