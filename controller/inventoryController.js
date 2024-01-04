const Inventory = require("../models/inventoryModel");
const Product = require("../models/productModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const factory = require("./factoryHandler");

exports.createInventory = factory.createOne(Inventory);
exports.getAllInventory = factory.getAll(Inventory);
exports.deleteAllInventory = factory.deleteAll(Inventory);

exports.updateInventory = catchAsync(async (req, res, next) => {
    let doc = await Inventory.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });

  if (!doc) {
    return next(new AppError("No document found with that ID", 404));
  }
  if (req.body.price) {
    const productChanges = await Product.updateOne(
      { "sizeVariation.sku": req.params.id },
      {
        $set: { "sizeVariation.$.price": req.body.price },
      },
      {
        runValidators: true,
      }
    );
    if (!productChanges.modifiedCount < 1) {
      return next(new AppError("Error updating prices in products", 404));
    }
  }
  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});
