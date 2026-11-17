const assert = require('node:assert/strict');
function guard(env = process.env) {
  assert.equal(env.ZAIRO_PHONE_QA, '1', 'Phone QA requires explicit opt-in');
  assert.equal(env.NODE_ENV, 'development', 'Phone QA must not run as production');
  assert.equal(env.LOCATION_NOTIFICATIONS_ENABLED, 'false', 'Notifications must be disabled');
  const db = new URL(env.DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(db.protocol), 'PostgreSQL URL required');
  assert.equal(db.search, '', 'Connection overrides are forbidden');
  assert.equal(db.hash, '', 'Connection fragments are forbidden');
  assert.ok(['127.0.0.1', 'localhost', 'pg-ensayo'].includes(db.hostname), 'Only the dedicated local database is allowed');
  assert.equal(db.pathname, '/zairo_phone_qa', 'A separate phone QA database is required');
  assert.equal(db.username, 'zairo_phone_qa', 'A separate phone QA database user is required');
  assert.ok((env.JWT_SECRET || '').length >= 40, 'An independent random JWT secret is required');
  return db;
}
module.exports = {guard};
