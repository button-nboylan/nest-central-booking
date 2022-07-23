const assert = require('assert');
const DeferredDeeplink = require('../../lib/deferred-deeplink');

describe('DeferredDeeplink lib', function() {
  it('should serialize a dbRecord', function() {
    const record = {
      id: 'ddl-5c5f80101de0804b',
      action: 'uber://asdfasfasf',
      btn_ref: 'srctok-afsldkjf29askldfjwe',
      application_id: 'app-1919960571796103083',
      session_id: 'sess-123123123123',
      ip: '20.20.20.20',
      os: 'ios',
      os_version: '9.0.2',
      created_at: '2015-11-20T00:15:06.000Z',
      modified_at: '2015-11-20T00:15:06.000Z',
      matched_at: '2015-11-20T00:15:16.000Z',
    };

    const expected = {
      id: 'ddl-5c5f80101de0804b',
      action: 'uber://asdfasfasf',
      application_id: 'app-1919960571796103083',
      session_id: 'sess-123123123123',
      signals: {
        ip: '20.20.20.20',
        os: 'ios',
        os_version: '9.0.2',
      },
      attribution: {
        btn_ref: 'srctok-afsldkjf29askldfjwe',
      },
      created_at: '2015-11-20T00:15:06.000Z',
      modified_at: '2015-11-20T00:15:06.000Z',
      matched_at: '2015-11-20T00:15:16.000Z',
    };

    assert.deepEqual(expected, DeferredDeeplink.toJson(record));
  });
});
