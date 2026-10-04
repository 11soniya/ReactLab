export const basename = path => path.split('/').pop();
export const dirname = path => path.slice(0, path.lastIndexOf('/')) || '/src';
export const within = (path, root) => path === root || path.startsWith(root + '/');
export function validatePath(path) {
  if (!path.startsWith('/src/') || path.split('/').some(p => p === '.' || p === '..') || /[\\<>:"|?*\x00-\x1f]/.test(path) || path.endsWith('/') || path.includes('//')) throw new Error('Use a valid path inside src, such as components/Card.jsx.');
}
export function allFolders(practical) {
  const folders = new Set(['/src', ...(practical.folders || [])]);
  [...Object.keys(practical.files), ...(practical.folders || [])].forEach(path => { let dir = dirname(path); while (dir.startsWith('/src')) { folders.add(dir); if (dir === '/src') break; dir = dirname(dir); } });
  return [...folders].sort();
}
export function addEntry(practical, path, folder = false) {
  validatePath(path);
  const folders = allFolders(practical);
  if (practical.files[path] || folders.includes(path)) throw new Error('A file or folder already exists at this path.');
  if (Object.keys(practical.files).some(file => path.startsWith(file + '/'))) throw new Error('A file cannot contain another file or folder.');
  return { ...practical, files: folder ? practical.files : { ...practical.files, [path]: { type: 'file', code: path.endsWith('.json') ? '{}\n' : '' } }, folders: allFolders({ ...practical, folders: [...folders, ...(folder ? [path] : [dirname(path)])] }) };
}
export function renameEntry(practical, from, to) {
  if (from === '/src' || from === '/src/App.jsx') throw new Error('The src folder and App.jsx entry file are required.');
  validatePath(to);
  if (from === to) return practical;
  const folders = allFolders(practical);
  if (practical.files[to] || folders.includes(to) || within(to, from)) throw new Error('Choose an unused name outside the folder being moved.');
  if (Object.keys(practical.files).some(p => to.startsWith(p + '/'))) throw new Error('The destination parent must be a folder.');
  const remap = path => within(path, from) ? to + path.slice(from.length) : path;
  const files = Object.fromEntries(Object.entries(practical.files).map(([path, value]) => [remap(path), { ...value }]));
  return { ...practical, files, folders: allFolders({ files, folders: folders.map(remap) }), activeFile: remap(practical.activeFile || '/src/App.jsx'), openFiles: (practical.openFiles || []).map(remap), selectedFolder: remap(practical.selectedFolder || '/src') };
}
export function deleteEntry(practical, path) {
  if (path === '/src' || path === '/src/App.jsx') throw new Error('The src folder and App.jsx entry file are required.');
  const files = Object.fromEntries(Object.entries(practical.files).filter(([p]) => !within(p, path)));
  return { ...practical, files, folders: allFolders(practical).filter(p => !within(p, path)), openFiles: practical.openFiles.filter(p => files[p]), activeFile: files[practical.activeFile] ? practical.activeFile : '/src/App.jsx', selectedFolder: within(practical.selectedFolder || '/src', path) ? '/src' : practical.selectedFolder };
}
export function duplicateFile(practical, path) {
  const dot = path.lastIndexOf('.'); const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path; const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  let next = `${stem}-copy${ext}`; let n = 2;
  while (practical.files[next] || allFolders(practical).includes(next)) next = `${stem}-copy-${n++}${ext}`;
  return { ...practical, files: { ...practical.files, [next]: { ...practical.files[path] } }, activeFile: next, openFiles: [...practical.openFiles, next] };
}
