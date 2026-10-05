const API = 'https://api.github.com';
export function githubClient(token, fetcher = fetch) {
  return async (path, method = 'GET', body) => {
    const response = await fetcher(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(response.status === 401 ? 'Your GitHub token has expired or is invalid. Reconnect to continue.' : response.status === 403 ? 'GitHub denied access. Check token permissions or rate limits, then retry.' : `GitHub: ${result.message || `request failed (${response.status})`}`); error.status = response.status; throw error; }
    return result;
  };
}
export async function connectRepository(token, name, saved, fetcher) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) throw new Error('Use letters, numbers, dots, or hyphens for the repository name.');
  const api = githubClient(token, fetcher); const user = await api('/user');
  let repo;
  try { repo = await api(`/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(name)}`); }
  catch (error) { if (error.status !== 404) throw error; }
  if (repo && repo.id !== saved?.repoId) throw new Error('That repository already exists. Choose a new name so ReactLab does not change an unrelated repository.');
  if (!repo) repo = await api('/user/repos', 'POST', { name, private: true, auto_init: true, description: 'My ReactLab practicals — questions, source files, and practice history.', has_issues: false, has_projects: false, has_wiki: false });
  if (repo.owner.login !== user.login || !repo.permissions?.push && repo.permissions) throw new Error('Connect a repository you own and can write to.');
  return { owner: user.login, name: repo.name, repoId: repo.id, branch: repo.default_branch, url: `https://github.com/${user.login}/${repo.name}`, author: { name: user.name || user.login, email: `${user.id}+${user.login}@users.noreply.github.com` } };
}
export function practicalEntries(practical) {
  if (!/^[a-zA-Z0-9_-]+$/.test(practical.id)) throw new Error('This practical has an invalid identifier.');
  const result = Object.entries(practical.files).sort(([a], [b]) => a.localeCompare(b)).map(([path, file]) => {
    if (!path.startsWith('/src/') || path.split('/').some(part => part === '..' || part === '.') || path.includes('\\')) throw new Error('Invalid practical file path.');
    return { path: path.slice(1), mode: '100644', type: 'blob', content: file.code };
  });
  result.push({ path: 'README.md', mode: '100644', type: 'blob', content: `# ${practical.title}\n\n${practical.question || 'React practical'}\n\nCreated with ReactLab. Entry component: src/App.jsx.\n` });
  for (const folder of practical.folders || []) {
    if (!folder.startsWith('/src') || folder.split('/').includes('..') || folder.includes('\\')) throw new Error('Invalid folder path.');
    if (!Object.keys(practical.files).some(path => path.startsWith(folder + '/'))) result.push({ path: `${folder.slice(1)}/.gitkeep`, mode: '100644', type: 'blob', content: '' });
  }
  return result;
}
export async function syncPractical(token, connection, practical, fetcher) {
  const api = githubClient(token, fetcher); const base = `/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.name)}`;
  // Git trees give us one atomic commit per practical, including renames and deletions.
  const subtree = await api(`${base}/git/trees`, 'POST', { tree: practicalEntries(practical) });
  for (let attempt = 0; attempt < 3; attempt++) {
    const repo = await api(base); if (repo.id !== connection.repoId) throw new Error('The connected repository changed. Reconnect before syncing.');
    const branch = repo.default_branch; const refPath = `${base}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
    const ref = await api(refPath); const head = await api(`${base}/git/commits/${ref.object.sha}`);
    const next = await api(`${base}/git/trees`, 'POST', { base_tree: head.tree.sha, tree: [{ path: `practicals/${practical.id}`, mode: '040000', type: 'tree', sha: subtree.sha }] });
    if (next.sha === head.tree.sha) return { unchanged: true };
    const commit = await api(`${base}/git/commits`, 'POST', { message: `Practice: ${practical.title}`, tree: next.sha, parents: [ref.object.sha], author: connection.author });
    try { await api(`${base}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, 'PATCH', { sha: commit.sha, force: false }); return { sha: commit.sha, url: `${connection.url}/commit/${commit.sha}` }; }
    catch (error) { if (![409, 422].includes(error.status) || attempt === 2) throw error; }
  }
}
