const mongoose = require("mongoose");
const slugify = require("slugify");
const reviewSchema = new mongoose.Schema({
  review: String,
  rating: {
    type: Number,
    default: 4.5,
  },
  posted: {
    type: Date,
    default: Date.now(),
  },
  postedBy: mongoose.ObjectId,
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  slug: {
    type: String,
    unique: true,
  },
  sizeVariation: [
    {
      sku: mongoose.ObjectId,
      size: {
        type: String,
        enum: ["small", "regular", "large"],
        default: "regular",
      },
      price: Number,
    },
  ],
  ratingAverage: {
    type: Number,
    default: 4.0,
  },
  ratingQuantity: {
    type: Number,
    default: 0,
  },
  reviews: {
    type: [reviewSchema],
    default: [],
  },
  category: {
    type: mongoose.Schema.ObjectId,
    ref: "Category",
  },
  images: [String],
});
productSchema.pre("save", function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});
productSchema.statics.calcAvgRating = function (reviews) {
  let ratingAverage, ratingQuantity;
  if (reviews && reviews.length > 0) {
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    ratingAverage = (totalRating / reviews.length).toFixed(1);
    ratingQuantity = reviews.length;
    return { ratingAverage, ratingQuantity };
  } else {
    ratingAverage = 4.5;
    ratingQuantity = reviews.length;
    return { ratingAverage, ratingQuantity };
  }
};
productSchema.post("save", function () {
  const { ratingAverage, ratingQuantity } = this.constructor.calcAvgRating(
    this.reviews
  );
  this.ratingAverage = ratingAverage;
  this.ratingQuantity = ratingQuantity;
  // next();
});
// productSchema.post("updateOne", function () {
//   console.log("save", this.reviews);
//   const { ratingAverage, ratingQuantity } = this.model.calcAvgRating(
//     this.reviews
//   );
//   this.ratingAverage = ratingAverage;
//   this.ratingQuantity = ratingQuantity;
//   // next();
// });
productSchema.pre(/find/, function (next) {
  this.populate({
    path: "category",
    select: "customization slug ancestors extra",
  });
  next();
});
productSchema.post(/^findOneAndUpdate/, async function (doc) {
  console.log("here in post findby");
  const { ratingAverage, ratingQuantity } = this.model.calcAvgRating(
    doc.reviews
  );

  doc.ratingAverage = ratingAverage;
  doc.ratingQuantity = ratingQuantity;
  await doc.save();
});
const Product = mongoose.model("Product", productSchema);
module.exports = Product;
