const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  user: mongoose.ObjectId,
  last_modified: {
    type: Date,
    default: Date.now(),
    select: false,
  },
  totalPrice: Number,
  status: {
    type: String,
    enum: ["active", "pending", "complete", "expiring", "expired"],
    default: "active",
  },
  items: [
    {
      _id: mongoose.ObjectId,
      name: String,
      uuid: { type: String, unique: true },
      sku: mongoose.ObjectId,
      qty: Number,
      extra: [{ _id: mongoose.ObjectId, name: String, price: Number }],
      standard: [{ _id: mongoose.ObjectId, name: String }],
      unitPrice: Number,
      totalPrice: Number,
    },
  ],
});
const Cart = mongoose.model("cart", cartSchema);
module.exports = Cart;
