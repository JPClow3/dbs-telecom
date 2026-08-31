import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDemoOptInEnabled,
  isUnauthorizedStatus,
  normalizeAuthToken,
} from '../src/services/api/policies';

test('auth token policy trims persisted values and clears blank tokens', () => {
  assert.equal(normalizeAuthToken('  bearer-token  '), 'bearer-token');
  assert.equal(normalizeAuthToken('   '), null);
  assert.equal(normalizeAuthToken(null), null);
  assert.equal(normalizeAuthToken(undefined), null);
});

test('demo policy requires both a development build and explicit opt-in', () => {
  assert.equal(isDemoOptInEnabled(true, 'true'), true);
  assert.equal(isDemoOptInEnabled(false, 'true'), false);
  assert.equal(isDemoOptInEnabled(undefined, 'true'), false);
  assert.equal(isDemoOptInEnabled(true, 'false'), false);
  assert.equal(isDemoOptInEnabled(true, undefined), false);
});

test('only authentication rejection statuses invalidate the session', () => {
  assert.equal(isUnauthorizedStatus(401), true);
  assert.equal(isUnauthorizedStatus(403), true);
  assert.equal(isUnauthorizedStatus(400), false);
  assert.equal(isUnauthorizedStatus(500), false);
});
