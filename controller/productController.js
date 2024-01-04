const catchAsync = require("../utils/catchAsync");
const Product = require("./../models/productModel");
const factory = require("./factoryHandler");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const multer = require("multer");
const sharp = require("sharp");
const ObjectId = mongoose.Types.ObjectId;
const Inventory = require("./../models/inventoryModel");
const Cart = require("../models/Cart");
const multerStorage = multer.memoryStorage();
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images", 400), false);
  }
};
const upload = multer({ storage: multerStorage, fileFilter: multerFilter });

exports.uploadProductImages = upload.fields([
  {
    name: "images",
    maxCount: 1,
  },
]);
exports.getProductBySlug = catchAsync(async (req, res, next) => {
  let slug = req.params.slug
  let doc = await Product.findOne({ slug }).lean();
  if (!doc) {
    return next(new AppError("No document found with that ID", 404));
  }
  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
})
exports.resizeProductImages = catchAsync(async (req, res, next) => {
  console.log("resize", !req.files?.images, !req.files);
  // 2)Images
  if (!req.files?.images) {
    return next();
  }
  console.log("in after next");
  req.body.images = [];
  await Promise.all(
    req.files.images.map(async (file, i) => {
      const filename = `product-${req.body.name}-${Date.now()}-${i + 1}.jpeg`;
      await sharp(file.buffer)
        .resize(2000, 1333)
        .toFormat("jpeg")
        .jpeg({ quality: 90 })
        .toFile(`public/img/products/${filename}`);
      console.log(filename);
      req.body.images.push(filename);
    })
  );
  next();
});

exports.noReviewOnCreation = catchAsync((req, res, next) => {
  if (req.body.reviews) {
    next(
      new AppError(
        "A newly created product can't just have reviews on the fly!",
        400
      )
    );
  }
  next();
});
exports.createProduct = factory.createOne(Product);
exports.setSizeVariation = catchAsync(async (req, res, next) => {
  const skuInVariation = req.body.sizeVariation.map((sizeItem) => sizeItem.sku);

  const skuPriceArray = await Inventory.find({
    _id: { $in: skuInVariation },
  }).select("-id");

  if (!skuPriceArray) {
    next(new AppError("Failed to retrieve SKU prices", 404));
  }
  const skuPriceMap = {};
  skuPriceArray.forEach((el) => {
    skuPriceMap[el._id] = el.price;
  });
  req.body.sizeVariation.forEach((sizeItm) => {
    sizeItm.price = skuPriceMap[sizeItm.sku];
  });

  next();
});
exports.getProduct = factory.getOne(Product, {
  path: "category",
  select: "slug ancestors customization extra",
});
exports.getAllProduct = factory.getAll(Product);

exports.updateComment = catchAsync(async (req, res, next) => {
  console.log("req", req.body);
  let doc = await updateComment(
    req.params.product_id,
    req.user._id,
    req.body.review,
    req.body.rating
  );
  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});

exports.deleteAllProduct = factory.deleteAll(Product);

exports.checkUserBoughtBeforeReview = catchAsync(async (req, res, next) => {
  const canReview = await Cart.findOne({
    status: "complete",
    user: req.user._id,
    "items.item_id": req.params.id,
  });
  if (!canReview) {
    next(new AppError("Please buy the product to review it", 403));
  }
  next();
});
exports.addNewReview = catchAsync(async (req, res, next) => {
  const { review, rating } = req.body;
  console.log("in add new review", req.body, req.user);
  let doc = await addReview(review, rating, req.params.id, req.user._id);

  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});
// exports.updateProduct = factory.updateOne(Product);
exports.updateProduct = catchAsync(async (req, res, next) => {
  // req.body.category = new ObjectId(req.body.category);
  console.log(req.body);
  const doc = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
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
async function addReview(review, rating, product_id, user_id) {
  const now = Date.now();
  product_id = new ObjectId(product_id);
  const result = await Product.findOneAndUpdate(
    { _id: product_id },
    {
      $push: {
        reviews: {
          posted: now,
          rating: rating,
          review: review,
          postedBy: user_id,
        },
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!result) {
    throw new AppError("no doc found with that id", 404);
  } else {
    return result;
  }
}
async function updateComment(product_id, user_id, new_comment, rating) {
  const now = Date.now();
  product_id = new ObjectId(product_id);
  console.log(product_id, user_id, new_comment, rating);
  const updatedReview = await Product.findOneAndUpdate(
    {
      _id: product_id,
      "reviews.postedBy": user_id,
    },
    {
      $set: {
        "reviews.$.review": new_comment,
        "reviews.$.posted": now,
        "reviews.$.rating": rating,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );
  console.log(updatedReview);
  if (!updatedReview) {
    throw new AppError("review could not be found", 404);
  }
  return updatedReview;
}

exports.getProductByCategory = catchAsync(async (req, res, next) => {
  console.log("get prod by categ", req.params.categSlug);
  const categSlug = req.params.categSlug;
  const doc = await Product.aggregate([
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $match: {
        "category.ancestors.slug": `${categSlug}`,
      },
    },
    {
      $project: {
        name: 1,
        sizeVariation: 1,
        ratingAverage: 1,
        ratingQuantity: 1,
        images: 1,
        "category.customization": 1,
        slug:1
      },
    },
  ]);

  res.status(200).json({
    status: "success",
    results: doc.length,
    data: {
      doc,
    },
  });
});
