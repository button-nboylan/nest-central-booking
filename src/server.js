const { readFileSync } = require('fs');
const path = require('path');
const config = require('config');
const Application = require('@button/libbtn/web/app');
const nodeRedis = require('redis');

const fingerprinting = require('./routes/fingerprinting');
const createRedisClient = require('./lib/redis');

const luaPath = name => path.join(__dirname, 'lua', name);

const app = new Application({
  port: config.get('port'),
  sentryDsn: config.get('sentryDsn'),
});

const nodeRedisClient = nodeRedis.createClient({
  host: config.get('redisHost'),
  port: config.get('redisPort'),
  retry_strategy: () => 1000,
});

const redisScripts = { lpopwhile: readFileSync(luaPath('lpopwhile.lua')) };

const { errorLogger, metrics } = app;

const start = async () => {
  const redisClient = await createRedisClient(
    nodeRedisClient,
    redisScripts,
    errorLogger
  );

  const router = Application.createRouter();
  router.use(
    '/api/deferred-deeplink',
    fingerprinting(metrics, errorLogger, redisClient).routes()
  );

  app.use(router.routes());
  app.serve();
};

start().catch(err => errorLogger.logError(err));

module.exports = { nodeRedisClient, redisScripts };
