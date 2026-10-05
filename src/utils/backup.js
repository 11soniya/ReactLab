export const BACKUP_FORMAT = 'reactlab-backup';
export const BACKUP_VERSION = 1;

/**
 * Creates a clean, credential-free JSON backup payload.
 */
export function createBackupPayload(practicals = []) {
  const safePracticals = practicals.map(p => ({
    id: p.id,
    title: p.title || '',
    question: p.question || '',
    files: structuredClone(p.files || {}),
    folders: Array.isArray(p.folders) ? [...p.folders] : ['/src'],
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString()
  }));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    practicals: safePracticals
  };
}

/**
 * Validates an imported backup JSON string or object.
 * Returns { valid: boolean, data?: object, error?: string }
 */
export function validateBackup(input) {
  let parsed;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      return { valid: false, error: "That doesn't appear to be a valid ReactLab backup." };
    }
  } else if (typeof input === 'object' && input !== null) {
    parsed = input;
  } else {
    return { valid: false, error: "That doesn't appear to be a valid ReactLab backup." };
  }

  if (parsed.format !== BACKUP_FORMAT) {
    return { valid: false, error: "That doesn't appear to be a valid ReactLab backup." };
  }

  if (parsed.version !== BACKUP_VERSION) {
    return { valid: false, error: `Unsupported backup version (${parsed.version}). Expected version ${BACKUP_VERSION}.` };
  }

  if (!Array.isArray(parsed.practicals)) {
    return { valid: false, error: "That doesn't appear to be a valid ReactLab backup." };
  }

  // Validate each practical
  for (const p of parsed.practicals) {
    if (!p || typeof p !== 'object') {
      return { valid: false, error: 'Backup contains corrupted practical records.' };
    }
    if (typeof p.id !== 'string' || !p.id.trim()) {
      return { valid: false, error: 'Backup contains a practical with an invalid identifier.' };
    }
    if (typeof p.title !== 'string' || !p.title.trim()) {
      return { valid: false, error: 'Backup contains a practical without a title.' };
    }
    if (typeof p.question !== 'string') {
      p.question = '';
    }
    if (!p.files || typeof p.files !== 'object' || !p.files['/src/App.jsx']) {
      return { valid: false, error: `Practical "${p.title}" is missing /src/App.jsx.` };
    }

    // Validate filesystem structure
    for (const [filePath, file] of Object.entries(p.files)) {
      if (
        !filePath.startsWith('/src/') ||
        filePath.includes('\\') ||
        filePath.split('/').some(part => part === '..' || part === '.') ||
        !file ||
        typeof file.code !== 'string'
      ) {
        return { valid: false, error: `Practical "${p.title}" contains an invalid file path: ${filePath}` };
      }
    }

    // Validate folders
    if (!Array.isArray(p.folders)) {
      p.folders = ['/src'];
    }
    for (const folder of p.folders) {
      if (
        (folder !== '/src' && !folder.startsWith('/src/')) ||
        folder.includes('\\') ||
        folder.split('/').some(part => part === '..' || part === '.')
      ) {
        return { valid: false, error: `Practical "${p.title}" contains an invalid folder path: ${folder}` };
      }
    }
  }

  return { valid: true, data: parsed };
}

/**
 * Merges imported practicals with existing practicals.
 * Generates fresh IDs for collisions where content differs.
 */
export function mergePracticals(existingPracticals = [], importedPracticals = [], computeHashFn) {
  const existingMap = new Map(existingPracticals.map(p => [p.id, p]));
  const existingTitles = new Set(existingPracticals.map(p => p.title.toLowerCase().trim()));
  const merged = [...existingPracticals];
  let importedCount = 0;

  for (const item of importedPracticals) {
    const existing = existingMap.get(item.id);
    let practicalToImport = structuredClone(item);

    // Ensure proper tab and active file fields
    if (!Array.isArray(practicalToImport.openFiles) || practicalToImport.openFiles.length === 0) {
      practicalToImport.openFiles = Object.keys(practicalToImport.files);
    }
    if (!practicalToImport.activeFile || !practicalToImport.files[practicalToImport.activeFile]) {
      practicalToImport.activeFile = '/src/App.jsx';
    }
    if (!practicalToImport.selectedFolder) {
      practicalToImport.selectedFolder = '/src';
    }

    if (existing) {
      // ID collision: check if contents are identical
      const existingHash = computeHashFn ? computeHashFn(existing) : JSON.stringify(existing.files);
      const importedHash = computeHashFn ? computeHashFn(practicalToImport) : JSON.stringify(practicalToImport.files);

      if (existingHash === importedHash) {
        // Exactly identical, skip duplicate
        continue;
      }

      // ID collision with different content: generate a fresh ID and unique title
      practicalToImport.id = crypto.randomUUID();
      if (existingTitles.has(practicalToImport.title.toLowerCase().trim())) {
        practicalToImport.title = `${practicalToImport.title} (Imported)`;
      }
    }

    merged.push(practicalToImport);
    existingMap.set(practicalToImport.id, practicalToImport);
    existingTitles.add(practicalToImport.title.toLowerCase().trim());
    importedCount++;
  }

  return { merged, importedCount };
}

/**
 * Triggers a browser download of the backup JSON file.
 */
export function downloadBackupFile(practicals = []) {
  const payload = createBackupPayload(practicals);
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reactlab-backup-${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
