const express = require("express");

const router = express.Router();

const categoryController = require("./../controller/categoryController");
const authController = require("./../controller/authController");
const customizeRouter = require("./customizationRoutes");

router.use("/menu", categoryController.getMenu);
router.use("/fullview", categoryController.getFullViewMenu);
router.route("/:id").get(categoryController.getCategory);

router
  .route("/")
  .get(categoryController.getAllCategory)
  .post(
    authController.protect,
    authController.restrictTo("admin"),
    categoryController.createCategory
  )
  .delete(
    authController.protect,
    authController.restrictTo("admin"),
    categoryController.deleteAllCategory
  );
router.use(authController.protect, authController.restrictTo("admin"));
router.use("/:categId/standard", customizeRouter);
router
  .route("/:id")
  .patch(categoryController.updateName, categoryController.updateParent)
  .delete(categoryController.deleteCategoryCascade);

module.exports = router;
