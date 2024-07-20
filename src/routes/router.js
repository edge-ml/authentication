const express = require('express');
const userController = require('../controller/userController');
const authController = require('../controller/authController');
const passport = require('../passport');

module.exports = (passport) => {
	const router = express.Router();

	router.get(
		'/user',
		(req, res, next) => {
			passport.authenticate('jwt', { session: false }, (err, user, info) => {
        console.log(info);
				if (err) {
					console.error('Authentication Error: ', err);
					return res.status(500).json({ message: 'Internal Server Error' });
				}
				if (!user) {
					return res.status(401).json({ message: 'Unauthorized' });
				}
				req.user = user;
				next();
			})(req, res, next);
		},
		async (req, res) => {
			try {
				await userController.getUser(req, res, passport);
			} catch (error) {
				console.error('Controller Error: ', error);
				res.status(500).json({ message: 'Internal Server Error' });
			}
		}
	);

	router.post('/register', async (req, res) => {
		await userController.registerNewUser(req, res);
	});

	router.get('/login/oauth', async (req, res) => {
		await userController.loginGithub(req, res);
	});

	router.get('/login/callback', async (req, res, next) => {
		await userController.callbackOAuth(req, res, next);
	});
	/**
   * LOGIN
   *
   * login and return token
   * route:                 /login
   * method type:   POST
   */
	router.post('/login', async (req, res, next) => {
		await userController.loginUser(req, res, next);
	});

	router.get('/logout', async (req, res, next) => {
		await userController.logoutUser(req, res, next);
	})

	/**
   * REFRESH
   *
   * login by refresh token and return jwt token
   * route:                 /refresh
   * method type:   POST
   */
	router.post('/refresh', async (req, res) => {
		await userController.loginUserRefresh(req, res);
	});

	/**
   * 2FA-INIT
   *
   * generate a secret token to be saved in an application like Google Authenticator.
   * route:                 /2fa-secret
   * method type:   POST
   */
	router.post(
		'/2fa/init',
		passport.authenticate('jwt', { session: false }),
		async (req, res) => {
			await authController.init2Fa(req, res);
		}
	);

	/**
   * 2FA-VERIFY
   *
   * verify a time-based one-time password (TOTP) based on the secret token
   * route:                 /2fa-generate
   * method type:   POST
   */
	router.post(
		'/2fa/verify',
		passport.authenticate('jwt', { session: false }),
		async (req, res) => {
			await authController.verify2Fa(req, res);
		}
	);

	/**
   * 2FA-RESET
   *
   * reset 2fa
   * route:                 /2fa/reset
   * method type:   POST
   */
	router.post(
		'/2fa/reset',
		passport.authenticate('jwt', { session: false }),
		async (req, res) => {
			await authController.reset2Fa(req, res);
		}
	);

	/**
   * AUTHENTICATE
   *
   * check if token is valid
   * route:                 /authenticate
   * method type:   POST
   */
	router.post('/authenticate', async (req, res) => {
		await authController.handleAuthentication(req, res, passport);
	});

	/**
   * UNREGISTER
   *
   * Deletes a user from the database
   * route:                 /unregister
   * method type:   DELETE
   */
	router.delete('/unregister', async (req, res) => {
		await userController.deleteUser(req, res, passport);
	});

	/**
   * LIST ALL USERS
   *
   * lists all users, admin rights needed
   * route:                 /users
   * method type:   GET
   */
	router.get('/users', async (req, res) => {
		await userController.getUsers(req, res, passport);
	});

	/**
   * Maps userNames to user._id
   * route: /id
   * method: type: POST
   */
	router.post('/id', async (req, res) => {
		await userController.getUsersIds(req, res, passport);
	});

	/**
   * Maps userIds to userNames
   * route: /userName
   * method: type: POST
   */
	router.post('/userName', async (req, res) => {
		await userController.getUserNames(req, res, passport);
	});

	/**
   * Allows a user to change his own e-mail address
   * route: /changeMail
   * method type: PUT
   */
	router.put('/changeMail', async (req, res) => {
		await userController.changeUserMail(req, res, passport);
	});

	/**
   * Changes the password of a user
   * route /changePassword
   * method type: PUT
   */
	router.put('/changePassword', async (req, res) => {
		await userController.changeUserPassword(req, res, passport);
	});

	router.put('/changeUserName', async (req, res) => {
		await userController.changeUserName(req, res, passport);
	});

	router.post('/userNameSuggest', async (req, res) => {
		await userController.getUserNameSuggestions(req, res, passport);
	});

	return router;
};
