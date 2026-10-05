const API = 'https://api.github.com';

export function githubClient(token, fetcher = fetch) {
  return async (path, method = 'GET', body) => {
    const response = await fetcher(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? 'Your GitHub token has expired or is invalid. Reconnect to continue.'
          : response.status === 403
            ? 'GitHub denied access. Check token permissions or rate limits, then retry.'
            : `GitHub: ${result.message || `request failed (${response.status})`}`
      );
      error.status = response.status;
      throw error;
    }
    return result;
  };
}

export function practicalSlug(practical) {
  if (!practical || typeof practical.title !== 'string') return 'practical';
  const base = practical.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `practical-${(practical.id || '').slice(0, 8)}`;
}

export function generateQuestionMd(practical) {
  const questionText = practical.question && practical.question.trim() ? practical.question.trim() : 'No question description provided.';
  return `# ${practical.title.trim()}\n\n## Question\n\n${questionText}\n\nGenerated from ReactLab.\n`;
}

export function practicalEntries(practical) {
  if (!practical || typeof practical.id !== 'string') throw new Error('This practical has an invalid identifier.');
  const result = Object.entries(practical.files || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, file]) => {
      if (!path.startsWith('/src/') || path.split('/').some(part => part === '..' || part === '.') || path.includes('\\')) {
        throw new Error('Invalid practical file path.');
      }
      return { path: path.slice(1), mode: '100644', type: 'blob', content: file.code || '' };
    });

  result.push({
    path: 'QUESTION.md',
    mode: '100644',
    type: 'blob',
    content: generateQuestionMd(practical)
  });

  for (const folder of practical.folders || []) {
    if (!folder.startsWith('/src') || folder.split('/').includes('..') || folder.includes('\\')) {
      throw new Error('Invalid folder path.');
    }
    if (!Object.keys(practical.files || {}).some(path => path.startsWith(folder + '/'))) {
      result.push({ path: `${folder.slice(1)}/.gitkeep`, mode: '100644', type: 'blob', content: '' });
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
}

export async function listUserRepositories(token, fetcher = fetch) {
  const api = githubClient(token, fetcher);
  const repos = await api('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member');
  if (!Array.isArray(repos)) return [];
  return repos
    .filter(r => r && (r.permissions ? (r.permissions.push || r.permissions.admin) : true))
    .map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      owner: r.owner.login,
      isPrivate: !!r.private,
      defaultBranch: r.default_branch || 'main',
      url: r.html_url || `https://github.com/${r.owner.login}/${r.name}`,
      description: r.description || ''
    }));
}

export async function connectRepository(token, options = {}, saved = null, fetcher = fetch) {
  const { mode = 'create', name = 'reactlab-practicals', isPrivate = true, existingRepo = null } = typeof options === 'string' ? { mode: 'create', name: options } : options;
  const api = githubClient(token, fetcher);
  const user = await api('/user');

  if (mode === 'existing' && existingRepo) {
    const owner = existingRepo.owner || user.login;
    const repoName = existingRepo.name;
    const repo = await api(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`);
    if (!repo || (repo.permissions && !repo.permissions.push && !repo.permissions.admin)) {
      throw new Error('You do not have write permissions for this repository.');
    }
    return {
      owner: repo.owner.login,
      name: repo.name,
      repoId: repo.id,
      branch: repo.default_branch || 'main',
      url: repo.html_url || `https://github.com/${repo.owner.login}/${repo.name}`,
      isDedicated: false,
      rootDir: 'reactlab',
      author: {
        name: user.name || user.login,
        email: `${user.id}+${user.login}@users.noreply.github.com`
      },
      githubUsername: user.login,
      githubId: user.id
    };
  }

  // mode === 'create'
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) {
    throw new Error('Use letters, numbers, dots, or hyphens for the repository name.');
  }

  let repo;
  try {
    repo = await api(`/repos/${encodeURIComponent(user.login)}/${encodeURIComponent(name)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
  }

  if (repo && repo.id !== saved?.repoId) {
    throw new Error('That repository already exists. Choose a new name or select "Use an existing repository".');
  }

  if (!repo) {
    repo = await api('/user/repos', 'POST', {
      name,
      private: isPrivate !== false,
      auto_init: true,
      description: 'My ReactLab practicals — questions, source files, and practice history.',
      has_issues: false,
      has_projects: false,
      has_wiki: false
    });
  }

  if (repo.owner.login !== user.login || (repo.permissions && !repo.permissions.push && !repo.permissions.admin)) {
    throw new Error('Connect a repository you own and can write to.');
  }

  return {
    owner: user.login,
    name: repo.name,
    repoId: repo.id,
    branch: repo.default_branch || 'main',
    url: repo.html_url || `https://github.com/${user.login}/${repo.name}`,
    isDedicated: true,
    rootDir: '',
    author: {
      name: user.name || user.login,
      email: `${user.id}+${user.login}@users.noreply.github.com`
    },
    githubUsername: user.login,
    githubId: user.id
  };
}

