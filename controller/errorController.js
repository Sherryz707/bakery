const AppError = require("./../utils/appError");

const handleCastErrorDB = (err) => {
  // path: id, value: whatever we pass in it
  const message = `invalid ${err.path}:${err.value}`;
  return new AppError(message, 400);
};
const handleTokenError = () => {
  const message = `invalid token. Please login again!`;
  return new AppError(message, 401);
};
const handleTokenExpire = () => {
  const message = `Your token has expired`;
  return new AppError(message, 401);
};
const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field: ${value}. Please use another value`;
  return new AppError(message, 400);
};
const handleValidationErrorDB = (err) => {
  const errorMsgs = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data: ${errorMsgs.join(". ")}`;
  return new AppError(message, 400);
};
const sendErrorDev = (err, res, req) => {
  // API
  // origURL is route but without hostname
  if (req.originalUrl.startsWith("/api")) {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  } else {
    // RENDERED WEBSITE
    console.log("error web");
    res.status(err.statusCode).render("error", {
      title: "Something went wrong UwU",
      msg: err.message,
    });
  }
};
const sendErrorProd = (err, req, res) => {
  // A) API
  if (req.originalUrl.startsWith("/api")) {
    // A) Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }
    // B) Programming or other unknown error: don't leak error details
    // 1) Log error
    console.error("ERROR 💥", err);
    // 2) Send generic message
    return res.status(500).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }

  // B) RENDERED WEBSITE
  // A) Operational, trusted error: send message to client
  if (err.isOperational) {
    console.log(err);
    return res.status(err.statusCode).render("error", {
      title: "Something went wrong!",
      msg: err.message,
    });
  }
  // B) Programming or other unknown error: don't leak error details
  // 1) Log error
  console.error("ERROR 💥", err);
  // 2) Send generic message
  return res.status(err.statusCode).render("error", {
    title: "Something went wrong!",
    msg: "Please try again later.",
  });
};
// const sendErrorProd = (err, req, res) => {
//   if (req.originalUrl.startsWith('/api')) {
//     // API
//     if (err.isOperational) {
//       return res.status(err.statusCode).json({
//         status: err.status,
//         message: err.message
//       });
//       // PROGRAMMING OR UNKNOWN ERROS
//     }
//     // RENDERED WEBSITE
//     // 1)log the error
//     // 2)send generic message
//     return res.status(500).json({
//       status: 'error',
//       message: 'Something went wrong'
//     });
//   }
//   if (err.isOperational) {
//     res.status(err.statusCode).render('error', {
//       title: 'Something went wrongs',
//       msg: 'Please try again later'
//     });
//   }
// };
// ALL middle ware errors that are unoperational go straight to middle ware error function as in this one below. also any error in middleware is only caight when middleware is executed

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";
  if (process.env.NODE_ENV.trim() === "development") {
    sendErrorDev(err, res, req);
  } else if (process.env.NODE_ENV.trim() === "production") {
    let error = Object.assign(err);
    if (error.name === "CastError") {
      error = handleCastErrorDB(error);
    }
    if (error.code === 11000) {
      error = handleDuplicateFieldsDB(error);
    }
    if (error.name === "ValidationError") {
      error = handleValidationErrorDB(error);
    }
    if (error.name === "JsonWebTokenError") {
      error = handleTokenError();
    }
    if (error.name === "TokenExpiredError") {
      error = handleTokenExpire();
    }
    sendErrorProd(error, req, res);
  }
};
