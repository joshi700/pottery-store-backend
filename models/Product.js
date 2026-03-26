const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  images: [{
    type: String,
    required: true
  }],
  category: {
    type: String,
    required: true,
    enum: ['bowls', 'plates', 'cups', 'vases', 'decorative', 'other']
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 0
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  dimensions: {
    height: String,
    width: String,
    weight: String
  },
  materials: [String],
  careInstructions: String,
  story: String, // Artist's note about the piece
  isFeatured: {
    type: Boolean,
    default: false
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp
productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Automatically set isAvailable based on quantity
productSchema.pre('save', function(next) {
  if (this.quantity <= 0) {
    this.isAvailable = false;
  }
  next();
});

// Method to check if product is in stock
productSchema.methods.isInStock = function() {
  return this.quantity > 0 && this.isAvailable;
};

// Method to decrease quantity
productSchema.methods.decreaseQuantity = async function(amount = 1) {
  if (this.quantity >= amount) {
    this.quantity -= amount;
    if (this.quantity === 0) {
      this.isAvailable = false;
    }
    await this.save();
    return true;
  }
  return false;
};

// Method to increase quantity
productSchema.methods.increaseQuantity = async function(amount = 1) {
  this.quantity += amount;
  if (this.quantity > 0) {
    this.isAvailable = true;
  }
  await this.save();
  return true;
};

module.exports = mongoose.model('Product', productSchema);