export async function syncPractical(token, connection, practical, fetcher = fetch) {
  const api = githubClient(token, fetcher);
  const base = `/repos/${encodeURIComponent(connection.owner)}/${encodeURIComponent(connection.name)}`;
  const slug = practicalSlug(practical);
  const folderPath = connection.isDedicated ? slug : (connection.rootDir ? `${connection.rootDir}/${slug}` : slug);

  // Build subtree for the practical
  const subtree = await api(`${base}/git/trees`, 'POST', { tree: practicalEntries(practical) });

  for (let attempt = 0; attempt < 3; attempt++) {
    const repo = await api(base);
    if (repo.id !== connection.repoId) {
      throw new Error('The connected repository changed. Reconnect before updating.');
    }
    const branch = repo.default_branch || connection.branch || 'main';
    const refPath = `${base}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;

    let ref = null;
    try {
      ref = await api(refPath);
    } catch (err) {
      if (err.status !== 404) throw err;
    }

    if (!ref || !ref.object?.sha) {
      // Empty repo or branch has no commits yet: create initial tree & commit
      const commit = await api(`${base}/git/commits`, 'POST', {
        message: `Add ${practical.title} practical`,
        tree: subtree.sha,
        parents: [],
        author: connection.author
      });

      await api(`${base}/git/refs`, 'POST', {
        ref: `refs/heads/${branch}`,
        sha: commit.sha
      });

      return {
        sha: commit.sha,
        url: `${connection.url}/commit/${commit.sha}`,
        folderUrl: `${connection.url}/tree/${branch}/${folderPath}`,
        message: 'Updated on GitHub'
      };
    }

    const head = await api(`${base}/git/commits/${ref.object.sha}`);

    const nextTree = await api(`${base}/git/trees`, 'POST', {
      base_tree: head.tree.sha,
      tree: [{ path: folderPath, mode: '040000', type: 'tree', sha: subtree.sha }]
    });

    if (nextTree.sha === head.tree.sha) {
      return {
        unchanged: true,
        message: 'GitHub is already up to date',
        url: connection.url,
        folderUrl: `${connection.url}/tree/${branch}/${folderPath}`
      };
    }

    // Determine if practical already existed in head tree
    let isUpdate = false;
    try {
      const existingTree = await api(`${base}/git/trees/${head.tree.sha}`);
      if (existingTree.tree?.some(item => item.path === (connection.isDedicated ? slug : (connection.rootDir || slug)))) {
        isUpdate = true;
      }
    } catch {
      isUpdate = false;
    }

    const commitMessage = isUpdate ? `Update ${practical.title} practical` : `Add ${practical.title} practical`;
    const commit = await api(`${base}/git/commits`, 'POST', {
      message: commitMessage,
      tree: nextTree.sha,
      parents: [ref.object.sha],
      author: connection.author
    });

    try {
      await api(refPath, 'PATCH', { sha: commit.sha, force: false });
      return {
        sha: commit.sha,
        url: `${connection.url}/commit/${commit.sha}`,
        folderUrl: `${connection.url}/tree/${branch}/${folderPath}`,
        message: 'Updated on GitHub'
      };
    } catch (error) {
      if (![409, 422].includes(error.status) || attempt === 2) throw error;
    }
  }
}
