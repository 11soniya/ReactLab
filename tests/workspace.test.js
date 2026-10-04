import test from 'node:test';
import assert from 'node:assert/strict';
import { createPractical, duplicatePractical } from '../src/utils/practicals.js';
import { addEntry, allFolders, renameEntry, deleteEntry, duplicateFile } from '../src/utils/filesystem.js';
import { createSandpackFiles } from '../src/utils/sandpack.js';
import { loadWorkspace, saveWorkspace, STORAGE_KEY } from '../src/utils/storage.js';
test('independent practicals and deep duplication preserve original code', () => {
  const first = createPractical('Counter', 'Use state', 'Counter');
  const second = createPractical('Dashboard', 'Use components');
  const copy = duplicatePractical(first);
  copy.files['/src/App.jsx'].code = 'changed'; copy.folders.push('/src/components');
  assert.notEqual(copy.id, first.id); assert.notEqual(first.files['/src/App.jsx'].code, 'changed');
  assert.equal(first.folders.length, 1); assert.notEqual(second.files, first.files);
});
test('nested empty folders, files, recursive rename and deletion', () => {
  let p = createPractical('Dashboard', '');
  p = addEntry(p, '/src/components/cards/empty', true);
  assert(allFolders(p).includes('/src/components/cards'));
  p = addEntry(p, '/src/components/cards/Card.jsx');
  p.files['/src/components/cards/Card.jsx'].code = 'export default () => <h1>Hello</h1>';
  p.activeFile = '/src/components/cards/Card.jsx'; p.openFiles.push(p.activeFile);
  p = renameEntry(p, '/src/components', '/src/ui');
  assert(p.files['/src/ui/cards/Card.jsx']); assert.equal(p.activeFile, '/src/ui/cards/Card.jsx');
  assert(allFolders(p).includes('/src/ui/cards/empty'));
  const next = deleteEntry(p, '/src/ui');
  assert.deepEqual(Object.keys(next.files), ['/src/App.jsx']); assert.equal(next.activeFile, '/src/App.jsx');
  assert(p.files['/src/ui/cards/Card.jsx']);
});
test('path collisions, traversal and entry removal are rejected', () => {
  let p = createPractical('Counter', '', 'Counter');
  for (const path of ['/src/../escape.js', '/outside.js', '/src//oops.js', '/src/App.jsx', '/src/Counter.jsx/nested.js']) assert.throws(() => addEntry(p, path));
  assert.throws(() => deleteEntry(p, '/src/App.jsx'));
  assert.throws(() => renameEntry(p, '/src/Counter.jsx', '/src/App.jsx'));
  assert.throws(() => createPractical('Bad', '', 'App'));
});
test('duplicate files receive unique paths without changing source', () => {
  let p = createPractical('Counter', '', 'Counter');
  p = duplicateFile(p, '/src/Counter.jsx'); p = duplicateFile(p, '/src/Counter.jsx');
  assert(p.files['/src/Counter-copy.jsx']); assert(p.files['/src/Counter-copy-2.jsx']);
});
test('complete filesystem and selected context survive storage roundtrip', () => {
  const map = new Map(); const storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  let p = createPractical('Dashboard', 'Original question');
  p = addEntry(p, '/src/components/Navbar.jsx'); p = addEntry(p, '/src/styles/main.css'); p = addEntry(p, '/src/data/empty', true);
  p.activeFile = '/src/components/Navbar.jsx';
  const data = { version: 1, practicals: [createPractical('Counter', '', 'Counter'), p], activeId: p.id, layout: { previewWidth: 40 } };
  saveWorkspace(data, storage); assert.deepEqual(loadWorkspace(storage), data);
  storage.setItem(STORAGE_KEY, 'broken'); assert.throws(() => loadWorkspace(storage)); assert.equal(storage.getItem(STORAGE_KEY), 'broken');
});
test('Sandpack gets every file plus a managed entry that imports student App', () => {
  let p = createPractical('Dashboard', '');
  for (const path of ['/src/components/Navbar.jsx', '/src/data/products.js', '/src/styles/main.css', '/src/data/config.json']) p = addEntry(p, path);
  const files = createSandpackFiles(p);
  for (const path of Object.keys(p.files)) assert.equal(files[path].code, p.files[path].code);
  assert.match(files['/index.js'].code, /\.\/src\/App\.jsx/); assert(!p.files['/index.js']);
});
