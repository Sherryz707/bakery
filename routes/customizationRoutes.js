const express = require("express");
const customizeController = require("../controller/customizeController");
const authController = require("../controller/authController");

const router = express.Router({ mergeParams: true });

router.use(authController.protect, authController.restrictTo("admin"));
router
  .route("/")
  .post(
    customizeController.leafCategoryRestriction,
    customizeController.addCustomization
  );

router
  .route("/:id")
  .patch(
    customizeController.leafCategoryRestriction,
    customizeController.updateCustomization
  ).delete(customizeController.deleteCustomization)

module.exports = router;
