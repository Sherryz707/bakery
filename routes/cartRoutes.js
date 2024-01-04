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
router.use(
  "/checkout-session/:cartID",
  cartController.totalCart,
  cartController.getCheckoutSession
);
router.use("/addup/:cartID", cartController.totalCart);
router.use("/checkoutSuccess/:id", cartController.payment);
router.use("/expire", cartController.expireCarts);
router.use(
  "/myOrders",
  authController.protect,
  authController.restrictTo("user", "admin"),
  cartController.getUserCart
);
router
  .route("/:id")
  .get(cartController.getCart)
  .post(cartController.addItem)
  .patch(cartController.updateCart)
  .delete(cartController.deleteItem);
module.exports = router;
