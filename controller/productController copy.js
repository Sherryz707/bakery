const catchAsync = require("../utils/catchAsync");
const Product = require("./../models/productModel");
const factory = require("./factoryHandler");
const AppError = require("../utils/appError");
const mongoose = require("mongoose");
const multer = require("multer");
const sharp = require("sharp");
const ObjectId = mongoose.Types.ObjectId;

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
exports.resizeProductImages = catchAsync(async (req, res, next) => {
  console.log("in resize", req);
  if (!req.files.images) {
    return next();
  }
  // 2)Images
  req.body.images = [];
  await Promise.all(
    req.files.images.map(async (file, i) => {
      const filename = `product-${req.params.id}-${Date.now()}-${i + 1}.jpeg`;
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
        "A newly created product can't just have reviews on the fly. That's cheating hmph ",
        404
      )
    );
  }
  console.log(req,req.body);
  next();
});
exports.createProduct = factory.createOne(Product);

exports.getProduct = factory.getOne(Product, {
  path: "category",
  select: "slug ancestors",
});
exports.getAllProduct = factory.getAll(Product);

exports.updateComment = catchAsync(async (req, res, next) => {
  let doc = await updateComment(
    req.params.product_id,
    req.params.comment_id,
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

exports.addNewReview = catchAsync(async (req, res, next) => {
  if (!req.body.review || !req.body.rating) {
    return next();
  }
  const { review, rating, ...remaining } = req.body;
  let doc = await addReview(review, rating, req.params.id);

  if (remaining) {
    next();
  } else {
    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  }
});
exports.updateProduct = factory.updateOne(Product);

async function addReview(review, rating, product_id) {
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
        },
      },
    },
    { new: true }
  );

  if (!result) {
    throw new AppError("no doc found with that id", 404);
  } else {
    return result;
  }
}
async function updateComment(
  product_id,
  comment_id,
  new_comment,
  ratingAverage
) {
  const now = Date.now();
  comment_id = new ObjectId(comment_id);
  product_id = new ObjectId(product_id);
  console.log(product_id, comment_id);
  const updatedReview = await Product.findOneAndUpdate(
    {
      _id: product_id,
      "reviews._id": comment_id,
    },
    {
      $set: {
        "reviews.$.review": new_comment,
        "reviews.$.posted": now,
        "reviews.$.rating": ratingAverage,
      },
    },
    {
      new: true,
    }
  );
  if (!updatedReview) {
    throw new AppError("error occured while updating comment");
  }
  return updatedReview;
}
