import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupPayload, validateBackup, mergePracticals, BACKUP_FORMAT, BACKUP_VERSION } from '../src/utils/backup.js';
import { createPractical } from '../src/utils/practicals.js';
import { computePracticalHash } from '../src/utils/syncHash.js';

test('1. Export with zero practicals produces valid payload', () => {
  const payload = createBackupPayload([]);
  assert.equal(payload.format, BACKUP_FORMAT);
  assert.equal(payload.version, BACKUP_VERSION);
  assert.deepEqual(payload.practicals, []);
  assert(payload.exportedAt);
});

test('2. Export with multiple practicals captures all records', () => {
  const p1 = createPractical('Counter', 'Count clicks', 'Counter');
  const p2 = createPractical('Timer', 'Track seconds', 'Timer');
  const payload = createBackupPayload([p1, p2]);
  assert.equal(payload.practicals.length, 2);
  assert.equal(payload.practicals[0].title, 'Counter');
  assert.equal(payload.practicals[1].title, 'Timer');
});

test('3. Nested folders and complex virtual filesystems survive export and validation', () => {
  const p = createPractical('Shopping Cart', 'Cart UI', 'Cart');
  p.folders.push('/src/components', '/src/components/items', '/src/styles');
  p.files['/src/components/items/CartItem.jsx'] = { type: 'file', code: 'export default () => <div>Item</div>;' };
  p.files['/src/styles/theme.json'] = { type: 'file', code: '{"dark": true}' };

  const payload = createBackupPayload([p]);
  const jsonStr = JSON.stringify(payload);
  const validated = validateBackup(jsonStr);

  assert.equal(validated.valid, true);
  const restored = validated.data.practicals[0];
  assert.equal(restored.files['/src/components/items/CartItem.jsx'].code, 'export default () => <div>Item</div>;');
  assert.equal(restored.files['/src/styles/theme.json'].code, '{"dark": true}');
  assert(restored.folders.includes('/src/components/items'));
});

test('4. CSS, JS, JSX, and JSON contents remain bit-for-bit identical after roundtrip', () => {
  const p = createPractical('Editor Test', 'Content fidelity test');
  p.files['/src/styles.css'] = { type: 'file', code: '.btn { background: #333; }\n/* special chars & emojis: ⚛ 🚀 */' };
  p.files['/src/utils.js'] = { type: 'file', code: 'export const add = (a, b) => a + b;\n' };
  p.files['/src/data.json'] = { type: 'file', code: '{\n  "count": 42,\n  "nested": { "ok": true }\n}' };

  const payload = createBackupPayload([p]);
  const validated = validateBackup(JSON.stringify(payload));
  assert.equal(validated.valid, true);

  const restored = validated.data.practicals[0];
  assert.equal(restored.files['/src/styles.css'].code, p.files['/src/styles.css'].code);
  assert.equal(restored.files['/src/utils.js'].code, p.files['/src/utils.js'].code);
  assert.equal(restored.files['/src/data.json'].code, p.files['/src/data.json'].code);
});

test('5. Practical IDs survive normal restore without collision', () => {
  const p1 = createPractical('P1', 'Q1');
  const p2 = createPractical('P2', 'Q2');
  const originalIds = [p1.id, p2.id];

  const payload = createBackupPayload([p1, p2]);
  const validated = validateBackup(JSON.stringify(payload));
  assert.equal(validated.valid, true);

  const { merged } = mergePracticals([], validated.data.practicals, computePracticalHash);
  assert.equal(merged[0].id, originalIds[0]);
  assert.equal(merged[1].id, originalIds[1]);
});

test('6. Merge handles ID collisions safely without silent data loss', () => {
  const existing = createPractical('Original Counter', 'Original Question', 'Counter');
  const importedDifferentContent = {
    ...structuredClone(existing),
    title: 'Different Counter',
    files: {
      ...existing.files,
      '/src/Counter.jsx': { type: 'file', code: '// Modified code' }
    }
  };

  const { merged, importedCount } = mergePracticals([existing], [importedDifferentContent], computePracticalHash);
  assert.equal(merged.length, 2);
  assert.equal(importedCount, 1);
  assert.equal(merged[0].id, existing.id);
  assert.equal(merged[0].title, 'Original Counter');
  assert.notEqual(merged[1].id, existing.id); // fresh ID generated
  assert.equal(merged[1].files['/src/Counter.jsx'].code, '// Modified code');
});

test('7. Merge skips exact duplicate practicals with identical content', () => {
  const existing = createPractical('Exact Match', 'Same Question', 'Counter');
  const exactDuplicate = structuredClone(existing);

  const { merged, importedCount } = mergePracticals([existing], [exactDuplicate], computePracticalHash);
  assert.equal(merged.length, 1);
  assert.equal(importedCount, 0);
});

test('8. Invalid JSON is safely rejected with clear error message', () => {
  const res = validateBackup('this is not json { [');
  assert.equal(res.valid, false);
  assert.match(res.error, /valid ReactLab backup/);
});

test('9. Wrong backup format is rejected', () => {
  const res = validateBackup(JSON.stringify({ format: 'random-export', version: 1, practicals: [] }));
  assert.equal(res.valid, false);
  assert.match(res.error, /valid ReactLab backup/);
});

test('10. Unsupported backup version is rejected', () => {
  const res = validateBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 999, practicals: [] }));
  assert.equal(res.valid, false);
  assert.match(res.error, /Unsupported backup version/);
});

test('11. Tokens, credentials, and secrets never leak in exported backup', () => {
  const p = createPractical('Secrets Test', 'Test');
  const practicalsWithMockSecrets = [
    {
      ...p,
      githubToken: 'ghp_secret123',
      oauthSecret: 'shhh',
      client_secret: 'topsecret'
    }
  ];

  const payload = createBackupPayload(practicalsWithMockSecrets);
  const jsonStr = JSON.stringify(payload);

  assert(!jsonStr.includes('ghp_secret123'));
  assert(!jsonStr.includes('shhh'));
  assert(!jsonStr.includes('topsecret'));
  assert(!jsonStr.includes('githubToken'));
});

test('12. Corrupted file paths and path traversal attempts are rejected', () => {
  const malicious = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    practicals: [
      {
        id: 'bad-practical',
        title: 'Bad',
        question: 'Q',
        files: {
          '/src/App.jsx': { type: 'file', code: 'export default () => null;' },
          '/src/../../etc/passwd': { type: 'file', code: 'malicious' }
        },
        folders: ['/src']
      }
    ]
  };

  const res = validateBackup(malicious);
  assert.equal(res.valid, false);
  assert.match(res.error, /invalid file path/);
});
