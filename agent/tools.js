// Tools for the shopping assistant. Product data comes from MongoDB; the cart
// lives in the browser, so cart tools validate against the DB and return
// "actions" that the frontend applies. The assistant can never take payment.
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { LIMITS } = require('./guardrails');
const { shippingFor } = require('./storeFacts');

const CATEGORIES = Product.schema.path('category').enumValues;

const TOOL_DEFINITIONS = [
  {
    name: 'search_products',
    description: 'Search the catalog. Use for recommendations, browsing a category, or price-limited requests. Returns up to 8 products.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords matched against name, description and tags' },
        category: { type: 'string', enum: CATEGORIES },
        max_price: { type: 'number', description: 'USD' },
        min_price: { type: 'number', description: 'USD' },
        in_stock_only: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_product',
    description: 'Full details for one product: dimensions, materials, care instructions, the artist\'s story and stock.',
    parameters: {
      type: 'object',
      properties: { product_id: { type: 'string' } },
      required: ['product_id'],
    },
  },
  {
    name: 'get_cart',
    description: "The customer's current cart with subtotal, shipping and total.",
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the cart. Only when the customer clearly asks to add or buy it.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        quantity: { type: 'integer', minimum: 1, maximum: LIMITS.maxQuantity },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'update_cart_item',
    description: 'Change the quantity of a product already in the cart. Quantity 0 removes it.',
    parameters: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        quantity: { type: 'integer', minimum: 0, maximum: LIMITS.maxQuantity },
      },
      required: ['product_id', 'quantity'],
    },
  },
  {
    name: 'go_to_checkout',
    description: 'Take the customer to the checkout page to enter their address and pay with Google Pay. Only when they say they are ready.',
  },
];

const TOOLS = TOOL_DEFINITIONS.map(fn => ({ type: 'function', function: fn }));

class ToolError extends Error {}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inStock(p) {
  return p.isAvailable && p.quantity > 0;
}

// Compact product for the model and for chat product cards
function productSummary(p) {
  return {
    id: String(p._id),
    name: p.name,
    price: p.price,
    category: p.category,
    image: p.images?.[0] || '',
    in_stock: inStock(p),
    stock: p.quantity,
    short_description: p.description.length > 160 ? `${p.description.slice(0, 157)}...` : p.description,
  };
}

// Shape CartContext expects for addToCart()
function cartProduct(p) {
  return {
    _id: String(p._id),
    name: p.name,
    price: p.price,
    images: p.images,
    quantity: p.quantity,
    isAvailable: p.isAvailable,
  };
}

async function findProduct(id) {
  if (!mongoose.isValidObjectId(id)) throw new ToolError(`No product with id ${id}`);
  const product = await Product.findById(id).lean();
  if (!product) throw new ToolError(`No product with id ${id}`);
  return product;
}

// Re-price the client's cart from the database (client prices are never trusted)
async function pricedCart(cart) {
  const ids = cart.map(l => l.product_id);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map(p => [String(p._id), p]));
  const lines = cart
    .filter(l => byId.has(l.product_id))
    .map(l => {
      const p = byId.get(l.product_id);
      return { product_id: l.product_id, name: p.name, unit_price: p.price, quantity: l.quantity, line_total: +(p.price * l.quantity).toFixed(2) };
    });
  const subtotal = +lines.reduce((s, l) => s + l.line_total, 0).toFixed(2);
  const shipping = lines.length ? shippingFor(subtotal) : 0;
  return { items: lines, subtotal, shipping, total: +(subtotal + shipping).toFixed(2), currency: 'USD' };
}

function setCartLine(ctx, productId, quantity) {
  ctx.cart = ctx.cart.filter(l => l.product_id !== productId);
  if (quantity > 0) ctx.cart.push({ product_id: productId, quantity });
}

