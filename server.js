const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });

const mongoose = require("mongoose");

const app = require("./app");

const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);
mongoose
  .connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then((connectionObj) => {
    console.log(`connection: ${connectionObj.connection}`);
  })
  .catch((error) => {
    console.log(`Error occured: ${error}`);
  });

const port = process.env.PORT || 3000;

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`App running on port ${port}`);
});
module.exports = app;