const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
// creating schema
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "a user must have a username"],
      unique: true,
      maxLength: [40, "A username must have less than or equal to 40 chars"],
      minLength: [5, "A username must have a minimum 5 chars"],
    },
    email: {
      type: String,
      required: [true, "a user must an email"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Please provide a valid email."],
    },
    photo: {
      type: String,
      default: "default.jpg",
    },
    password: {
      type: String,
      required: [true, "a user must have a password"],
      minLength: [8, "A password must have a minimum 10 chars"],
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    passwordResetToken: { type: String, select: false },
    passwordResetExpire: { type: Date, select: false },
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, "please write your password again"],
      validate: {
        // ONLY WORKS WITH SAVE AND SO WHEN UPDATING WE WILL USE SAVE
        validator: function (val) {
          return val === this.password;
        },
        message: "Passwords must match",
      },
      minLength: [8, "A password must have a minimum 10 chars"],
      select: false,
    },
    passwordChangedAt: Date,
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// create password checker as instance method
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};
userSchema.methods.passwordChangedAtFun = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    // console.log(this.passwordChangedAt, JWTTimestamp);
    const changedTimeStamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimeStamp;
  }
  return false;
};
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};
// document middleware

// true
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);

    this.passwordConfirm = undefined;
    next();
});

userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) {
    return next();
  }
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// creating model
const User = mongoose.model("User", userSchema);
module.exports = User;
