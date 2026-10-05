/**
 * Computes a deterministic content fingerprint (hash) of a practical.
 *
 * Only includes data relevant to GitHub commits:
 * - Title
 * - Question
 * - Virtual filesystem paths and contents
 * - Folder structure
 *
 * Excludes transient UI state:
 * - Active tab / open files
 * - Cursor position
 * - Layout / preview widths
 * - Timestamps / runIds
 */
export function computePracticalHash(practical) {
  if (!practical || typeof practical !== 'object') return '';

  const canonical = {
    title: (practical.title || '').trim(),
    question: (practical.question || '').trim(),
    folders: Array.isArray(practical.folders) ? [...practical.folders].sort() : ['/src'],
    files: Object.keys(practical.files || {})
      .sort()
      .map(path => [path, practical.files[path]?.code ?? ''])
  };

  const str = JSON.stringify(canonical);

  // 64-bit deterministic hash (cyrb53)
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  return `${hex}-${str.length}`;
}

/**
 * Returns the contextual GitHub sync status for a practical:
 *
 * @returns {{
 *   state: 'NOT_UPLOADED' | 'MODIFIED' | 'UP_TO_DATE' | 'UPLOADING' | 'ERROR',
 *   buttonText: string,
 *   statusText: string,
 *   icon: 'add' | 'update' | 'check' | 'uploading' | 'error',
 *   canPush: boolean
 * }}
 */
export function getPracticalSyncStatus(practical, githubSyncMap = {}, isSyncing = false, lastError = null) {
  if (!practical) {
    return {
      state: 'NOT_UPLOADED',
      buttonText: 'Add to GitHub',
      statusText: 'Not on GitHub',
      icon: 'add',
      canPush: false
    };
  }

  if (isSyncing) {
    return {
      state: 'UPLOADING',
      buttonText: 'Updating GitHub…',
      statusText: 'Updating GitHub…',
      icon: 'uploading',
      canPush: false
    };
  }

  if (lastError && lastError.practicalId === practical.id) {
    return {
      state: 'ERROR',
      buttonText: 'Update failed — Retry',
      statusText: 'Update failed',
      icon: 'error',
      canPush: true
    };
  }

  const syncRecord = githubSyncMap[practical.id];
  const currentHash = computePracticalHash(practical);

  if (!syncRecord || !syncRecord.hash) {
    return {
      state: 'NOT_UPLOADED',
      buttonText: 'Add to GitHub',
      statusText: 'Not on GitHub',
      icon: 'add',
      canPush: true
    };
  }

  if (syncRecord.hash !== currentHash) {
    return {
      state: 'MODIFIED',
      buttonText: 'Update on GitHub',
      statusText: 'Changes not on GitHub',
      icon: 'update',
      canPush: true
    };
  }

  return {
    state: 'UP_TO_DATE',
    buttonText: 'Up to date',
    statusText: 'Up to date',
    icon: 'check',
    canPush: false
  };
}
