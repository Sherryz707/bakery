const express = require("express");

const router = express.Router();

const cartController = require("../controller/cartController");
const authController = require("../controller/authController");

// router.use("/menu", cartController.getMenu);
router.use(authController.isLoggedIn);
router
  .route("/")
  .get(cartController.getAllCart)
  .post(cartController.addUserIdToCart, cartController.createCart)
  .delete(cartController.deleteAllCart);

router.use("/checkout/:id", cartController.payment);
router.use("/expire", cartController.expireCarts);
router.use(
  "/myOrders",
  authController.protect,
  authController.restrictTo("user", "admin"),
  cartController.getUserCart
);
router.route("/:id").patch(cartController.updateCart);
module.exports = router;
