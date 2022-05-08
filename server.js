const Koa          = require('koa');
const KoaStatic    = require('koa-static');
const logger       = require('koa-logger');
const Config       = require('config');
const mongoose     = require('mongoose');
const cors         = require('koa-cors');
const convert      = require('koa-convert');
const bodyParser   = require('koa-bodyparser');
const passport     = require('koa-passport');
const dbSchema     = require("koa-mongoose-erd-generator");
const yamljs       = require("yamljs")
const koaSwagger   = require("koa2-swagger-ui").koaSwagger;
const fs           = require("fs");
const path         = require("path");

const passportConfig     = require('./src/auth/passport-config');

// Set mongoose.Promise to any Promise implementation
mongoose.Promise = Promise;

// parse config
const config = Config.get('server');

// instantiate koa
const server = new Koa();

// connect to Mongo
mongoose.connect(config.db, {useNewUrlParser: true});


// Serve documentation

server.use(
	dbSchema(
	  "/auth/docs/db",
	  { modelsPath: __dirname + "/src/models", nameColor: "#007bff" },
	  __dirname + "/docs/dbSchema.html"
	)
  );
  
  
  const spec = yamljs.load("./docs/docs.yaml");
  server.use(
	koaSwagger({
	  routePrefix: "/docs",
	  title: "Explorer",
	  swaggerOptions: { spec },
	  favicon: "/auth/docs/favicon.ico",
	  hideTopbar: true,
	})
  );
  const favIcon = fs.readFileSync(path.join(__dirname, "/docs/favicon.ico"));
  server.use((ctx, next) => {
	if (
	  ctx.path == "/auth/docs/favicon.ico" &&
	  ctx.method == "GET" &&
	  ctx.method != "Head"
	) {
	  ctx.body = favIcon;
	  ctx.status = 200;
	  return ctx;
	}
	return next();
  });

// setup passport
server.use(passport.initialize());
passport.use(passportConfig.strategy);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// setup koa middlewares
server.use(convert(cors()));
server.use(convert(bodyParser()));
server.use(convert(logger()));
server.use(KoaStatic('./public'));

// unprotected routing
const router = require('./src/routes/router')(server, passport);

server.use(router.routes());

// catch all middleware
server.use(async (ctx) => {
	ctx.body = {error: 'Not Found'};
	ctx.status = 404;
	return ctx;
});

module.exports = server.listen(3002);
