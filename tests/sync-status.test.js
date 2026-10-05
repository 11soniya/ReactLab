import test from 'node:test';
import assert from 'node:assert/strict';
import { computePracticalHash, getPracticalSyncStatus } from '../src/utils/syncHash.js';
import { createPractical } from '../src/utils/practicals.js';

test('1. New practical has NOT_UPLOADED status ("Add to GitHub")', () => {
  const p = createPractical('Counter with useState', 'Use state', 'Counter');
  const status = getPracticalSyncStatus(p, {});
  assert.equal(status.state, 'NOT_UPLOADED');
  assert.equal(status.buttonText, 'Add to GitHub');
  assert.equal(status.statusText, 'Not on GitHub');
  assert.equal(status.canPush, true);
});

test('2. Successful upload transitions practical to UP_TO_DATE ("Up to date")', () => {
  const p = createPractical('Counter with useState', 'Use state', 'Counter');
  const hash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'UP_TO_DATE');
  assert.equal(status.buttonText, 'Up to date');
  assert.equal(status.statusText, 'Up to date');
  assert.equal(status.canPush, false); // No redundant commit needed
});

test('3. Modifying component file transitions state to MODIFIED ("Update on GitHub")', () => {
  const p = createPractical('Counter with useState', 'Use state', 'Counter');
  const initialHash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash: initialHash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  // Modify Counter.jsx
  p.files['/src/Counter.jsx'].code += '\n// New button added';
  const modifiedHash = computePracticalHash(p);
  assert.notEqual(initialHash, modifiedHash);

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'MODIFIED');
  assert.equal(status.buttonText, 'Update on GitHub');
  assert.equal(status.statusText, 'Changes not on GitHub');
  assert.equal(status.canPush, true);
});

test('4. Modifying question transitions state to MODIFIED ("Changes not on GitHub")', () => {
  const p = createPractical('Counter with useState', 'Initial question', 'Counter');
  const initialHash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash: initialHash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  p.question = 'Updated question with more details.';
  assert.notEqual(initialHash, computePracticalHash(p));

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'MODIFIED');
  assert.equal(status.statusText, 'Changes not on GitHub');
});

test('5. Modifying title transitions state to MODIFIED', () => {
  const p = createPractical('Old Title', 'Question', 'Counter');
  const initialHash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash: initialHash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  p.title = 'New Title';
  assert.notEqual(initialHash, computePracticalHash(p));

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'MODIFIED');
});

test('6. Adding a new file transitions state to MODIFIED', () => {
  const p = createPractical('App', 'Question', 'Counter');
  const initialHash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash: initialHash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  p.files['/src/helper.js'] = { type: 'file', code: 'export const help = true;' };
  assert.notEqual(initialHash, computePracticalHash(p));

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'MODIFIED');
});

test('7. Deleting a file transitions state to MODIFIED', () => {
  const p = createPractical('App', 'Question', 'Counter');
  p.files['/src/temp.js'] = { type: 'file', code: 'temp' };
  const initialHash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash: initialHash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  delete p.files['/src/temp.js'];
  assert.notEqual(initialHash, computePracticalHash(p));

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'MODIFIED');
});

test('8. Non-content UI changes (tabs, activeFile, cursor) preserve UP_TO_DATE status', () => {
  const p = createPractical('Counter with useState', 'Question', 'Counter');
  const initialHash = computePracticalHash(p);
  const syncMap = {
    [p.id]: { hash: initialHash, sha: 'commit-sha-1', syncedAt: Date.now() }
  };

  // Switch active tab and reorder openFiles
  p.activeFile = '/src/Counter.jsx';
  p.openFiles = ['/src/Counter.jsx', '/src/App.jsx'];
  p.selectedFolder = '/src';

  assert.equal(initialHash, computePracticalHash(p));

  const status = getPracticalSyncStatus(p, syncMap);
  assert.equal(status.state, 'UP_TO_DATE');
  assert.equal(status.statusText, 'Up to date');
});

test('9. Uploading state disables push and displays loading status', () => {
  const p = createPractical('Counter', 'Question', 'Counter');
  const status = getPracticalSyncStatus(p, {}, true); // isSyncing = true
  assert.equal(status.state, 'UPLOADING');
  assert.equal(status.buttonText, 'Updating GitHub…');
  assert.equal(status.canPush, false);
});

test('10. Error state allows retry while preserving local work', () => {
  const p = createPractical('Counter', 'Question', 'Counter');
  const lastError = { practicalId: p.id, message: 'Network error' };
  const status = getPracticalSyncStatus(p, {}, false, lastError);
  assert.equal(status.state, 'ERROR');
  assert.equal(status.buttonText, 'Update failed — Retry');
  assert.equal(status.statusText, 'Update failed');
  assert.equal(status.canPush, true);
});
