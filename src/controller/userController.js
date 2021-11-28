const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Config = require("config");
const { ObjectId } = require("mongoose").Types;

const Model = require("../models/userModel").model;

const config = Config.get("server");

const secret = process.env.SECRET || config.secret;

/**
 * register a new user
 */
async function registerNewUser(ctx) {
  try {
    // create user
    const result = new Model(ctx.request.body);

    // encrypt password
    const salt = bcrypt.genSaltSync(10);
    result.password = bcrypt.hashSync(result.password, salt);

    result.refreshToken = jwt.sign(
      {
        id: result._id,
      },
      config.refresh_secret,
      {
        expiresIn: config.refresh_ttl,
      }
    );

    // store user
    await result.save();

    // send response
    ctx.body = { message: "Successfully created user!" };
    ctx.status = 201;
    return ctx;
  } catch (error) {
    ctx.body = { error: error.message };
    ctx.status = 500;
    return ctx;
  }
}

/**
 * log in user by name and return jwt
 */
async function loginUser(ctx) {
  // retrieve user
  const users = await Model.find({});
  let user = null;
  if (validateEmail(ctx.request.body.email)) {
    user = await Model.findOne({ email: ctx.request.body.email });
  } else {
    user = await Model.findOne({ userName: ctx.request.body.email });
  }

  // handle user not found
  if (!user) {
    ctx.body = { error: `user '${ctx.request.body.email}' not found` };
    ctx.status = 404;
    return ctx;
  }

  const isMatch = bcrypt.compareSync(ctx.request.body.password, user.password);

  if (isMatch) {
    // password correct
    const payload = {
      id: user._id,
      email: user.email,
      userName: user.userName,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorVerified: false,
    };

    const token = jwt.sign(payload, secret, { expiresIn: config.ttl });

    ctx.body = {
      access_token: `Bearer ${token}`,
      refresh_token: `${user.refreshToken}`,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorVerified: false,
    };
    ctx.status = 200;
    return ctx;
  }

  // password incorrect
  ctx.status = 400;
  ctx.body = { error: "Password not correct!" };
  return ctx;
}

/**
 * log in user by refresh token and return jwt
 */
async function loginUserRefresh(ctx) {
  try {
    const jwtUserObject = await jwt.verify(
      ctx.request.body.refresh_token,
      config.refresh_secret
    );

    // retrieve user
    const user = await Model.findById(jwtUserObject.id);

    // check if token is revoked
    if (user.refreshToken !== ctx.request.body.refresh_token) {
      ctx.status = 401;
      ctx.body = { error: "token is revoked" };
      return ctx;
    }

    const payload = {
      mail: user.email,
      userName: user.userName,
      id: user._id,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorVerified: false,
    };

    const token = jwt.sign(payload, secret, { expiresIn: config.ttl });
    ctx.body = { access_token: `${token}` };

    return ctx;
  } catch (e) {
    ctx.status = 401;
    ctx.body = { error: "token expired" };
    return ctx;
  }
}

/**
 * delete user
 *
 * only possible if body contains email to prevent unintentional deletions
 */
async function deleteUser(ctx, passport) {
  await passport.authenticate("jwt", async (err, user, info) => {
    if (info || !user) {
      ctx.body = { error: "Unauthorized" };
      ctx.status = 401;
      return ctx;
    }
    const { email } = ctx.request.body;
    if (!email || email === "") {
      ctx.body = {
        error:
          "This route deletes a user. To delete your user account, " +
          "please provide your email address in the request body. " +
          "Be careful, this action cannot be undone",
      };
      ctx.status = 400;
      return ctx;
    }
    if (email !== user.email) {
      ctx.body = { error: "Provided e-mail does not match user e-mail." };
      ctx.status = 400;
      return ctx;
    }
    await Model.findOneAndDelete({ email });
    ctx.body = { message: `Deleted user with e-mail: ${email}` };
    ctx.status = 200;
    return ctx;
  })(ctx);
}

/**
 * get all users
 */
async function getUsers(ctx, passport) {
  await passport.authenticate("jwt", async (err, user, info) => {
    if (info) {
      ctx.body = { error: "Unauthorized" };
      ctx.status = 401;
      return ctx;
    }
    if (user.role !== "admin") {
      ctx.body = { error: "Forbidden" };
      ctx.status = 401;
      return ctx;
    }
    ctx.body = await Model.find({}, "-__v -password -refreshToken");
    ctx.status = 200;
    return ctx;
  })(ctx);
}

/**
 * Change the e-mail address of a user
 */
