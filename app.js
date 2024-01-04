const express = require("express");
const morgan = require("morgan");
const path = require("path");
const cookieParser = require("cookie-parser");
const app = express();
const cors = require("cors");

// ROUTERS
const categoryRouter = require("./routes/categoryRoutes");
const productRouter = require("./routes/productRoutes");
const cartRouter = require("./routes/cartRoutes");
const userRouter = require("./routes/userRoutes");
const inventoryRouter = require("./routes/inventoryRoutes");
const globalErrorHandler = require('./controller/errorController');
const AppError = require("./utils/appError");

app.use(express.json());
app.use(cors());
app.options('*', cors());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

app.use("/api/v1/category", categoryRouter);
app.use("/api/v1/product", productRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/inventory", inventoryRouter);
app.use("/api/v1/users", userRouter);
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
