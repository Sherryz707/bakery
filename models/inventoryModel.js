const mongoose = require("mongoose");
const inventorySchema = new mongoose.Schema({
  qty: {
    type: Number,
    default: 0,
  },
  carted: Array,
  price: {
    type: Number,
    default: 30,
  },
});

const Inventory = mongoose.model("inventory", inventorySchema);
module.exports = Inventory;
