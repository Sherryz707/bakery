const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const factory = require("./factoryHandler");
// const Inventory
const ObjectId = mongoose.Types.ObjectId;
const Inventory = require("../models/inventoryModel");
const Email = require("../utils/email");
const Category = require("../models/categoryModel");
const { parse: uuidParse } = require("uuid");

exports.addItem = catchAsync(async (req, res, next) => {
  doc = await add_item_to_cart(
    req.body._id,
    req.params.id,
    req.body.name,
    req.body.sku,
    req.body.qty,
    req.body.extra,
    req.body.standard,
    req.body.uuid,
    req.body.size,
    req.body.unitPrice,
    req.body.totalPrice
  );

  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});
exports.deleteItem = catchAsync(async (req, res, next) => {
  const cart_id = req.params.id;
  const { uuid } = req.body;
  let doc = await Cart.deleteOne({
    _id: cart_id,
    status: "active",
  }, { $pull: {items:{ "items.uuid": uuid } }}).lean();

  console.log(doc);
  if (doc.deletedCount<1) {
    return next(new AppError("Error deleting document", 500));
  }
  res.status(204).json({
    status: "success",
    data: null,
  });
});
exports.updateCart = catchAsync(async (req, res, next) => {
  const cart_id = req.params.id;
  let doc;
  if (req.body.sku && req.body.new_qty && req.body.old_qty && req.body.uuid) {
    doc = await update_quantity(
      req.params.id,
      req.body.uuid,
      req.body.sku,
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
    const {
      _id,
      uuid,
      name,
      sku,
      qty,
      size,
      unitPrice,
      totalPrice,
      extra,
      standard,
    } = req.body;
    const update = req.body;
    doc = await Cart.findOneAndUpdate(
      {
        _id: cart_id,
        status: "active",
        "items.uuid": uuid,
      },
      {
        $set: {
          "items.$.name": name,
          "items.$.sku": sku,
          "items.$.qty": qty,
          "items.$.unitPrice": unitPrice,
          "items.$.totalPrice": totalPrice,
          "items.$.extra": extra,
          "items.$.standard": standard,
          "items.$.size": size,
        },
      },
      {
        new: true,
      }
    );
    console.log("cart outptu", doc);
    if (!doc) {
      return next(new AppError("No document found with that ID", 404));
    }
    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  }
});

function collectPayment() {
  return true;
}

exports.payment = catchAsync(async (req, res, next) => {
  console.log(req.params.id);
  const doc = await checkout(req);
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

  const items = await Inventory.find({
    "carted.timestamp": { $lt: threshold },
  });
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
    await Inventory.updateOne(
      { _id: item._id, "carted.cart_id": cart._id },
      {
        $set: { "carted.$.timestamp": now },
      }
    );
    delete carted[cart._id];
  }

  for (const [cartId, cartedItem] of Object.entries(carted)) {
    await Inventory.updateOne(
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
      const itemdoc = await Inventory.findOneAndUpdate(
        { _id: item.sku, "carted.cart_id": cart._id },
        { $inc: { qty: item.qty }, $pull: { carted: { cart_id: cart._id } } }
      );
    }
    await Cart.deleteOne({ _id: cart._id }, { $set: { status: "expired" } });
    // await Cart.deleteOne({ _id: cart._id, });
  }
}
async function checkout(req) {
  cart_id = new ObjectId(req.params.id);
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
  if (req.user) {
    const url = `${req.protocol}://${req.get("host")}/cart/${paidCartDoc._id}`;
    await new Email(req.user, url).sendOrderConfirm(paidCartDoc._id);
  }
  await Inventory.updateMany(
    { "carted.cart_id": cart_id },
    {
      $pull: { carted: { cart_id: cart_id } },
    }
  );
  return paidCartDoc;
}
async function update_quantity(cart_id,uuid, sku, old_qty, new_qty) {
  sku = new ObjectId(sku);
  cart_id = new ObjectId(cart_id);
  const now = Date.now();
  const delta_qty = new_qty - old_qty;
  // change this and search by uuid instead
  const updatedCartResult = await Cart.findOneAndUpdate(
    {
      _id: cart_id,
      status: "active",
      "items.uuid": uuid,
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

  const updatedInventoryResult = await Inventory.findOneAndUpdate(
    {
      _id: sku,
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

  if (!updatedInventoryResult) {
    const doc = await Cart.findOneAndUpdate(
      { _id: cart_id, "items.uuid": uuid },
      {
        $inc: { "items.$.qty": -delta_qty },
      }
    );
    if (!doc) {
      throw new AppError("No cart found with that id");
    }
    throw new AppError("Insufficient inventory to add this item to the cart.");
  }
  return [updatedCartResult, updatedInventoryResult];
}
// [{"extra_id":123,"name":"syrup"}]
async function add_item_to_cart(
  item_id,
  cart_id,
  name,
  sku,
  qty,
  extra,
  standard,
  uuid,
  size,
  unitPrice,
  totalPrice
) {
  const now = Date.now();
  cart_id = new ObjectId(cart_id);
  sku = new ObjectId(sku);
  const cartUpdateResult = await Cart.findOneAndUpdate(
    { _id: cart_id, status: "active" },
    {
      $set: { last_modified: now },
      $push: {
        items: {
          _id: item_id,
          uuid,
          name,
          sku,
          qty,
          size,
          unitPrice,
          totalPrice,
          extra,
          standard,
        },
      },
    },
    {
      new: true,
    }
  );
  console.log("cart output", cartUpdateResult);
  if (!cartUpdateResult) {
    throw new AppError("The cart is no longer active");
  }
  const productUpdateResult = await Inventory.findOneAndUpdate(
    {
      _id: sku,
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
        $pull: { items: { sku: sku } },
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
// async function add_item_to_cart(
//   item_id,
//   cart_id,
//   name,
//   sku,
//   qty,
//   extra,
//   standard,
//   uuid,
//   size,
//   user
// ) {
//   const now = Date.now();
//   cart_id = new ObjectId(cart_id);
//   sku = new ObjectId(sku);
//   // Fetch unitPrice from Inventory
//   const inventory = await Inventory.findById(sku).lean().select("price");
//   const unitPrice = inventory.price;
//   console.log("unit price", unitPrice,uuid);
//   // Fetch extra IDs for details

//   let extraDocuments = [];
//   let extraPrice = 0;
//   for (let el of extra) {
//     const id = new ObjectId(el._id);
//     let result = await Category.aggregate([
//       { $unwind: "$customization" },
//       { $match: { "customization._id": id } },
//       {
//         $project: {
//           _id: false,
//           price: "$customization.price",
//           name: "$customization.name",
//         },
//       },
//     ]);
//     extraPrice += result[0].price;
//     extraDocuments.push(...result);
//   }
//   console.log("extra", extraDocuments);
//   const totalPrice = qty * (unitPrice + extraPrice);
//   console.log(totalPrice, "totalPrice");
//   console.log(cart_id);
//   const cartUpdateResult = await Cart.findOneAndUpdate(
//     { _id: cart_id, status: "active" },
//     {
//       $set: { last_modified: now },
//       $push: {
//         items: {
//           _id: item_id,
//           uuid,
//           name,
//           sku,
//           qty,
//           size,
//           unitPrice,
//           totalPrice,
//           extra: extraDocuments,
//           standard,
//         },
//       },
//     },
//     {
//       new: true,
//     }
//   );
//   console.log("cart output", cartUpdateResult);
//   if (!cartUpdateResult) {
//     throw new AppError("The cart is no longer active");
//   }
//   const productUpdateResult = await Inventory.findOneAndUpdate(
//     {
//       _id: sku,
//       qty: { $gte: qty },
//     },
//     {
//       $inc: { qty: -qty },
//       $push: { carted: { qty, cart_id, timestamp: now } },
//     },
//     {
//       new: true,
//     }
//   );
//   if (!productUpdateResult) {
//     const doc = await Cart.findByIdAndUpdate(
//       cart_id,
//       {
//         $pull: { items: { sku: sku } },
//       },
//       {
//         new: true,
//       }
//     );
//     if (!doc) {
//       throw new AppError("No cart found with that id");
//     }
//     throw new AppError("Insufficient inventory to add this item to the cart.");
//   }
//   return [cartUpdateResult, productUpdateResult];
// }
exports.getUserCart = catchAsync(async (req, res, next) => {
  const doc = await Cart.find({ user: req.user._id });

  res.status(200).json({
    status: "success",
    doc,
  });
});
exports.addUserIdToCart = catchAsync(async (req, res, next) => {
  if (req.user) {
    req.body.user = req.user._id;
    return next();
  }
  next();
});
exports.createCart = factory.createOne(Cart);
exports.getAllCart = factory.getAll(Cart);
exports.deleteAllCart = factory.deleteAll(Cart);
exports.editCart = catchAsync(async (req, res, next) => {
  const cart = await Cart.findOneAndUpdate(
    {
      _id: cart_id,
      status: "active",
      "items.uuid": uuid,
    },
    req.body,
    {
      new: true,
    }
  );

  if (!doc) {
    return next(new AppError("No document found with that ID", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});
