import test from 'node:test';
import assert from 'node:assert/strict';
import { practicalEntries, syncPractical, connectRepository } from '../src/utils/github.js';
import { createPractical } from '../src/utils/practicals.js';
const connection = { owner: 'student', name: 'reactlab-practicals', repoId: 7, url: 'https://github.com/student/reactlab-practicals', author: { name: 'Student', email: '1+student@users.noreply.github.com' } };
function mockApi(replies) { const calls = []; const fetcher = async (url, options) => { calls.push({ path: url.replace('https://api.github.com', ''), method: options.method, body: options.body && JSON.parse(options.body), headers: options.headers }); const reply = replies.shift(); assert(reply, `Unexpected request ${url}`); return { ok: !reply.status || reply.status < 400, status: reply.status || 200, json: async () => reply.data || reply }; }; return { fetcher, calls }; }
test('connect creates a private initialized repository with the authenticated author', async () => {
  const mock = mockApi([{ login: 'student', id: 1 }, { status: 404, data: {} }, { id: 7, name: 'reactlab-practicals', owner: { login: 'student' }, default_branch: 'main' }]);
  const result = await connectRepository('test-token', 'reactlab-practicals', null, mock.fetcher);
  assert.equal(result.repoId, 7); assert.equal(result.author.email, '1+student@users.noreply.github.com');
  assert.equal(mock.calls[2].body.private, true); assert.equal(mock.calls[2].body.auto_init, true); assert(!JSON.stringify(result).includes('test-token'));
});
test('an unrelated existing repository cannot be adopted', async () => {
  const mock = mockApi([{ login: 'student', id: 1 }, { id: 999 }]);
  await assert.rejects(connectRepository('token', 'existing', null, mock.fetcher), /already exists/); assert.equal(mock.calls.length, 2);
});
test('sync creates one atomic non-forced commit on the current default branch', async () => {
  const p = createPractical('Counter', 'Use state', 'Counter');
  const mock = mockApi([{ sha: 'subtree' }, { id: 7, default_branch: 'main' }, { object: { sha: 'head' } }, { tree: { sha: 'old-tree' } }, { sha: 'new-tree' }, { sha: 'commit' }, {}]);
  const result = await syncPractical('token', connection, p, mock.fetcher);
  assert.equal(result.sha, 'commit'); assert.equal(mock.calls[4].body.base_tree, 'old-tree');
  assert.equal(mock.calls[4].body.tree[0].path, `practicals/${p.id}`); assert.equal(mock.calls[5].body.author.email, connection.author.email);
  assert.deepEqual(mock.calls[6].body, { sha: 'commit', force: false });
});
test('unchanged runs create no commit or reference update', async () => {
  const mock = mockApi([{ sha: 'subtree' }, { id: 7, default_branch: 'main' }, { object: { sha: 'head' } }, { tree: { sha: 'same-tree' } }, { sha: 'same-tree' }]);
  const result = await syncPractical('token', connection, createPractical('Counter', ''), mock.fetcher);
  assert.equal(result.unchanged, true); assert.equal(mock.calls.length, 5);
});
test('concurrent branch changes retry without force-pushing', async () => {
  const mock = mockApi([{ sha: 'subtree' }, { id: 7, default_branch: 'main' }, { object: { sha: 'old' } }, { tree: { sha: 'old-tree' } }, { sha: 'new-tree' }, { sha: 'orphan' }, { status: 422, data: { message: 'Not fast forward' } }, { id: 7, default_branch: 'main' }, { object: { sha: 'latest' } }, { tree: { sha: 'latest-tree' } }, { sha: 'merged-tree' }, { sha: 'merged-commit' }, {}]);
  const result = await syncPractical('token', connection, createPractical('Counter', ''), mock.fetcher);
  assert.equal(result.sha, 'merged-commit'); assert.deepEqual(mock.calls[11].body.parents, ['latest']);
  assert(mock.calls.filter(c => c.method === 'PATCH').every(c => c.body.force === false));
});
test('export preserves question, empty folders, and Unicode source without timestamps', () => {
  const p = createPractical('नमस्ते', 'Use props', 'Greeting'); p.folders.push('/src/empty');
  p.files['/src/Greeting.jsx'].code = 'export default () => <h1>नमस्ते</h1>';
  const entries = practicalEntries(p); assert(entries.some(e => e.path === 'src/empty/.gitkeep'));
  assert(entries.find(e => e.path === 'README.md').content.includes('Use props'));
  assert.equal(entries.find(e => e.path === 'src/Greeting.jsx').content, p.files['/src/Greeting.jsx'].code);
  p.updatedAt = 'changed'; assert.deepEqual(practicalEntries(p), entries);
});
test('authentication errors remain actionable', async () => {
  const mock = mockApi([{ status: 401, data: {} }]);
  await assert.rejects(connectRepository('token', 'reactlab-practicals', null, mock.fetcher), /expired or is invalid/);
});
