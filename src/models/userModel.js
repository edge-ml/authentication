const mongoose = require('mongoose');

const User = new mongoose.Schema({
	email: {
		type: String,
		required: [true, 'please enter your email address'],
		trim: true,
		lowercase: true,
		unique: [true, 'email address already in use'],
		match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'email address not valid']
	},
	userName: {
		type: String,
		required: [true, 'please enter a username'],
		trim: true,
		unique: [true, 'username already in use']
	},
	password: {
		type: String,
		minLength: [8, 'password needs at least 8 characters'],
		required: [true, 'please enter a password']
	},
	refreshToken: {
		type: String
	},
	role: {
		type: String,
		default: 'user'
	},
	twoFactorEnabled: {
		type: Boolean,
		default: false
	},
	twoFactorToken: {
		type: Object
	},
	customerId: {
		type: String
	},
	subscriptionLevel: {
		type: String,
		enum: ['standard', 'upgraded', 'unlimited'],
		default: 'standard'
	}
});

module.exports = {
	model: mongoose.model('User', User),
	schema: User
};
