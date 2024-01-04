const Category = require("../models/categoryModel");
const Inventory = require("../models/inventoryModel");
const Product = require("../models/productModel");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const { isLeafCategory } = require("../utils/checkLeafCategory");
const factory = require("./factoryHandler");

exports.leafCategoryRestriction = catchAsync(async (req, res, next) => {
  if (await isLeafCategory(req.params.categId)) {
    return next();
  }
  next(new AppError("You can only add customizations to leaf categories"));
})
exports.addCustomization = catchAsync(async (req, res, next) => {
  console.log('adding', req.body);
  if (!req.body) {
    return;
  }
  await pushCustomization(Category, req);
  res.status(200).json({
    status: "success",
  });
});
exports.updateCustomization = catchAsync(async (req, res, next) => {
  await changeCustomization(Category, req);
  res.status(200).json({
    status: "success",
  });
});

async function changeCustomization(Model, req) {
  const { name, options, type } = req.body;
  const id = req.params.id;
  const result = await Model.updateOne(
    { "customization._id": id },
    {
      $set: {
        "customization.$.options": options,
        "customization.$.name": name,
        "customization.$.type": type,
      },
    },
    {
      runValidators: true,
    }
  );
  if (!result.acknowledged) {
    next(new AppError("customization could not be updated", 404));
  }
  return;
}
exports.deleteCustomization = catchAsync(async (req, res, next) => {
  const { categId, id } = req.params;
  const response = await Category.updateOne(
    { _id: categId },
    { $pull: { customization: { _id: id } } }
  );
  if (response.modifiedCount<1) {
    next(new AppError("Failed to add customization", 404));
  }
  res.status(204).json({
    status: "success",
    data: null,
  });
});
async function pushCustomization(Model, req) {
  const { name, options, type } = req.body;
  console.log('req', req.body);
  const id = req.params.categId;
  const result = await Model.updateOne(
    { _id: id },
    {
      $push: {
        customization: {
          name: name,
          options: options,
          type: type,
        },
      },
    },
    {
      runValidators: true,
    }
  );
  console.log(result);
  if ( result.modifiedCount < 1) {
    throw new AppError("customization not found", 404);
  }
  return;
}
