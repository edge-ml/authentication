const jwt = require('jsonwebtoken');
const config = require('../config');

// src/utils.js
const validateEmail = (email) => {
	if (!email) {
		return false;
	}
	const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	return re.test(email.toLowerCase());
};

const generateToken = (user, provider) => {
	const payload = {
		id: user._id,
		provider,
		email: user.email,
		userName: user.userName,
		twoFactorEnabled: user.twoFactorEnabled,
		twoFactorVerified: false,
		subscriptionLevel: user.subscriptionLevel,
	};

	const token = jwt.sign(payload, config.SECRET_KEY, {
		expiresIn: config.SERVER_TTL,
	});
	return {token, payload};
};

module.exports = {
	validateEmail,
	generateToken
};
