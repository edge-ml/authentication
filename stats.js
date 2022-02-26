const table = require("table").table;
const Users = require("./src/models/userModel").model;
const Config = require("config");
const mongoose = require("mongoose");
const config = Config.get("server");

const avg = (arr) => arr.reduce((p, c) => p + c, 0) / arr.length;

const table_data = [];

(async () => {
  await mongoose.connect(config.db, { useNewUrlParser: true });

  const numUsers = await Users.count({});
  table_data.push(["#Users", numUsers]);

  const numUsers_2FA = await Users.count({ twoFactorEnabled: true });
  table_data.push(["#User with 2FA", numUsers_2FA]);

  console.log(table(table_data));
  process.exit();
})();
