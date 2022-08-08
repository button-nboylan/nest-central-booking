const { map, mapValues, fromPairs, extend } = require('lodash');
const { promisify } = require('util');

const EXPOSE_FUNCTIONS = [
  'script',
  'evalsha',
  'get',
  'set',
  'lpush',
  'flushall',
  'lpop',
];

/**
 * Like Promise.all, but for an Object whose values are promises.  Follows the
 * resolution/rejection semantics of Promise.all.
 *
 * @param  {Object<string, Promise>} obj
 * @return {Object} A new Object with the same keys as obj whose values are the
 *   resolution value of each key's respective promise.
 */
const promiseAllObject = async obj =>
  fromPairs(await Promise.all(map(obj, (v, k) => v.then(res => [k, res]))));

/**
 * Returns an object with handy functions on top of a node-redis client.  All
 * functions returned return a Promise.
 *
 * @param  {NodeRedis.client} client An instance of a node-redis client
 * @param  {Object<string, string|Buffer>} scripts An object of lua scripts to
 *   expose on the returned client.  Keys are the function names that will be
 *   exposed, and values are strings of Lua code.  The returned client will
 *   expose each script as a function.
 * @param  {libbtn.logging.ErrorLogger} errorLogger
 * @return {Object<string, Function>} A collection of functions to execute
 *   against commands against redis.
 */
const createRedisClient = async (client, scripts, errorLogger) => {
  client.on('error', err => errorLogger.logError(err));

  const redisFunctions = fromPairs(
    EXPOSE_FUNCTIONS.map(m => [m, promisify(client[m].bind(client))])
  );

  const multi = (...args) => {
    return new Promise((resolve, reject) => {
      return client.multi(...args).exec((err, res) => {
        if (err) {
          reject(err);
        }

        const errors = res.filter(r => r instanceof Error);
        if (errors.length > 0) {
          reject(errors[0]);
        }

        resolve(res);
      });
    });
  };

  const scriptFunctions = await promiseAllObject(
    mapValues(scripts, async v => {
      const sha = await redisFunctions.script('load', v);
      return (...args) => redisFunctions.evalsha(sha, args.length, ...args);
    })
  );

  return extend(redisFunctions, scriptFunctions, { multi });
};

module.exports = createRedisClient; // FIXME :: fix this bullshit
