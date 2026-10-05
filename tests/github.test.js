import test from 'node:test';
import assert from 'node:assert/strict';
import {
  practicalEntries,
  syncPractical,
  connectRepository,
  listUserRepositories,
  generateQuestionMd,
  practicalSlug
} from '../server/github.js';
import { createPractical } from '../src/utils/practicals.js';

const dedicatedConnection = {
  owner: 'student',
  name: 'reactlab-practicals',
  repoId: 7,
  branch: 'main',
  url: 'https://github.com/student/reactlab-practicals',
  isDedicated: true,
  rootDir: '',
  author: { name: 'Student', email: '1+student@users.noreply.github.com' }
};

const existingConnection = {
  owner: 'student',
  name: 'college-assignments',
  repoId: 99,
  branch: 'main',
  url: 'https://github.com/student/college-assignments',
  isDedicated: false,
  rootDir: 'reactlab',
  author: { name: 'Student', email: '1+student@users.noreply.github.com' }
};

function mockApi(replies) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({
      path: url.replace('https://api.github.com', ''),
      method: options.method || 'GET',
      body: options.body && JSON.parse(options.body),
      headers: options.headers
    });
    const reply = replies.shift();
    assert(reply, `Unexpected request ${url}`);
    return {
      ok: !reply.status || reply.status < 400,
      status: reply.status || 200,
      json: async () => reply.data !== undefined ? reply.data : reply
    };
  };
  return { fetcher, calls };
}

test('connect creates a private initialized repository with the authenticated author', async () => {
  const mock = mockApi([
    { login: 'student', id: 1 },
    { status: 404, data: {} },
    { id: 7, name: 'reactlab-practicals', owner: { login: 'student' }, default_branch: 'main' }
  ]);
  const result = await connectRepository('test-token', { mode: 'create', name: 'reactlab-practicals', isPrivate: true }, null, mock.fetcher);
  assert.equal(result.repoId, 7);
  assert.equal(result.isDedicated, true);
  assert.equal(result.author.email, '1+student@users.noreply.github.com');
  assert.equal(mock.calls[2].body.private, true);
  assert.equal(mock.calls[2].body.auto_init, true);
});

test('connect can select an existing repository safely into reactlab/ folder', async () => {
  const mock = mockApi([
    { login: 'student', id: 1 },
    { id: 99, name: 'college-assignments', owner: { login: 'student' }, default_branch: 'main', permissions: { push: true } }
  ]);
  const result = await connectRepository('test-token', { mode: 'existing', existingRepo: { owner: 'student', name: 'college-assignments' } }, null, mock.fetcher);
  assert.equal(result.repoId, 99);
  assert.equal(result.isDedicated, false);
  assert.equal(result.rootDir, 'reactlab');
});

test('listUserRepositories filters accessible repos with push permissions', async () => {
  const mock = mockApi([
    [
      { id: 1, name: 'my-repo', full_name: 'student/my-repo', owner: { login: 'student' }, private: true, permissions: { push: true } },
      { id: 2, name: 'read-only', full_name: 'org/read-only', owner: { login: 'org' }, private: false, permissions: { push: false, admin: false } }
    ]
  ]);
  const list = await listUserRepositories('token', mock.fetcher);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'my-repo');
});

test('QUESTION.md generator formats title, question, and signature cleanly', () => {
  const p = createPractical('Product Card', 'Build a reusable product card.');
  const md = generateQuestionMd(p);
  assert.match(md, /^# Product Card/);
  assert.match(md, /## Question\n\nBuild a reusable product card\./);
  assert.match(md, /Generated from ReactLab\./);
});

test('export preserves QUESTION.md, empty folders, and nested virtual filesystem', () => {
  const p = createPractical('Shopping Cart', 'Manage cart items.', 'Cart');
  p.folders.push('/src/components/items');
  p.files['/src/components/items/CartItem.jsx'] = { code: 'export default () => <div>Item</div>;' };

  const entries = practicalEntries(p);
  assert(entries.some(e => e.path === 'QUESTION.md'));
  assert(entries.some(e => e.path === 'src/App.jsx'));
  assert(entries.some(e => e.path === 'src/Cart.jsx'));
  assert(entries.some(e => e.path === 'src/components/items/CartItem.jsx'));
  assert(entries.find(e => e.path === 'QUESTION.md').content.includes('Manage cart items.'));
});

test('sync creates one atomic non-forced commit on dedicated repository', async () => {
  const p = createPractical('Counter with useState', 'Use state', 'Counter');
  const mock = mockApi([
    { sha: 'subtree' },
    { id: 7, default_branch: 'main' },
    { object: { sha: 'head' } },
    { tree: { sha: 'old-tree' } },
    { sha: 'new-tree' },
    { tree: [] }, // existing tree check
    { sha: 'commit' },
    {}
  ]);
  const result = await syncPractical('token', dedicatedConnection, p, mock.fetcher);
  assert.equal(result.sha, 'commit');
  assert.equal(result.message, 'Updated on GitHub');
  assert.equal(mock.calls[4].body.base_tree, 'old-tree');
  assert.equal(mock.calls[4].body.tree[0].path, practicalSlug(p));
  assert.equal(mock.calls[6].body.message, 'Add Counter with useState practical');
  assert.deepEqual(mock.calls[7].body, { sha: 'commit', force: false });
});

test('sync isolates practical in reactlab/ folder for existing repositories', async () => {
  const p = createPractical('Counter with useState', 'Use state', 'Counter');
  const mock = mockApi([
    { sha: 'subtree' },
    { id: 99, default_branch: 'main' },
    { object: { sha: 'head' } },
    { tree: { sha: 'old-tree' } },
    { sha: 'new-tree' },
    { tree: [{ path: 'reactlab' }] }, // existing tree check
    { sha: 'commit' },
    {}
  ]);
  const result = await syncPractical('token', existingConnection, p, mock.fetcher);
  assert.equal(result.sha, 'commit');
  assert.equal(mock.calls[4].body.tree[0].path, `reactlab/${practicalSlug(p)}`);
  assert.equal(mock.calls[6].body.message, 'Update Counter with useState practical');
});

test('unchanged practical creates no commit or reference update', async () => {
  const mock = mockApi([
    { sha: 'subtree' },
    { id: 7, default_branch: 'main' },
    { object: { sha: 'head' } },
    { tree: { sha: 'same-tree' } },
    { sha: 'same-tree' }
  ]);
  const result = await syncPractical('token', dedicatedConnection, createPractical('Counter', ''), mock.fetcher);
  assert.equal(result.unchanged, true);
  assert.equal(result.message, 'GitHub is already up to date');
  assert.equal(mock.calls.length, 5);
});

test('authentication errors remain actionable', async () => {
  const mock = mockApi([{ status: 401, data: {} }]);
  await assert.rejects(
    connectRepository('token', { name: 'reactlab-practicals' }, null, mock.fetcher),
    /expired or is invalid/
  );
});
