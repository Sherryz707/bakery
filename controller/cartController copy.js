const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const factory = require("./factoryHandler");
const Product = require("../models/productModel");
const ObjectId = mongoose.Types.ObjectId;

exports.updateCart = catchAsync(async (req, res, next) => {
  let doc;
  if (req.params.id && req.body.product && req.body.qty && req.body.details) {
    doc = await add_item_to_cart(
      req.params.id,
      req.body.product,
      req.body.qty,
      req.body.details
    );

    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  } else if (req.body.product && req.body.new_qty && req.body.old_qty) {
    const doc = await update_quantity(
      req.params.id,
      req.body.product,
      req.body.old_qty,
      req.body.new_qty
    );
    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  } else {
    return next(
      new AppError("Request is missing the required parameters", 400)
    );
  }
});
function collectPayment() {
  return true;
}

exports.payment = catchAsync(async (req, res, next) => {
  console.log(req.params.id);
  const doc = await checkout(req.params.id);
  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});
exports.expireCarts = catchAsync(async (req, res, next) => {
  await expire_carts();
  res.status(200).json({
    status: "success",
  });
});

async function cleanup_inventory() {
  const now = Date.now();
  const timeoutInSeconds = 5 * 60;
  const threshold = new Date(Date.now() - timeoutInSeconds * 1000);

  const items = await Product.find({ "carted.timestamp": { $lt: threshold } });
  for (let item of items) {
    const carted = {};
    item.carted.forEach((cartedItem) => {
      if (cartedItem.timestamp < threshold) {
        carted[cartedItem.cart_id] = cartedItem;
      }
    });
  }

  const activeCarts = await Cart.find({
    _id: { $in: Object.keys(carted) },
    status: "active",
  });

  for (const cart of activeCarts) {
    const cartedItem = carted[cart._id];
    await Product.updateOne(
      { _id: item._id, "carted.cart_id": cart._id },
      {
        $set: { "carted.$.timestamp": now },
      }
    );
    delete carted[cart._id];
  }

  for (const [cartId, cartedItem] of Object.entries(carted)) {
    await Product.updateOne(
      { _id: item._id, "carted.cart_id": cartId },
      {
        $inc: { qty: cartedItem.qty },
        $pull: { carted: { cart_id: cartId } },
      }
    );
  }
}
async function expire_carts() {
  const timeoutInSeconds = 5 * 60;
  const threshold = new Date(Date.now() - timeoutInSeconds * 1000);

  await Cart.updateMany(
    { status: "active", last_modified: { $lt: threshold } },
    {
      $set: { status: "expiring" },
    }
  );

  const carts = await Cart.find({ status: "expiring" }).lean();
  console.log("lean cart of expiring", carts, carts.length);

  if (!carts) {
    return;
  }
  for (let cart of carts) {
    for (let item of cart.items) {
      const itemdoc = await Product.findOneAndUpdate(
        { _id: item.product_id, "carted.cart_id": cart._id },
        { $inc: { qty: item.qty }, $pull: { carted: { cart_id: cart._id } } }
      );
      console.log("returning item", itemdoc);
    }
    await Cart.updateOne({ _id: cart._id }, { $set: { status: "expired" } });
  }
}
async function checkout(cart_id) {
  cart_id = new ObjectId(cart_id);
  const now = Date.now();

  const updatedCartResult = await Cart.findOneAndUpdate(
    { _id: cart_id, status: "active" },
    {
      $set: { status: "pending", last_modified: now },
    },
    {
      new: true,
    }
  );
  if (!updatedCartResult) {
    throw new AppError("cart is inactive");
  }
  try {
    collectPayment();
  } catch (err) {
    await Cart.findByIdAndUpdate(cart_id, { $set: { status: "active" } });
    throw new AppError("payment failed.Please try again.");
  }
  const paidCartDoc = await Cart.findByIdAndUpdate(
    cart_id,
    {
      $set: { status: "complete" },
    },
    { new: true }
  );
  await Product.updateMany(
    { "carted.cart_id": cart_id },
    {
      $pull: { carted: { cart_id: cart_id } },
    }
  );
  return paidCartDoc;
}
async function update_quantity(cart_id, product_id, old_qty, new_qty) {
  product_id = new ObjectId(product_id);
  cart_id = new ObjectId(cart_id);

  const now = Date.now();
  const delta_qty = new_qty - old_qty;

  const updatedCartResult = await Cart.findOneAndUpdate(
    {
      _id: cart_id,
      status: "active",
      "items.product_id": product_id,
    },
    {
      $set: { last_modified: now },
      $inc: { "items.$.qty": delta_qty },
    },
    {
      new: true,
    }
  );
  console.log("updated cart", updatedCartResult, delta_qty);
  if (!updatedCartResult) {
    throw new AppError("cart is inactive");
  }

  const updatedProductResult = await Product.findOneAndUpdate(
    {
      _id: product_id,
      "carted.cart_id": cart_id,
      qty: { $gte: delta_qty },
    },
    {
      $inc: { qty: -delta_qty },
      $set: { "carted.$.qty": new_qty, timestamp: now },
    },
    {
      new: true,
    }
  );

  if (!updatedProductResult) {
    const doc = await Cart.findOneAndUpdate(
      { _id: cart_id, "items.product_id": product_id },
      {
        $inc: { "items.$.qty": -delta_qty },
      }
    );
    if (!doc) {
      throw new AppError("No cart found with that id");
    }
    throw new AppError("Insufficient inventory to add this item to the cart.");
  }
  return [updatedCartResult, updatedProductResult];
}
async function add_item_to_cart(cart_id, product_id, qty, details) {
  const now = Date.now();
  cart_id = new ObjectId(cart_id);
  product_id = new ObjectId(product_id);
  // make sure cart is still active and add line item
  // {
  //     cart_id:
  //     product_id
  //     qty
  //     details
  // }
  console.log(cart_id);
  const cartUpdateResult = await Cart.findOneAndUpdate(
    { _id: cart_id, status: "active" },
    {
      $set: { last_modified: now },
      $push: { items: { product_id, qty, details } },
    },
    {
      new: true,
    }
  );
  console.log("cart output", cartUpdateResult);
  if (!cartUpdateResult) {
    throw new AppError("The cart is no longer active");
  }
  const productUpdateResult = await Product.findOneAndUpdate(
    {
      _id: product_id,
      qty: { $gte: qty },
    },
    {
      $inc: { qty: -qty },
      $push: { carted: { qty, cart_id, timestamp: now } },
    },
    {
      new: true,
    }
  );
  if (!productUpdateResult) {
    const doc = await Cart.findByIdAndUpdate(
      cart_id,
      {
        $pull: { items: { product_id: product_id } },
      },
      {
        new: true,
      }
    );
    if (!doc) {
      throw new AppError("No cart found with that id");
    }
    throw new AppError("Insufficient inventory to add this item to the cart.");
  }
  return [cartUpdateResult, productUpdateResult];
}
exports.createCart = factory.createOne(Cart);
exports.getAllCart = factory.getAll(Cart);
exports.deleteAllCart = factory.deleteAll(Cart);
