const mongoose = require('mongoose');
const { MQ } = require("../messageBroker/publisher")

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
	subscriptionLevel: {
		type: String,
		enum: ['standard', 'upgraded', 'unlimited'],
		default: 'standard'
	}
});

User.pre("findOneAndDelete", async function (next) {
	const filter = this.getFilter();
    const deletedUser = await this.model.findOne(filter);
	await MQ.init()
	await MQ.send("userDelete", deletedUser._id)
	next();
  });


module.exports = {
	model: mongoose.model('User', User),
	schema: User
};
