export const STORAGE_KEY = 'reactlab_workspace_v1';
export function loadWorkspace(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.practicals)) throw new Error('Your saved workspace could not be read. It has not been overwritten.');
  for (const p of data.practicals) {
    if (typeof p.id !== 'string' || typeof p.title !== 'string' || typeof p.question !== 'string' || !p.files || !p.files['/src/App.jsx'] || Object.entries(p.files).some(([path, file]) => !path.startsWith('/src/') || typeof file?.code !== 'string') || !Array.isArray(p.openFiles) || !Array.isArray(p.folders)) throw new Error('Your saved workspace has invalid data. It has not been overwritten.');
  }
  return data;
}
export function saveWorkspace(data, storage = localStorage) { storage.setItem(STORAGE_KEY, JSON.stringify({ ...data, version: 1 })); }
