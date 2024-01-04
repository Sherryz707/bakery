const mongoose = require("mongoose");
const catchAsync = require("../utils/catchAsync");
const Category = require("./../models/categoryModel");
const AppError = require("./../utils/appError");
const factory = require("./factoryHandler");
const { default: slugify } = require("slugify");
const { isLeafCategory } = require("../utils/checkLeafCategory");
const { deleteMany } = require("../models/userModel");
const Product = require("../models/productModel");
const ObjectId = mongoose.Types.ObjectId;
const multer = require("multer");
const sharp = require("sharp");
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


exports.getFullViewMenu = catchAsync(async (req, res, next) => {
  const pipeline=[
    {
      $match: {
        parent: null,
      },
    },
    {
      $graphLookup: {
        from: "categories",
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "parent",
        as: "subcategory",
        maxDepth: 4,
        depthField: "depth",
      },
    },
    {
      $unwind: {
        path: "$subcategory",
      },
    },
    {
      $sort: {
        "subcategory.depth": 1,
      },
    },
    {
      $group: {
        _id: {
          parent: "$slug",
          _id: "$_id",
        },
        subcategory_By_Depth: {
          $push: {
            name: "$subcategory.slug",
            _id: "$subcategory._id",
            parent: {
              $arrayElemAt: ["$subcategory.ancestors._id", 0],
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        depth: "$_id",
        subcategory: "$subcategory_By_Depth",
      },
    },
  ];

  // Run the aggregation pipeline
  const doc = await Category.aggregate(pipeline);

  res.status(201).json({
    status: "success",
    data: {
      doc,
    },
  });
})
exports.getMenu = catchAsync(async (req, res, next) => {
  const pipeline = [
    {
      $match: {
        parent: null,
      },
    },
    {
      $graphLookup: {
        from: "categories",
        startWith: "$_id",
        connectFromField: "_id",
        connectToField: "parent",
        as: "subcategory",
        maxDepth: 4,
        depthField: "depth",
      },
    },
    {
      $unwind: {
        path: "$subcategory",
      },
    },
    {
      $sort: {
        "subcategory.depth": 1,
      },
    },
    {
      $group: {
        _id: {
          depth: "$subcategory.depth",
          parent: {
            $arrayElemAt: ["$subcategory.ancestors.slug", 0],
          },
          _id: {
            $arrayElemAt: ["$subcategory.ancestors._id", 0],
          },
        },
        subcategory_By_Depth: {
          $push: {
            name: "$subcategory.slug",
            _id: "$subcategory._id",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        depth: "$_id",
        subcategory: "$subcategory_By_Depth",
      },
    },
  ];

  // Run the aggregation pipeline
  const doc = await Category.aggregate(pipeline);

  res.status(201).json({
    status: "success",
    data: {
      doc,
    },
  });
});
exports.getCategory = factory.getOne(Category);
exports.getAllCategory = factory.getAll(Category);

exports.createCategory = catchAsync(async (req, res, next) => {
  let doc = await Category.create(req.body);
  doc = await build_ancestors(doc, doc.parent);
  res.status(200).json({
    status: "success",
    data: {
      doc,
    },
  });
});

const build_subgraph = async (root) => {
  nodes = await Category.find({ "ancestors._id": root._id }).select(
    "parent name slug ancestors"
  );
  const nodesByParent = new Map();
  nodes.forEach((node) => {
    const parentNode = node.parent.toString();
    console.log("parentNode", parentNode, node.parent);
    if (!nodesByParent.has(parentNode)) {
      nodesByParent.set(parentNode, []);
    }
    nodesByParent.get(parentNode).push(node);
  });
  return nodesByParent;
};

const build_ancestors = async (newCategoryDoc, parentCategoryId) => {
  if (!parentCategoryId) {
    return newCategoryDoc;
  }
  const parentCategory = await Category.findById(parentCategoryId).select(
    "name slug ancestors customization"
  );
  const {
    slug,
    _id,
    name,
    customization: parentCustomization,
  } = parentCategory;
  let obj = {
    slug,
    _id,
    name,
  };
  if (!parentCategory) {
    throw new AppError("No document found with that ID", 404);
  }
  const parentAncestors = parentCategory.ancestors || "";
  const newCategoryAncestors = [obj, ...parentAncestors];
  const additionalCustomization = [...parentCustomization];
  console.log("additonal", additionalCustomization);
  const newDoc = await Category.findByIdAndUpdate(
    newCategoryDoc._id,
    {
      ancestors: newCategoryAncestors,
      extra: additionalCustomization,
    },
    {
      new: true,
      runValidators: true,
    }
  );
  console.log("new doc", newDoc);
  return newDoc;
};

exports.updateName = catchAsync(async (req, res, next) => {
  if (!req.body.name) {
    return next();
  }
  const doc = await Category.updateOne(
    { _id: req.params.id },
    {
      $set: {
        name: req.body.name,
        slug: slugify(req.body.name, { lower: true }),
      },
    }
  );
  const checkId = new ObjectId(req.params.id);
  await Category.updateMany(
    { "ancestors._id": checkId },
    {
      $set: {
        "ancestors.$.name": req.body.name,
        "ancestors.$.slug": slugify(req.body.name, { lower: true }),
      },
    }
  );
  next();
});
exports.updateParent = catchAsync(async (req, res, next) => {
  const parentDoc = await Category.findById(req.body.parent);
  // if (req.body.name) {
  //   const doc = await Category.updateOne(
  //     { _id: req.params.id },
  //     {
  //       $set: {
  //         name: req.body.name,
  //         slug: slugify(req.body.name, { lower: true }),
  //       },
  //     }
  //   );
  //   const checkId = new ObjectId(req.params.id);
  //   await Category.updateMany(
  //     { "ancestors._id": checkId },
  //     {
  //       $set: {
  //         "ancestors.$.name": req.body.name,
  //         "ancestors.$.slug": slugify(req.body.name, { lower: true }),
  //       },
  //     }
  //   );

  //   res.status(200).json({
  //     status: "success",
  //     data: {
  //       doc,
  //     },
  //   });
  // } else if
  if (req.body.parent) {
    console.log("in parent part", req.params.id);
    let doc = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    console.log("parent doc", doc);
    if (!doc) {
      next(new AppError("No document found with that ID", 404));
    }

    let nodeByParent = new Map();
    nodeByParent = await build_subgraph(doc);

    await updateNodeAndDescendants(nodeByParent, doc, parentDoc);

    res.status(200).json({
      status: "success",
      data: {
        doc,
      },
    });
  } else {
    console.log(req.body, "error");
    return next(new AppError("Request is missing a required parameter", 400));
  }
});
// still need to delete subcategoryProducts
exports.deleteCategoryCascade = catchAsync(async (req, res, next) => {
  const product = await Product.deleteMany({ category: req.params.id });
  console.log("prod", product);
  if (!product.acknowledged) {
    return next(
      new AppError("error in deleting products of associated category", 500)
    );
  }
  const subCategory = await Category.deleteMany({
    $or: [{ parent: req.params.id }, { "ancestors._id": req.params.id }],
  });
  if (!subCategory.acknowledged) {
    return next(
      new AppError(
        "error in deleting subcategories of associated category",
        500
      )
    );
  }

  const category = await Category.deleteOne({ _id: req.params.id });
  console.log(category);
  if (!category.acknowledged) {
    return next(new AppError("error in deleting parent category", 500));
  }
  res.status(204).json({
    status: "success",
    data: null,
  });
});
const updateNodeAndDescendants = async (nodesByParent, node, parent) => {
  node.ancestors = [
    ...parent.ancestors,
    { _id: parent._id, slug: parent.slug, name: parent.name },
  ];
  node.extra = [...parent.extra, ...parent.customization];
  console.log("additional customizations", node.extra);
  await Category.findByIdAndUpdate(node._id, {
    ancestors: node.ancestors,
    parent: parent._id,
    extra: node.extra,
  });
  const nodeId = node._id.toString();
  if (nodesByParent.has(nodeId)) {
    const children = nodesByParent.get(nodeId);
    for (const child of children) {
      await updateNodeAndDescendants(nodesByParent, child, node);
    }
  } else {
    return;
  }
};

exports.isLeaf = catchAsync(async (req, res, next) => {
  if (isLeafCategory(req.params.id)) {
    next();
  }
  next(new AppError("only a leaf category can have customizations", 500));
});
exports.deleteAllCategory = factory.deleteAll(Category);
