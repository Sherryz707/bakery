// const { ObjectId } = require("mongoose");
const mongoose = require("mongoose");
const slugify = require("slugify");

const customizeOptionSchema = new mongoose.Schema({
  type: String,
  name: String,
  price: {
    type: Number,
    default: 50,
  },
  options: [mongoose.Mixed],
});
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "a customization must have a category"],
    required: true,
    unique: true,
  },
  images: [String],
  slug: String,
  parent: mongoose.Schema.ObjectId,
  ancestors: Array,
  customization: [customizeOptionSchema],
  extra: [customizeOptionSchema],
});

categorySchema.pre("save", function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});
categorySchema.pre(/^find/, function (next) {
  next();
});

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
