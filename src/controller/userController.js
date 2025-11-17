const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const { ObjectId } = require('mongoose').Types;
const config = require('../../config');

const { generateToken } = require('../utils');

const Model = require('../models/userModel').model;

const secret = config.SECRET_KEY;

async function getUser(req, res) {
	const user = await Model.findById(req.user._id);

	if (user) {
		return res.status(200).json(user); // Return here to avoid further execution
	}
	return res.status(404).json({ message: 'User not found' }); // Explicitly use return here as well
}

/**
 * register a new user
 */
async function registerNewUser(req, res) {
	try {
		// create user
		const result = new Model(req.body);

		// encrypt password
		const salt = bcrypt.genSaltSync(10);
		result.password = bcrypt.hashSync(result.password, salt);

		result.refreshToken = jwt.sign(
			{
				id: result._id,
			},
			config.SERVER_REFRESH_SECRET,
			{
				expiresIn: config.SERVER_REFRESH_TTL,
			}
		);

		// store user
		await result.save();

		// send response
		res.status(201).json({ message: 'Successfully created user!' });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
}

async function loginGithub(req, res) {
	passport.authenticate('github', {
		scope: ['user:email'],
	})(req, res);
}

async function callbackOAuth(req, res, next) {
	passport.authenticate('github', { session: false }, (err, user, info) => {
		if (err) {
			return next(err); // Handle error
		}
		if (!user) {
			return res.redirect('/login'); // Handle authentication failure
		}
		// Generate a JWT token
		const { token } = generateToken(user, 'github');

		// Send token as HTTP-only cookie
		res.cookie('jwt', token, { httpOnly: true });
		res.redirect(config.HOST);
	})(req, res, next);
}

async function logoutUser(req, res, next) {
	res.cookie('jwt', undefined, { httpOnly: true });
	res.redirect(config.HOST);
}

async function loginUser(req, res, next) {
	passport.authenticate('local', async (err, user, info) => {
		if (err) {
			return next(err);
		}
		if (!user) {
			return res.status(404).json({ error: info.message });
		}
		const { token } = generateToken(user, 'local');
		const decodedRefresh = jwt.decode(user.refreshToken);

		if (decodedRefresh.exp * 1000 - Date.now() <= 5 * 60 * 1000) {
			user.refreshToken = jwt.sign(
				{ id: user._id },
				config.SERVER_REFRESH_SECRET,
				{ expiresIn: config.SERVER_REFRESH_TTL }
			);
			await user.save();
		}

		res.cookie('jwt', token, { httpOnly: true });
		res.status(200).json('Login success');
	})(req, res);
}

/**
 * log in user by refresh token and return jwt
 */
async function loginUserRefresh(req, res) {
	try {
		const jwtUserObject = await jwt.verify(
			req.body.refresh_token,
			config.REFRESH_SECRET
		);

		// retrieve user
		const user = await Model.findById(jwtUserObject.id);

		// check if token is revoked
		if (user.refreshToken !== req.body.refresh_token) {
			return res.status(401).json({ error: 'token is revoked' });
		}

		const payload = {
			mail: user.email,
			userName: user.userName,
			id: user._id,
			twoFactorEnabled: user.twoFactorEnabled,
			twoFactorVerified: false,
			subscriptionLevel: user.subscriptionLevel,
		};

		const token = jwt.sign(payload, secret, { expiresIn: config.SERVER_TTL });
		res.json({ access_token: `${token}` });
	} catch (e) {
		res.status(401).json({ error: 'token expired' });
	}
}

/**
 * delete user
 *
 * only possible if body contains email to prevent unintentional deletions
 */
async function deleteUser(req, res, next) {
	passport.authenticate('jwt', async (err, user, info) => {
		if (info || !user) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		const { email } = req.body;
		if (!email || email === '') {
			return res.status(400).json({
				error:
          'This route deletes a user. To delete your user account, '
          + 'please provide your email address in the request body. '
          + 'Be careful, this action cannot be undone',
			});
		}
		if (email !== user.email) {
			return res
				.status(400)
				.json({ error: 'Provided e-mail does not match user e-mail.' });
		}
		await Model.findOneAndDelete({ email });
		res.status(200).json({ message: `Deleted user with e-mail: ${email}` });
	})(req, res, next);
}

/**
 * get all users
 */
async function getUsers(req, res, next) {
	passport.authenticate('jwt', async (err, user, info) => {
		if (info) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		if (user.role !== 'admin') {
			return res.status(401).json({ error: 'Forbidden' });
		}
		const users = await Model.find({}, '-__v -password -refreshToken');
		res.status(200).json(users);
	})(req, res, next);
}

/**
 * Change the e-mail address of a user
 */
async function changeUserMail(req, res, next) {
	try {
		passport.authenticate('jwt', async (err, user, info) => {
			if (info) {
				return res.status(401).json({ error: 'Unauthorized' });
			}
			const { email } = req.body;
			if (!validateEmail(email)) {
				return res
					.status(400)
					.json({ error: `${email} is not a valid e-mail address` });
			}
			await Model.findByIdAndUpdate({ _id: user._id }, { $set: { email } });
			res.status(200).json({
				message: `Changed e-mail address from ${user.email} to ${email}`,
			});
		})(req, res, next);
	} catch (error) {
		res.status(400).json({ error: 'E-mail already exists' });
	}
}

async function changeUserName(req, res, next) {
	try {
		passport.authenticate('jwt', async (err, user, info) => {
			if (info) {
				return res.status(401).json({ error: 'Unauthorized' });
			}
			const { userName } = req.body;
			await Model.findByIdAndUpdate({ _id: user._id }, { $set: { userName } });
			res.status(200).json({
				message: `Changed username from ${user.userName} to ${userName}`,
			});
		})(req, res, next);
	} catch (error) {
		res.status(400).json({ error: 'Username already exists' });
	}
}

/**
 * Change the password of a user
 */
async function changeUserPassword(req, res, next) {
	passport.authenticate('jwt', async (err, user, info) => {
		if (info) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		const { password, newPassword } = req.body;
		if (!password || !newPassword) {
			return res
				.status(400)
				.json({ error: 'Provide the current password and the new password' });
		}
		const isMatch = bcrypt.compareSync(password, user.password);
		if (isMatch) {
			const salt = bcrypt.genSaltSync(10);
			await Model.findByIdAndUpdate(
				{ _id: user._id },
				{ $set: { password: bcrypt.hashSync(newPassword, salt) } }
			);
			res.status(200).json({ message: 'Changed password' });
		} else {
			res.status(400).json({ error: 'Passwords do not match' });
		}
	})(req, res, next);
}

/**
 * Change the subscription level of a user
 */
async function changeUserSubscriptionLevel(req, res, next) {
	// Implementation needed
}

/**
 * get user IDs by usernames
 */
async function getUsersIds(req, res, next) {
	passport.authenticate('jwt', async (err, user, info) => {
		if (info) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		const userNames = req.body;
		if (!Array.isArray(userNames)) {
			return res
				.status(400)
				.json({ error: 'Provide valid usernames in an array' });
		}
		const userIds = await Model.find({ userName: { $in: userNames } });
		if (userIds.length != userNames.length) {
			return res.status(400).json({ error: 'Some users could not be found' });
		}
		const resData = userIds.map((user) => ({
			_id: user._id,
			userName: user.userName,
		}));
		res.status(200).json(resData);
	})(req, res, next);
}

/**
 * get usernames by user IDs
 */
async function getUserNames(req, res, next) {
	try {
		const userIds = req.body;
		if (
			!Array.isArray(userIds)
      || !userIds.every((elm) => ObjectId.isValid(elm))
		) {
			return res.status(400).json({ error: 'Provide valid ids in an array' });
		}
		const users = await Model.find({ _id: { $in: userIds } }, { userName: 1 });
		const resData = userIds.map((id) => {
			const user = users.find((elm) => String(elm._id) === id) || {
				_id: id,
				error: 'User not found',
			};
			return user;
		});
		res.status(200).json(resData);
	} catch (e) {
		res.status(500).json({ error: 'Internal Server Error' });
	}
}

/**
 * get username suggestions
 */
async function getUserNameSuggestions(req, res, next) {
	passport.authenticate('jwt', async (err, user, info) => {
		if (info) {
			return res.status(401).json({ error: 'Unauthorized' });
		}
		const regexp = new RegExp(`^${req.body.userName}`);
		const possibleUsers = await Model.find({ userName: regexp })
			.limit(100)
			.select({ userName: 1 });
		const userNames = possibleUsers.map((elm) => elm.userName);
		res.status(200).json(userNames);
	})(req, res, next);
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
	changeUserSubscriptionLevel,
	getUsersIds,
	getUserNames,
	getUserNameSuggestions,
	loginGithub,
	callbackOAuth,
	getUser,
	logoutUser,
};
