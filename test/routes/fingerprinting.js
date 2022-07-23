const supertest = require('supertest');
const Application = require('@button/libbtn/web/app');
const moment = require('moment');
const assert = require('assert');
const config = require('config');

const fingerprinting = require('../../routes/fingerprinting');
const createRedisClient = require('../../lib/redis');
const { nodeRedisClient, redisScripts } = require('../../server');

const noop = () => {};

describe('fingerprinting', function() {
  before(async function() {
    const metrics = { increment: noop };
    const errorLogger = { logError: noop };
    const app = new Application({ logToConsole: false });

    this.redisClient = await createRedisClient(
      nodeRedisClient,
      redisScripts,
      errorLogger
    );

    app.use(fingerprinting(metrics, errorLogger, this.redisClient).routes());

    this.request = supertest(app.koa.callback());
  });

  beforeEach(function() {
    config.matchFingerprints = true;
    return this.redisClient.flushall();
  });

  describe('GET /:id', function() {
    it('returns a 404 for not found fingerprint', async function() {
      const response = await this.request.get('/TEST_ID').expect(404);

      assert.deepEqual(response.body, {});
    });

    it('should get a fingerprint', async function() {
      const testFingerprint = {
        id: 'TEST_ID',
        btn_ref: 'TEST_BUTTON_REF',
        action: 'TEST_ACTION',
        ip: '1.1.1.1',
        os: 'ios',
        os_version: '6.0',
        session_id: 'TEST_SESSION_ID',
        application_id: 'TEST_APP_ID',
        matched_at: '2016-01-19 17:20:46',
        created_at: '2016-01-19 17:20:46',
        modified_at: '2016-01-19 17:20:46',
      };

      await this.redisClient.set(
        'ddl:TEST_ID',
        JSON.stringify(testFingerprint)
      );

      await this.request
        .get('/TEST_ID')
        .expect(200)
        .expect(res => {
          const fp = res.body;
          assert.equal(fp.id, testFingerprint.id);
          assert.equal(fp.attribution.btn_ref, testFingerprint.btn_ref);
          assert.equal(fp.action, testFingerprint.action);
          assert.equal(fp.signals.ip, testFingerprint.ip);
          assert.equal(fp.signals.os, testFingerprint.os);
          assert.equal(fp.signals.os_version, testFingerprint.os_version);
          assert.equal(fp.session_id, testFingerprint.session_id);
          assert.equal(fp.application_id, testFingerprint.application_id);
        });
    });
  });

  describe('POST /', function() {
    it('should create a fingerprint', async function() {
      const response = await this.request
        .post('/')
        .send({
          application_id: 'test-app-id',
          action: 'TEST_ACTION',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert(response.body.id.match(/^ddl-\w+/));
      assert.deepEqual(response.body.signals, {
        ip: '1.1.1.1',
        os: 'ios',
        os_version: '6.0',
      });

      const redisResult = await this.redisClient.get(`ddl:${response.body.id}`);
      assert.deepEqual(JSON.parse(redisResult).action, 'TEST_ACTION');
    });

    it('should reject an attribution payload with array keys', function() {
      return this.request
        .post('/')
        .send({
          application_id: 'test-app-id',
          action: 'TEST_ACTION',
          attribution: {
            btn_ref: ['srctok-1', 'srctok-2'],
          },
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(400)
        .expect(res => {
          assert.deepEqual(res.body, {
            attribution: ['must have only string keys'],
          });
        });
    });

    it('should reject invalid ID', function() {
      return this.request
        .post('/')
        .send({
          id: 'blah-12349',
          application_id: 'test-app-id',
          action: 'TEST_ACTION',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(400);
    });

    it('should create a fingerprint with passed in ID', async function() {
      const response = await this.request
        .post('/')
        .send({
          id: 'ddl-4a2e4af139b9fec0',
          application_id: 'test-app-id',
          action: 'TEST_ACTION',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.equal('ddl-4a2e4af139b9fec0', response.body.id);
      assert.deepEqual(response.body.signals, {
        ip: '1.1.1.1',
        os: 'ios',
        os_version: '6.0',
      });

      const redisResult = await this.redisClient.get(
        'ddl:ddl-4a2e4af139b9fec0'
      );
      assert.deepEqual(JSON.parse(redisResult).id, 'ddl-4a2e4af139b9fec0');
    });

    it('should patch ios 11.3.1 when creating a fingerprint', async function() {
      const response = await this.request
        .post('/')
        .send({
          application_id: 'test-app-id',
          action: 'TEST_ACTION',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '11.3.1',
          },
        })
        .expect(200);

      assert.deepEqual(response.body.signals, {
        ip: '1.1.1.1',
        os: 'ios',
        os_version: '11.3',
      });

      const redisResult = await this.redisClient.get(`ddl:${response.body.id}`);
      assert.deepEqual(JSON.parse(redisResult).os_version, '11.3');
    });
  });

  describe('POST /find-match-api', function() {
    it('should match a fingerprint', async function() {
      const createMatchResponse = await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      let record = await this.redisClient.get(
        `ddl:${createMatchResponse.body.id}`
      );
      assert.equal(JSON.parse(record).matched_at, null);

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(findMatchResponse.body.match);
      assert.equal(createMatchResponse.body.id, findMatchResponse.body.id);

      record = await this.redisClient.get(`ddl:${createMatchResponse.body.id}`);
      assert.equal(JSON.parse(record).matched_at.length, 24);

      const anotherMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(!anotherMatchResponse.body.match);
    });

    it('should allow multiple matches to queue at the same fingerprint', async function() {
      const createMatchResponse = await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      const secondCreateMatchResponse = await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(findMatchResponse.body.match);
      assert.equal(
        secondCreateMatchResponse.body.id,
        findMatchResponse.body.id
      );

      const secondFindMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      // Our queueing is implemented as FILO
      assert.ok(secondFindMatchResponse.body.match);
      assert.equal(
        createMatchResponse.body.id,
        secondFindMatchResponse.body.id
      );

      const anotherMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(!anotherMatchResponse.body.match);
    });

    it('should match a fingerprint invariant of patch version', async function() {
      const createMatchResponse = await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '11.3',
        },
      });

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '11.3.1',
          },
        })
        .expect(200);

      assert.ok(findMatchResponse.body.match);
      assert.equal(createMatchResponse.body.id, findMatchResponse.body.id);
    });

    it('should match a fingerprint strictly on os version if major.minor cant be parsed', async function() {
      const createMatchResponse = await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: 'bloop',
        },
      });

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: 'bloop',
          },
        })
        .expect(200);

      assert.ok(findMatchResponse.body.match);
      assert.equal(createMatchResponse.body.id, findMatchResponse.body.id);
    });

    it(`shouldn't find a match for different signals`, async function() {
      await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.2',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(!findMatchResponse.body.match);
    });

    it(`shouldn't find a match for an expired attribution window`, async function() {
      await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      const key = 'fingerprint:2ce0cd26187ce07e4578faa9901a7898e707427c';

      const record = JSON.parse(await this.redisClient.lpop(key));
      record.created_at = moment
        .utc()
        .subtract(4, 'hours')
        .format();
      await this.redisClient.lpush(key, JSON.stringify(record));

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(!findMatchResponse.body.match);
      assert.equal(findMatchResponse.body.action, null);
    });

    it('doesnt return an action if outside the deeplink window', async function() {
      await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      const key = 'fingerprint:2ce0cd26187ce07e4578faa9901a7898e707427c';

      const record = JSON.parse(await this.redisClient.lpop(key));
      record.created_at = moment
        .utc()
        .subtract(25, 'minutes')
        .format();
      await this.redisClient.lpush(key, JSON.stringify(record));

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(findMatchResponse.body.match);
      assert.equal(findMatchResponse.body.action, null);
    });

    it(`shouldn't match a fingerprint when the killswitch is engaged`, async function() {
      config.matchFingerprints = false;

      await this.request.post('/').send({
        application_id: 'test-app-id',
        action: 'TEST_ACTION',
        signals: {
          ip: '1.1.1.1',
          os: 'ios',
          os_version: '6.0',
        },
      });

      const findMatchResponse = await this.request
        .post('/find-match-api')
        .send({
          application_id: 'test-app-id',
          signals: {
            ip: '1.1.1.1',
            os: 'ios',
            os_version: '6.0',
          },
        })
        .expect(200);

      assert.ok(!findMatchResponse.body.match);
    });
  });
});
