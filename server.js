const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const yamljs = require('yamljs');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const passportConfig = require('./src/auth/passport-config');
const passport = require('./src/passport');
const cookieParser = require('cookie-parser');

// Set mongoose.Promise to any Promise implementation
mongoose.Promise = Promise;

// instantiate express
const app = express();
app.use(cookieParser());

// connect to Mongo
mongoose.connect(config.DATABASE_URI + config.DATABASE_COLLECTION_AUTH, { useNewUrlParser: true });

// Serve documentation
const spec = yamljs.load('./docs/docs.yaml');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

// Setup favicon
app.get('/auth/docs/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '/docs/favicon.ico'));
});

// setup passport
app.use(passport.initialize());

// setup express middlewares
app.use(cors({
	origin: "http://localhost:5173",
	credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// unprotected routing
const router = require('./src/routes/router')(passport);
app.use('/auth', router);

// catch all middleware
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// start the server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
