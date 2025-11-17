const config = require("../../config")
const {Strategy, ExtractJwt} = require('passport-jwt');
const User = require('./../models/userModel').model;

const opts = {
	jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
	secretOrKey: config.SECRET_KEY
};

const strategy = new Strategy(opts, (jwtPayload, done) => {
	User.findOne({_id: jwtPayload.id}, (err, user) => {
		if (err) return done(err, false);
		if (user) return done(null, user);
		return done(null, false);
	});
});


module.exports = {
	strategy
};
