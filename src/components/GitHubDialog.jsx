import { useEffect, useRef, useState } from 'react';
import { Github, X, Check, ExternalLink, ShieldCheck, Search, PlusCircle, FolderGit2, Loader2, Lock, Globe } from 'lucide-react';

export default function GitHubDialog({ github, onClose }) {
  const ref = useRef();
  const [mode, setMode] = useState('create'); // 'create' | 'existing'
  const [repoName, setRepoName] = useState('reactlab-practicals');
  const [isPrivate, setIsPrivate] = useState(true);
  const [search, setSearch] = useState('');
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState(null);
  const [view, setView] = useState('default'); // 'default' | 'change_repo'

  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);

  // When authorized or changing repo, load repositories list
  useEffect(() => {
    if (github.authorized && (view === 'change_repo' || !github.connected)) {
      setLoadingRepos(true);
      github.fetchRepos().then(list => {
        setRepos(list || []);
        if (list?.length > 0 && !selectedExisting) {
          setSelectedExisting(list[0]);
        }
        setLoadingRepos(false);
      });
    }
  }, [github.authorized, github.connected, view]);

  const filteredRepos = repos.filter(r =>
    r.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    r.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreateRepo(e) {
    e.preventDefault();
    try {
      await github.selectRepository({
        mode: 'create',
        name: repoName.trim(),
        isPrivate
      });
      setView('default');
    } catch {
      // error handled in hook
    }
  }

  async function handleSelectExisting(e) {
    e.preventDefault();
    if (!selectedExisting) return;
    try {
      await github.selectRepository({
        mode: 'existing',
        existingRepo: {
          owner: selectedExisting.owner,
          name: selectedExisting.name,
          id: selectedExisting.id
        }
      });
      setView('default');
    } catch {
      // error handled in hook
    }
  }

  const showRepoPicker = github.authorized && (!github.connected || view === 'change_repo');

  return (
    <dialog ref={ref} className="modal github-dialog" onCancel={onClose}>
      <div className="modal-heading">
        <div className="modal-icon">
          <Github size={22} />
        </div>
        <button type="button" className="icon-button" aria-label="Close GitHub dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {github.loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)' }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
          <p>Checking GitHub connection…</p>
        </div>
      ) : !github.configured ? (
        <>
          <h2>GitHub setup needed</h2>
          <p className="modal-description">
            GitHub OAuth requires app credentials in server settings. Your practicals are still safely saved locally in this browser.
          </p>
          <div className="github-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Ready for OAuth</strong>
              <p style={{ margin: '4px 0 0' }}>
                Configure <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> to enable one-click GitHub connection.
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={github.refresh}>
              Check again
            </button>
            <button type="button" className="primary-button" onClick={onClose}>
              Continue practicing
            </button>
          </div>
        </>
      ) : showRepoPicker ? (
        <>
          <h2>Where should ReactLab store your practicals?</h2>
          {github.user && (
            <p className="modal-description" style={{ marginBottom: 16 }}>
              ✓ Connected as <strong>@{github.user.login}</strong>. Select where practical files will be committed.
            </p>
          )}

          <div className="starter-options" style={{ marginBottom: 20 }}>
            <label
              className={mode === 'create' ? 'chosen' : ''}
              onClick={() => setMode('create')}
            >
              <input
                type="radio"
                name="repo_mode"
                checked={mode === 'create'}
                onChange={() => setMode('create')}
              />
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <PlusCircle size={15} /> Create a new repository
              </strong>
              <span>Dedicated repository for all practicals</span>
            </label>

            <label
              className={mode === 'existing' ? 'chosen' : ''}
              onClick={() => setMode('existing')}
            >
              <input
                type="radio"
                name="repo_mode"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />
              <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderGit2 size={15} /> Use an existing repository
              </strong>
              <span>Save inside a safe <code>reactlab/</code> folder</span>
            </label>
          </div>

          {mode === 'create' ? (
            <form onSubmit={handleCreateRepo}>
              <label>
                Repository name
                <input
                  required
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,99}"
                  value={repoName}
                  onChange={e => setRepoName(e.target.value)}
                  placeholder="reactlab-practicals"
                />
              </label>

              <div style={{ marginTop: 14 }}>
                <label style={{ margin: '0 0 8px', fontWeight: 500, display: 'block' }}>Privacy</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="privacy"
                      checked={isPrivate}
                      onChange={() => setIsPrivate(true)}
                    />
                    <Lock size={14} /> Private (Recommended)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="privacy"
                      checked={!isPrivate}
                      onChange={() => setIsPrivate(false)}
                    />
                    <Globe size={14} /> Public
                  </label>
                </div>
              </div>

              <div className="github-note" style={{ marginTop: 18 }}>
                <p>
                  ReactLab will create <strong>{github.user?.login || 'you'}/{repoName}</strong> on your GitHub account and store each practical in its own folder.
                </p>
              </div>

              <div className="modal-actions">
                {github.connected && (
                  <button type="button" className="secondary-button" onClick={() => setView('default')}>
                    Cancel
                  </button>
                )}
                <button type="button" className="secondary-button" onClick={github.disconnect}>
                  Disconnect
                </button>
                <button type="submit" className="primary-button" disabled={github.busy || !repoName.trim()}>
                  {github.busy ? 'Creating…' : 'Create Repository'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSelectExisting}>
              <label className="search-box" style={{ marginTop: 10 }}>
                <Search size={15} />
                <input
                  placeholder="Search repositories…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>

              <div
                style={{
                  maxHeight: 210,
                  overflowY: 'auto',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 4,
                  marginTop: 8
                }}
              >
                {loadingRepos ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Loading your repositories…
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    No repositories found.
                  </div>
                ) : (
                  filteredRepos.map(repo => {
                    const isSelected = selectedExisting?.id === repo.id;
                    return (
                      <div
                        key={repo.id}
                        onClick={() => setSelectedExisting(repo)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isSelected ? 'var(--accent-soft)' : 'transparent',
                          color: isSelected ? 'var(--accent-text)' : 'inherit'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <input
                            type="radio"
                            name="existing_repo_choice"
                            checked={isSelected}
                            onChange={() => setSelectedExisting(repo)}
                          />
                          <span style={{ fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {repo.fullName || `${repo.owner}/${repo.name}`}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {repo.isPrivate ? <Lock size={11} /> : <Globe size={11} />}
                          {repo.isPrivate ? 'Private' : 'Public'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="github-note" style={{ marginTop: 14 }}>
                <p>
                  ReactLab operates strictly inside a <code>reactlab/</code> directory in this repository. Your existing files and README will never be overwritten.
                </p>
              </div>

              <div className="modal-actions">
                {github.connected && (
                  <button type="button" className="secondary-button" onClick={() => setView('default')}>
                    Cancel
                  </button>
                )}
                <button type="button" className="secondary-button" onClick={github.disconnect}>
                  Disconnect
                </button>
                <button type="submit" className="primary-button" disabled={github.busy || !selectedExisting}>
                  {github.busy ? 'Connecting…' : 'Use this repository'}
                </button>
              </div>
            </form>
          )}
        </>
      ) : github.connected ? (
        <>
          <h2>GitHub Connected</h2>
          <p className="modal-description">
            Your workspace is connected to GitHub. Practicals are pushed only when you click <strong>Update on GitHub</strong>.
          </p>

          <div className="connection-summary" style={{ marginBottom: 16 }}>
            <Check size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>@{github.user?.login || github.connection?.owner}</div>
              <p style={{ margin: '4px 0 0' }}>
                Repository:{' '}
                <a
                  href={github.connection?.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {github.connection?.owner}/{github.connection?.name} <ExternalLink size={12} />
                </a>
              </p>
              <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                {github.connection?.isDedicated
                  ? 'Dedicated repository: Practicals stored in root folders (<practical-name>/)'
                  : 'Existing repository: Practicals stored safely in reactlab/ folder (reactlab/<practical-name>/)'}
              </p>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={github.disconnect}
              disabled={github.busy}
            >
              Disconnect
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setView('change_repo')}
            >
              Change repository
            </button>
            <button type="button" className="primary-button" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <h2>Connect GitHub</h2>
          <p className="modal-description">
            Connect your GitHub account to store your ReactLab practicals in your own private or public repository.
          </p>

          <div className="github-note" style={{ marginBottom: 20 }}>
            <ShieldCheck size={20} />
            <div>
              <strong>Secure & Simple</strong>
              <p style={{ margin: '4px 0 0' }}>
                Authorizes directly via GitHub. No Personal Access Tokens or passwords are ever required or stored in your browser.
              </p>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={github.connect}
              disabled={github.busy}
            >
              <Github size={16} />
              {github.busy ? 'Opening GitHub…' : 'Connect GitHub'}
            </button>
          </div>
        </>
      )}

      {github.error && (
        <p className="form-error" role="alert" style={{ marginTop: 16 }}>
          {github.error}
        </p>
      )}
    </dialog>
  );
}