// Each handler returns { result, actions?, products? }
const HANDLERS = {
  async search_products({ query, category, max_price, min_price, in_stock_only }) {
    const filter = {};
    if (category && CATEGORIES.includes(category)) filter.category = category;
    if (in_stock_only) Object.assign(filter, { isAvailable: true, quantity: { $gt: 0 } });
    if (typeof max_price === 'number' || typeof min_price === 'number') {
      filter.price = {};
      if (typeof min_price === 'number') filter.price.$gte = min_price;
      if (typeof max_price === 'number') filter.price.$lte = max_price;
    }
    if (query?.trim()) {
      // Match any keyword, so "blue vase for flowers" still finds things
      const words = query.trim().split(/\s+/).filter(w => w.length > 2).slice(0, 6).map(escapeRegex);
      if (words.length) {
        const re = new RegExp(words.join('|'), 'i');
        filter.$or = [{ name: re }, { description: re }, { tags: re }, { materials: re }];
      }
    }
    const products = (await Product.find(filter).sort({ isFeatured: -1, createdAt: -1 }).limit(8).lean()).map(productSummary);
    return { result: { count: products.length, products }, products };
  },

  async get_product({ product_id }) {
    const p = await findProduct(product_id);
    return {
      result: {
        ...productSummary(p),
        description: p.description,
        dimensions: p.dimensions,
        materials: p.materials,
        care_instructions: p.careInstructions,
        artist_story: p.story,
        tags: p.tags,
        page: `/product/${p._id}`,
      },
      products: [productSummary(p)],
    };
  },

  async get_cart(_args, ctx) {
    return { result: await pricedCart(ctx.cart) };
  },

  async add_to_cart({ product_id, quantity = 1 }, ctx) {
    const p = await findProduct(product_id);
    if (!inStock(p)) throw new ToolError(`${p.name} is sold out.`);
    const current = ctx.cart.find(l => l.product_id === product_id)?.quantity || 0;
    const qty = Math.min(current + Math.max(1, Math.min(quantity, LIMITS.maxQuantity)), p.quantity);
    if (qty === current) throw new ToolError(`Only ${p.quantity} of ${p.name} in stock, and all are already in the cart.`);
    setCartLine(ctx, product_id, qty);
    return {
      result: { added: p.name, quantity_in_cart: qty, stock_limited: qty < current + quantity, cart: await pricedCart(ctx.cart) },
      actions: [{ type: 'add_to_cart', product: cartProduct(p), quantity: qty - current }],
    };
  },

  async update_cart_item({ product_id, quantity }, ctx) {
    if (!ctx.cart.some(l => l.product_id === product_id)) throw new ToolError('That product is not in the cart.');
    const p = await findProduct(product_id);
    const qty = Math.max(0, Math.min(quantity, p.quantity, LIMITS.maxQuantity));
    setCartLine(ctx, product_id, qty);
    return {
      result: { product: p.name, quantity_in_cart: qty, cart: await pricedCart(ctx.cart) },
      actions: [{ type: 'set_quantity', product_id, quantity: qty }],
    };
  },

  async go_to_checkout(_args, ctx) {
    if (!ctx.cart.length) throw new ToolError('The cart is empty.');
    return { result: { navigating_to: '/checkout', cart: await pricedCart(ctx.cart) }, actions: [{ type: 'navigate', path: '/checkout' }] };
  },
};

// Run a tool call; failures go back to the model as data instead of throwing
async function runTool(name, rawArgs, ctx) {
  const handler = HANDLERS[name];
  if (!handler) return { ok: false, result: { error: `Unknown tool: ${name}` } };
  let args;
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, result: { error: 'Tool arguments were not valid JSON' } };
  }
  try {
    return { ok: true, ...(await handler(args, ctx)) };
  } catch (err) {
    if (!(err instanceof ToolError)) console.error(`[Chat] Tool ${name} failed:`, err);
    return { ok: false, result: { error: err instanceof ToolError ? err.message : 'Tool failed' } };
  }
}

module.exports = { TOOLS, runTool };
