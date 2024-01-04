const nodemailer = require("nodemailer");
// new Email(user, url).sendWelcome();
module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(" ")[0];
    this.url = url;
    this.from = `Shahr Bano Bokhari <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === "production") {
      return 1;
    }
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(subject,message) {
    // 2) Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      text: message,
    };
    // 3) create transport and send email
    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    await this.send("Welcome", "Welcome to the PixieBakes Family! Thank you so much for choosing us :)");
  }

  async sendOrderConfirm(identifyCart) {
    await this.send("Order Confirmed",`Thank you for your patronage! We hope you like your sweets :) If you are a logged-in user, check all your orders through /myOrders else search through order-number: ${identifyCart} `)
  }
  async resetPassword(resetToken) {
    await this.send(
      "PasswordReset",
      `Your password reset token: ${resetToken} (valid for only 10 minutes). 
      Perform a patch req at ${this.url}`
    );
  }
};

// const sendEmail = async options => {
// 1) create transporter
// const transporter = nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: process.env.EMAIL_PORT,
//   auth: {
//     user: process.env.EMAIL_USERNAME,
//     pass: process.env.EMAIL_PASSWORD
//   }
// });
// console.log(transporter);
// 2)set mail options
// const mailOptions = {
//   from: 'Jonas Schmedtmann <hello@jonas.io>',
//   to: options.email,
//   subject: options.subject,
//   text: options.message
//   // html
// };
// 3)sending email
// try {
//   await transporter.sendMail(mailOptions);
// } catch (err) {
//   console.log(err, err.messageId, err.envelope);
// }
// console.log('chk-3');
// };
