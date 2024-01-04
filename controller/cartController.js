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
const { default: Stripe } = require("stripe");


exports.getCart = factory.getOne(Cart);
exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  const cartID = req.params.cartID;
  const cart = await Cart.findOne({ _id: cartID });
  const lineItems = cart.items.map((item) => {
    // Create an array of all names from extras and standards
    const allNames = [
      ...item.extra.map((extra) => extra.name),
      ...item.standard.map((standard) => standard.name),
    ];

    return {
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
          description: allNames.join(", "), // Join all names with a comma and space
        },
        unit_amount: item.unitPrice, // amount in cents
      },
      quantity: item.qty,
    };
  });
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    success_url: `http://localhost:5173/status?cart=success`,
    cancel_url: `http://localhost:5173/status?cart=cancel`,
    client_reference_id: req.params.cartID,
    line_items: lineItems,
    phone_number_collection: {
      enabled: true,
    },
    shipping_address_collection: {
      allowed_countries: ["PK"], // Add the allowed countries you want
    },
    billing_address_collection: "auto",
    mode: "payment",
  });
  res.status(200).json({
    status: "success",
    session,
  });
});

exports.addItem = catchAsync(async (req, res, next) => {
  let doc = await add_item_to_cart(
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
  let doc = await Cart.findOneAndUpdate(
    {
      _id: cart_id,
      status: "active",
    },
    { $pull: { items: { uuid: uuid } } }
  );
  console.log(doc);
  if (!doc) {
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
  if (
    req.body.sku &&
    req.body.new_qty &&
    req.body.uuid &&
    req.body.unitPrice &&
    req.body.totalPrice
  ) {
    doc = await update_quantity(
      req.params.id,
      req.body.uuid,
      req.body.sku,
      req.body.new_qty,
      req.body.unitPrice,
      req.body.totalPrice
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
    console.log("here updatung", cart_id, uuid);
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


exports.totalCart = catchAsync(async (req, res, next) => {
  const cartID = req.params.cartID;
  console.log(cartID);
  let doc = await Cart.findById(cartID);
  console.log("received", doc, cartID);
  if (!doc) {
    console.log("not found cart");
    return;
  }
  doc.items.forEach(
    async (el) => (
      console.log("for each", el, el.qty, el.sku),
      await add_items_total(
        el,
        el._id,
        cartID,
        el.name,
        el.sku,
        el.qty,
        el.extra,
        el.standard,
        el.uuid
      )
    )
  );
  doc = await doc.save();
  return next();
});
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
async function update_quantity(
  cart_id,
  uuid,
  sku,
  new_qty,
  unitPrice,
  totalPrice
) {
  console.log("UPDATE QTY");
  sku = new ObjectId(sku);
  cart_id = new ObjectId(cart_id);
  const qtyObject = await Cart.findOne(
    {
      _id: cart_id,
      status: "active",
      "items.uuid": uuid,
    },
    { "items.qty.$": 1 }
  );
  const { items } = qtyObject;
  const [{ qty: old_qty }] = items;
  const now = Date.now();
  const delta_qty = new_qty - old_qty;
  console.log(old_qty, new_qty, delta_qty);
  // change this and search by uuid instead
  const updatedCartResult = await Cart.findOneAndUpdate(
    {
      _id: cart_id,
      status: "active",
      "items.uuid": uuid,
    },
    {
      $set: {
        last_modified: now,
        "items.$.unitPrice": unitPrice,
        "items.$.totalPrice": totalPrice,
      },
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
async function add_items_total(
  el,
  item_id,
  cart_id,
  name,
  sku,
  qty,
  extra,
  standard,
  uuid
) {
  const now = Date.now();
  cart_id = new ObjectId(cart_id);
  sku = new ObjectId(sku);
  const { qty: kut } = el;
  console.log("qty", el.qty, kut);
  // Fetch unitPrice from Inventory
  const inventory = await Inventory.findById(sku).lean().select("price");
  const unitPrice = inventory.price;
  console.log("unit price", unitPrice, uuid);
  // Fetch extra IDs for details

  let extraPrice = 0;
  for (let el of extra) {
    const id = new ObjectId(el._id);
    console.log("extra el", el);
    let result = await Category.aggregate([
      { $unwind: "$extra" },
      { $match: { "extra._id": id } },
      {
        $project: {
          price: "$extra.price",
        },
      },
    ]);
    console.log("result", result[1]), (extraPrice += result[1].price);
  }
  console.log("price", extraPrice, unitPrice, qty);
  const totalPrice = qty * (unitPrice + extraPrice);
  console.log(totalPrice, "totalPrice");
  console.log(cart_id);
  const cartUpdateResult = await Cart.findOneAndUpdate(
    { _id: cart_id, status: "active", "items.uuid": uuid },
    {
      $set: { last_modified: now },
      $set: {
        "items.$.name": name,
        "items.$.uuid": uuid,
        "items.$.sku": sku,
        "items.$.totalPrice": totalPrice,
        "items.$.qty": qty,
        "items.$.extra": extra,
        "items.$.standard": standard,
        "items.$.unitPrice": unitPrice,
      },
      $inc: {
        totalPrice: totalPrice,
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
  return cartUpdateResult;
}
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