async function changeUserMail(ctx, passport) {
  try {
    await passport.authenticate("jwt", async (err, user, info) => {
      if (info) {
        ctx.body = { error: "Unauthorized" };
        ctx.status = 401;
        return ctx;
      }
      const { email } = ctx.request.body;
      if (!validateEmail(email)) {
        ctx.body = `${email} is not a valid e-mail address`;
        ctx.status = 400;
      } else {
        await Model.findByIdAndUpdate({ _id: user._id }, { $set: { email } });
        ctx.body = {
          message: `Changed e-mail address from ${user.email} to ${email}`,
        };
        ctx.status = 200;
      }
    })(ctx);
  } catch (error) {
    ctx.body = { error: "E-mail already exists" };
    ctx.status = 400;
    return ctx;
  }
}

async function changeUserName(ctx, passport) {
  try {
    await passport.authenticate("jwt", async (err, user, info) => {
      if (info) {
        ctx.body = { error: "Unauthorized" };
        ctx.status = 401;
        return ctx;
      }
      const { userName } = ctx.request.body;
      await Model.findByIdAndUpdate({ _id: user._id }, { $set: { userName } });
      ctx.body = `Changed username from ${user.userName} to ${userName}`;
      ctx.status = 200;
      return ctx;
    })(ctx);
  } catch (error) {
    ctx.body = { error: "Username already exists" };
    ctx.status = 400;
    return ctx;
  }
}

/**
 * Change the password of a user
 */
async function changeUserPassword(ctx, passport) {
  await passport.authenticate("jwt", async (err, user, info) => {
    if (info) {
      ctx.body = { error: "Unauthorized" };
      ctx.status = 401;
      return ctx;
    }
    const { password, newPassword } = ctx.request.body;
    if (!password || !newPassword) {
      ctx.status = 400;
      ctx.body = "Provide the current password and the new password";
      return ctx;
    }
    const isMatch = bcrypt.compareSync(password, user.password);
    if (isMatch) {
      const salt = bcrypt.genSaltSync(10);
      await Model.findByIdAndUpdate(
        { _id: user._id },
        { $set: { password: bcrypt.hashSync(newPassword, salt) } }
      );
      ctx.body = "Changed password";
      ctx.status = 200;
    } else {
      ctx.body = { error: "Passwords do not match" };
      ctx.status = 400;
    }
  })(ctx);
}

async function getUsersIds(ctx, passport) {
  await passport.authenticate("jwt", async (err, user, info) => {
    if (info) {
      ctx.body = { error: "Unauthorized" };
      ctx.status = 401;
      return ctx;
    }
    const userNames = ctx.request.body;
    if (!Array.isArray(userNames)) {
      ctx.body = { error: "Provide valid usernames in an array" };
      ctx.status = 401;
      return ctx;
    }
    const userIds = await Model.find({ userName: userNames });
    if (userIds.length != userNames.length) {
      ctx.body = { error: "Some users could not be found" };
      ctx.status = 400;
      return ctx;
    }
    const res = [];
    for (i = 0; i < userIds.length; i++) {
      for (j = 0; j < userIds.length; j++) {
        if (String(userNames[i]) === String(userIds[j].userName)) {
          res.push({ _id: userIds[j]._id, userName: userIds[j].userName });
        }
      }
    }
    ctx.body = res;
    ctx.status = 200;
    return ctx;
  })(ctx);
}

async function getUserNames(ctx, passport) {
  await passport.authenticate("jwt", async (err, user, info) => {
    try {
      if (info) {
        ctx.body = { error: "Unauthorized" };
        ctx.status = 401;
        return ctx;
      }
      const userIds = ctx.request.body;
      if (
        !(
          Array.isArray(userIds) &&
          userIds.every((elm) => ObjectId.isValid(elm))
        )
      ) {
        ctx.body = { error: "Provide valid ids in an array" };
        ctx.status = 401;
        return ctx;
      }
      const res = [];
      const users = await Model.find({ _id: userIds }, { userName: 1 });
      userIds.forEach((userId) => {
        const user = users.find((elm) => String(elm._id) === userId) || {
          _id: userId,
          error: "User not found",
        };
        res.push(user);
      });
      ctx.body = res;
      ctx.status = 200;
      return ctx;
    } catch (e) {
      console.log(e);
    }
  })(ctx);
}

async function getUserNameSuggestions(ctx, passport) {
  await passport.authenticate("jwt", async (err, user, info) => {
    if (info) {
      ctx.body = { error: "Unauthorized" };
      ctx.status = 401;
      return ctx;
    }
    var regexp = new RegExp("^" + ctx.request.body.userName);
    const possibleUsers = await Model.find({ userName: regexp })
      .limit(100)
      .select({ userName: 1, _id: 0 });
    ctx.body = possibleUsers.map((elm) => elm.userName);
    ctx.status = 200;
    return ctx;
  })(ctx);
}

function validateEmail(email) {
  const re =
    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return email && re.test(String(email).toLowerCase());
}

module.exports = {
  registerNewUser,
  loginUser,
  loginUserRefresh,
  deleteUser,
  getUsers,
  changeUserMail,
  changeUserName,
  changeUserPassword,
  getUserNames,
  getUsersIds,
  getUserNameSuggestions,
};
