const bodyParser = require('koa-bodyparser');
const validate = require('validate.js');
const _ = require('lodash');
const moment = require('moment');
const { createHash } = require('crypto');
const config = require('config');
const { createRouter } = require('@button/libbtn/web');
const ButtonId = require('@button/libbtn/util/button-id');

const DeferredDeeplink = require('../lib/deferred-deeplink');

const normalizeFieldDefaults = signals =>
  _.extend(
    {
      ip: '',
      os: '',
      os_version: '',
    },
    signals
  );

const normalizeCase = signals => _.mapValues(signals, _.toLower);

// PT-362 We only want the major and minor portions of the OS Version to be
// considered as part of a fingerprint.
//
// That is, "12.3.12-alpha" should map to "12.3".
//
const OS_VERSION_RE = /^(\d+\.\d+)/;
const normalizeOSVersion = signals => {
  if (!_.isString(signals.os_version)) {
    return signals;
  }

  const match = signals.os_version.match(OS_VERSION_RE);
  if (match === null) {
    return signals;
  }

  return { ...signals, os_version: match[1] };
};

const normalizeSignals = _.flow(
  normalizeFieldDefaults,
  normalizeCase,
  normalizeOSVersion
);

const ATTRIBUTION_WINDOW = config.get('attributionWindow');
const DEFERRED_DEEPLINK_WINDOW = config.get('deferredDeeplinkWindow');
const GET_WINDOW = 60 * 60 * 24 * 7; // 7 days in seconds

function getMatchObject(queryObj) {
  const result = { match: false };

  if (queryObj) {
    const obj = DeferredDeeplink.toJson(queryObj);
    if (moment().diff(moment(obj.created_at)) <= 1000 * ATTRIBUTION_WINDOW) {
      result.match = true;
      result.id = obj.id;
      result.attribution = obj.attribution;
      if (
        moment().diff(moment(obj.created_at)) <=
        1000 * DEFERRED_DEEPLINK_WINDOW
      ) {
        result.action = obj.action;
      }
    }
  }

  return result;
}

const fingerprint = signals => {
  const rawFingerprint = _
    .values(_.pick(signals, ['application_id', 'ip', 'os', 'os_version']))
    .join('|');

  return createHash('sha1')
    .update(rawFingerprint)
    .digest('hex');
};

const ddlKey = id => `ddl:${id}`;
const fingerprintKey = id => `fingerprint:${id}`;

const fetchMatch = redisClient => async id => {
  const result = await redisClient.get(ddlKey(id));
  return result === null ? result : JSON.parse(result);
};

const createMatch = redisClient => ddl => {
  const payload = JSON.stringify(ddl);
  const fpKey = fingerprintKey(fingerprint(ddl));

  return redisClient.multi([
    ['lpush', fpKey, payload],
    ['expire', fpKey, ATTRIBUTION_WINDOW],
    ['set', ddlKey(ddl.id), payload, 'EX', GET_WINDOW],
  ]);
};

const findMatch = redisClient => async (
  applicationID,
  ip,
  os,
  osVersion,
  oldestAttributableDatetime
) => {
  const signals = {
    application_id: applicationID,
    ip,
    os,
    os_version: osVersion,
  };

  // lpopwhile is a custom lua script defined in /lua/lpopwhile.lua.  It will
  // lpop from the key defined in the first argument until the created date
  // of the ddl (located at the json key "created_at") is greater than
  // `oldestAttributableDatetime`--the oldest possible created date that falls
  // inside the attribution window.
  //
  // Using a list for many "match slots" at the same fingerprint implements our
  // current fingerprint collision policy, which is to allow N matches per N
  // match creations at the same key.
  //
  const result = await redisClient.lpopwhile(
    fingerprintKey(fingerprint(signals)),
    'created_at',
    oldestAttributableDatetime
  );

  return result === null ? result : JSON.parse(result);
};

const consumeMatch = redisClient => async (id, now) => {
  const ddlKey = `ddl:${id}`;

  const result = await redisClient.get(ddlKey);

  if (result === null) {
    return;
  }

  const parsedResult = JSON.parse(result);
  parsedResult.matched_at = now;
  parsedResult.modified_at = now;

  await redisClient.set(ddlKey, JSON.stringify(parsedResult));
};

module.exports = function(metrics, errorLogger, redisClient) {
  const fetchMatchHandler = async ctx => {
    const { id } = ctx.params;
    const result = await fetchMatch(redisClient)(id);

    if (result !== null) {
      ctx.body = DeferredDeeplink.toJson(result);
    } else {
      ctx.code = 404;
    }
  };

  const createMatchHandler = async ctx => {
    const constraints = {
      application_id: { presence: true },
      action: { presence: true },
      signals: { presence: true },
      'signals.ip': { presence: true },
    };

    const body = ctx.request.body;
    const errors = validate(body, constraints) || {};

    // Validate if ever there is a passed in DDL id
    if (body.id && !ButtonId.validate('ddl', body.id)) {
      errors.id = ['must be a valid Button-ID'];
    }

    if (body.attribution) {
      if (!_.isPlainObject(body.attribution)) {
        errors.attribution = ['must be of type Object'];
      } else if (!_.values(body.attribution).every(_.isString)) {
        errors.attribution = ['must have only string keys'];
      }
    }

    if (Object.keys(errors).length !== 0) {
      ctx.status = 400;
      ctx.body = errors;
      return;
    }

    const signals = normalizeSignals(body.signals);

    // Accept suggested DDL id from the caller
    const buttonId = body.id
      ? ButtonId.parseStr('ddl', body.id)
      : ButtonId.create('ddl');

    const dbId = buttonId.toJsonStyle();

    const newDDL = DeferredDeeplink.newRecord(
      dbId,
      body.action,
      body.attribution,
      body.application_id,
      signals
    );

    try {
      await createMatch(redisClient)(newDDL);
      ctx.body = DeferredDeeplink.toJson(newDDL);
    } catch (err) {
      ctx.status = 400;
      ctx.body = {
        message: err.message,
        detail: err,
      };
    }
  };

  const findMatchHandler = async ctx => {
    const body = ctx.request.body;

    if (!config.get('matchFingerprints')) {
      ctx.body = { match: false };
      return;
    }

    const constraints = {
      application_id: { presence: true },
      signals: { presence: true },
      'signals.ip': { presence: true },
    };

    const errors = validate(body, constraints);

    if (errors) {
      ctx.status = 400;
      ctx.body = errors;
      return;
    }

    const oldestAttributableDatetime = moment()
      .subtract(ATTRIBUTION_WINDOW, 'seconds')
      .toISOString();

    const applicationID = body.application_id;

    const { ip, os, os_version: osVersion } = normalizeSignals(body.signals);
    const result = await findMatch(redisClient)(
      applicationID,
      ip,
      os,
      osVersion,
      oldestAttributableDatetime
    );

    const matchObj = getMatchObject(result);

    metrics.increment({
      name: 'central_booking_fingerprints_total',
      status: matchObj.match ? 'hit' : 'miss',
    });

    ctx.body = matchObj.match ? matchObj : {};

    if (matchObj.match) {
      await consumeMatch(redisClient)(matchObj.id, new Date());
    }
  };

  const router = createRouter();

  router.use(bodyParser());
  router.get('/:id', fetchMatchHandler);
  router.post('/', createMatchHandler);
  router.post('/find-match-api', findMatchHandler);

  return router;
};
