const mongoose     = require('mongoose');
const Config       = require('config');
const Model 			 = require('./src/models/userModel').model;

const email 			 = process.env.npm_config_email;

const config = Config.get('server');
mongoose.connect(config.db, {useNewUrlParser: true}).catch(e => console.log(e));

async function makeUserAdmin(userEmail) {
	try {
		const user = await Model.findOne({email: userEmail});
		if (user) {
			if (user.role === 'admin') {
				console.log(`User with '${email}' already has admin rights!`);
			} else {
				user.role = 'admin';
				await user.save();
				console.log(`Successfully made '${email}' an admin user!`);
			}
		} else {
			console.log(`User with email '${email}' not found!`);
		}
	} catch(e) {
		console.error(e);
	}
}

(async () => {
	try {
		if (email === undefined) {
			console.error('Please provide a username with --email=\'email\'');
		} else {
			await makeUserAdmin(email);
		}
		mongoose.disconnect().catch(e => console.log(e));
	} catch (e) {
		console.error(e);
	}
})();
