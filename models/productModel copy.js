const mongoose = require("mongoose");
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
});


const productSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  sku: {
    type: mongoose.ObjectId,
  },
  ratingAverage: {
    type: Number,
    default: 4.0,
  },
  ratingQuantity: {
    type: Number,
    default: 0,
  },
  details: Object,
  reviews: [reviewSchema],
  category: {
    type: mongoose.Schema.ObjectId,
    ref: "Category",
  },
  images: [String]
});
productSchema.statics.calcAvgRating = function (reviews) {
  let ratingAverage, ratingQuantity;
  if (reviews && reviews.length > 0) {
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    ratingAverage = (totalRating / reviews.length).toFixed(1);
    ratingQuantity = reviews.length;
    return {ratingAverage,ratingQuantity}
  } else {
    ratingAverage = 4.5;
    ratingQuantity = reviews.length;
    return {ratingAverage,ratingQuantity}
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
productSchema.post(/^findOne/, async function (doc) {
  console.log('here in post findby');
  const { ratingAverage, ratingQuantity } = this.model.calcAvgRating(
    doc.reviews
  );
  
  doc.ratingAverage = ratingAverage;
  doc.ratingQuantity = ratingQuantity;
  await doc.save();
})
const Product = mongoose.model("Product", productSchema);
module.exports = Product;
