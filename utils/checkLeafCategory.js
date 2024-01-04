const { default: mongoose } = require("mongoose");
const Category = require("../models/categoryModel");
const ObjectId = mongoose.Types.ObjectId;

exports.isLeafCategory = async function (category_id) {
  category_id = new ObjectId(category_id);
  console.log('in is lead category');
  let result = await Category.findOne({ parent: category_id });
  console.log("is it a parent", result,!result);
  if (!result) {
    return true
  }
  
  return false
};
