const DeferredDeeplink = {};

DeferredDeeplink.toJson = function toJson(dbRecord) {
  const jsonRecord = {
    id: dbRecord.id,
    action: dbRecord.action,
    application_id: dbRecord.application_id,
    session_id: dbRecord.session_id,
    signals: {
      ip: dbRecord.ip,
      os: dbRecord.os,
      os_version: dbRecord.os_version,
    },
    attribution: {},
    created_at: dbRecord.created_at,
    modified_at: dbRecord.modified_at,
    matched_at: dbRecord.matched_at,
  };

  if (dbRecord.btn_ref) {
    jsonRecord.attribution.btn_ref = dbRecord.btn_ref;
  }

  return jsonRecord;
};

const SIGNALS_FIELDS = ['ip', 'os', 'os_version'];

DeferredDeeplink.newRecord = function(id, action, attribution, appId, signals) {
  const _now = new Date();

  attribution = attribution || {};

  const record = {
    id,
    action,
    application_id: appId,
    session_id: null,
    matched_at: null,
    created_at: _now,
    modified_at: _now,
    btn_ref: attribution.btn_ref,
  };

  // Add fields from signals
  SIGNALS_FIELDS.forEach(attribute => {
    record[attribute] = signals[attribute];
  });

  return record;
};

module.exports = DeferredDeeplink;
