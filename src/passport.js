const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const { ExtractJwt } = require('passport-jwt');
const bcrypt = require('bcrypt');
const Model = require('./models/userModel').model;
const config = require('../config'); // Adjust the path to your config
const { validateEmail } = require('./utils');
const OAuth2Strategy = require('passport-oauth2');
const GithubStrategy = require('passport-github2');
const jwtDecode = require('jwt-decode');

// Local Strategy
passport.use(
	new LocalStrategy(
		{ usernameField: 'email' },
		async (email, password, done) => {
			try {
				let user;
				if (validateEmail(email)) {
					user = await Model.findOne({ email });
				} else {
					user = await Model.findOne({ userName: email });
				}

				if (!user) {
					return done(null, false, { message: 'User not found' });
				}

				const isMatch = bcrypt.compareSync(password, user.password);
				if (!isMatch) {
					return done(null, false, { message: 'Incorrect password' });
				}

				return done(null, user);
			} catch (error) {
				return done(error);
			}
		}
	)
);

passport.use(
	new GithubStrategy(
		{
			clientID: config.GITHUB_CLIENT_ID,
			clientSecret: config.GITHUB_CLIENT_SECRET,
			callbackURL: 'http://localhost:3002/auth/login/callback',
			scope: ['user:email'],
		},
		async (accessToken, refreshToken, profile, done) => {
			console.log(profile);

			const user = {
				email: profile.emails[0].value,
				provider: 'github',
				providerId: profile.id,
				userName: profile.username,
			};
			console.log(user);

			const res = await Model.findOneAndUpdate({ provider: 'github', providerId: profile.id }, user, {
				upsert: true,
				new: true,
			});
			console.log(res);
			return done(null, res);
		}
	)
);

const cookieExtractor = (req) => {
	let jwt = null;
	if (req && req.cookies) {
		jwt = req.cookies.jwt;
	}
    console.log(jwt);
    console.log(jwtDecode(jwt));



	return jwt;
};

// JWT Strategy
const opts = {
	jwtFromRequest: cookieExtractor,
	secretOrKey: config.SECRET_KEY,
};

passport.use(
	new JwtStrategy(opts, async (jwtPayload, done) => {
		Model.findOne({_id: jwtPayload.id}, (err, user) => {
			if (err) return done(err, false);
			if (user) return done(null, user);
			return done(null, false);
		});
	})
);

module.exports = passport;
