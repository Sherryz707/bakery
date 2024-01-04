const express = require("express");

const router = express.Router();

const inventoryController = require("./../controller/inventoryController");
const authController = require("./../controller/authController");

router.use(authController.protect, authController.restrictTo("admin"));
router
  .route("/")
  .get(inventoryController.getAllInventory)
  .post(inventoryController.createInventory)
  .delete(inventoryController.deleteAllInventory);

router.route("/:id").patch(inventoryController.updateInventory);

module.exports = router;
