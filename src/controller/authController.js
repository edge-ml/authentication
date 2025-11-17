const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const jwt    = require('jsonwebtoken');
const config = require("../../config")

const secret = config.SECRET_KEY;

/**
 * handle authentication response
 */
async function handleAuthentication(ctx, passport) {
	await passport.authenticate('jwt', async (err, user, info) => {
		const token = ctx.request.headers.authorization;

		if(!token) {
			ctx.body = {error: 'Missing authentication header'};
			ctx.status = 401;
			return ctx;
		}

		const jwtToken = ctx.request.headers.authorization.replace('Bearer ', '');
		try {
			const jwtUserObject = await jwt.verify(jwtToken, secret);
			if(jwtUserObject.twoFactorEnabled && !jwtUserObject.twoFactorVerified) {
				ctx.body = {error: 'Unauthorized'};
				ctx.status = 401;
				return ctx;
			}
		} catch(error) {
			ctx.body = { error: error.message };
			ctx.status = 500;
			return ctx;
		}

		if(info) {
			ctx.body = {error: 'Unauthorized'};
			ctx.status = 401;
			return ctx;
		}
		ctx.body = {
			success: true,
			userId: user._id,
			role: user.role || 'user'
		};
		ctx.status = 200;
		return ctx;
	})(ctx);
}

/**
 * init 2factor
 * generate a secret token to be saved in an application like Google Authenticator
 */
async function init2Fa(ctx) {
	const { user } = ctx.req;

	if(!user) {
		ctx.body = {error: 'Unauthorized'};
		ctx.status = 404;
		return ctx;
	}

	const twoFasecret = speakeasy.generateSecret({
		length: 20,
		name: `Explorer (${user.email})`
	});

	user.twoFactorToken = {
		otpauthUrl: twoFasecret.otpauth_url,
		base32: twoFasecret.base32,
	};

	await user.save();

	ctx.body = await QRCode.toDataURL(twoFasecret.otpauth_url);
	ctx.type = 'image/png';

	ctx.status = 200;
	return ctx;
}

/**
 * verify 2factor code
 */
async function verify2Fa(ctx) {
	const { user } = ctx.req;
	const { token } = ctx.request.body;

	// check if token provided
	if(!token) {
		ctx.body = {error: 'Token for TwoFactorAuthentication missing'};
		ctx.status = 401;
		return ctx;
	}

	// validate provided token
	const valid = speakeasy.totp.verify({
		secret: user.twoFactorToken.base32,
		encoding: 'base32',
		token,
	});

	if(!valid) {
		ctx.body = {
			error: 'TwoFactorAuthentication token is not valid!',
			isTwoFactorAuthenticated: false
		};
		ctx.status = 401;
		return ctx;
	}

	// enable 2fa in user object, since user now initiated 2fa successfully
	user.twoFactorEnabled = true;
	await user.save();

	// create new jwt token that contains twoFactorVerified and is therefore valid for backend routes
	const payload = {
		id: user._id,
		twoFactorEnabled: user.twoFactorEnabled,
		twoFactorVerified: true
	};

	const jwtToken = jwt.sign(payload, secret, {expiresIn: config.SERVER_TTL});

	ctx.body = {
		isTwoFactorAuthenticated: true,
		access_token: `Bearer ${jwtToken}`,
		refresh_token: `${user.refreshToken}`,
	};
	ctx.status = 200;
	return ctx;
}

/**
 * reset 2factor
 * only possible after successful 2fa verification
 */
async function reset2Fa(ctx) {
	const { user } = ctx.req;

	if(!user) {
		ctx.body = {error: 'Unauthorized'};
		ctx.status = 401;
		return ctx;
	}

	if(!user.twoFactorEnabled) {
		ctx.body = {message: 'TwoFactorAuthentication already disabled!'};
		ctx.status = 200;
		return ctx;
	}

	const jwtToken = ctx.request.headers.authorization.replace('Bearer ', '');

	try {
		const jwtUserObject = await jwt.verify(jwtToken, secret);
		if(jwtUserObject.twoFactorEnabled && !jwtUserObject.twoFactorVerified) {
			ctx.body = {error: 'Unauthorized'};
			ctx.status = 401;
			return ctx;
		}
	} catch(error) {
		ctx.body = { error: error.message };
		ctx.status = 500;
		return ctx;
	}

	user.twoFactorEnabled = false;
	user.twoFactorToken = null;

	await user.save();

	ctx.body = {message: 'Successfully reset TwoFactorAuthentication!'};
	ctx.status = 200;
	return ctx;
}

module.exports = {
	handleAuthentication,
	init2Fa,
	verify2Fa,
	reset2Fa
};
