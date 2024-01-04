const express = require("express");

const router = express.Router();

const productController = require("./../controller/productController");
const authController = require("./../controller/authController");
const customizeRouter = require("./customizationRoutes");

router.route("/category/:categSlug").get(productController.getProductByCategory);
router
  .route("/")
  .get(productController.getAllProduct)
  .post(
    authController.protect,
    authController.restrictTo("admin"),
    productController.uploadProductImages,
    productController.resizeProductImages,
    productController.setSizeVariation,
    productController.createProduct
  )
  .delete(
    authController.protect,
    authController.restrictTo("admin"),
    productController.deleteAllProduct
  );

// router.use("/:productId/additional", customizeRouter);

router
  .route("/:id/review")
  .post(
    authController.protect,
    authController.restrictTo("user"),
    productController.checkUserBoughtBeforeReview,
    productController.addNewReview,
    productController.updateProduct
  );
router
  .route("/:product_id/review/")
  .patch(
    authController.protect,
    authController.restrictTo("user"),
    productController.updateComment
);
  
router.route("/:slug").get(productController.getProductBySlug);
router
  .route("/:id")
  .get(productController.getProduct)
  .patch(
    authController.protect,
    authController.restrictTo("admin"),
    productController.uploadProductImages,
    productController.resizeProductImages,
    productController.updateProduct
  )
  .delete();

module.exports = router;
