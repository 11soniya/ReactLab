import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Atom,
  Plus,
  Search,
  MoreHorizontal,
  BookOpen,
  Check,
  HardDrive,
  PanelLeft,
  FolderTree,
  ChevronDown,
  ChevronUp,
  Pencil,
  Play,
  X,
  Sun,
  Moon,
  Github,
  UploadCloud,
  Loader2,
  ExternalLink,
  Download,
  Upload
} from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import { createPractical, duplicatePractical } from './utils/practicals';
import { addEntry, renameEntry, deleteEntry, duplicateFile, basename, dirname, within } from './utils/filesystem';
import { createBackupPayload, validateBackup, mergePracticals, downloadBackupFile } from './utils/backup';
import { computePracticalHash, getPracticalSyncStatus } from './utils/syncHash';
import Dialog from './components/Dialog';
import FileExplorer, { FileIcon } from './components/FileExplorer';
import PreviewPanel from './components/PreviewPanel';
import GitHubDialog from './components/GitHubDialog';
import { useGitHub } from './hooks/useGitHub';

const CodeEditor = lazy(() => import('./components/CodeEditor'));

export default function App() {
  const { data, setData, active, update, status, loadError, setLayout } = useWorkspace();
  const [githubOpen, setGithubOpen] = useState(false);
  const github = useGitHub(data.github, connection => setData(d => ({ ...d, github: connection })));
  const theme = data.layout.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get('github') === 'authorized') {
      setGithubOpen(true);
    }
  }, []);

  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const [notice, setNotice] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [lastSyncError, setLastSyncError] = useState(null);

  const workspaceRef = useRef();
  const importFileInputRef = useRef(null);

  const layout = { sidebar: true, showFiles: false, question: true, previewWidth: 42, ...data.layout };
  const activeRef = useRef(active);
  activeRef.current = active;

  function run() {
    if (activeRef.current) {
      setSnapshot({ practical: structuredClone(activeRef.current), runId: crypto.randomUUID() });
    }
  }

  const isSyncingActive = github.syncingPracticalId === active?.id;
  const syncStatus = getPracticalSyncStatus(active, data.githubSync || {}, isSyncingActive, lastSyncError);

  async function handleUpdateOnGitHub() {
    if (!github.connected) {
      setGithubOpen(true);
      return;
    }
    if (!active) return;

    if (syncStatus.state === 'UP_TO_DATE') {
      setNotice({
        text: '✓ GitHub is already up to date'
      });
      return;
    }

    setLastSyncError(null);
    try {
      const res = await github.updatePractical(active);
      const currentHash = computePracticalHash(active);

      // Save content hash upon successful push
      setData(d => ({
        ...d,
        githubSync: {
          ...(d.githubSync || {}),
          [active.id]: {
            hash: currentHash,
            sha: res.sha,
            syncedAt: Date.now()
          }
        }
      }));

      if (res.unchanged) {
        setNotice({
          text: '✓ GitHub is already up to date'
        });
      } else {
        setNotice({
          text: `✓ Updated "${active.title}" on GitHub!`,
          link: res.url || res.folderUrl,
          linkText: 'View on GitHub ↗'
        });
      }
    } catch (err) {
      setLastSyncError({ practicalId: active.id, message: err.message });
      setNotice({
        text: err.message || 'Could not update GitHub. Your practical is still saved locally.',
        isError: true
      });
    }
  }

  function handleExportBackup() {
    try {
      downloadBackupFile(data.practicals);
      setNotice({
        text: `✓ Exported backup with ${data.practicals.length} practical(s)`
      });
    } catch (e) {
      setNotice({
        text: `Export failed: ${e.message}`,
        isError: true
      });
    }
  }

  function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const validation = validateBackup(text);
        if (!validation.valid) {
          setNotice({
            text: validation.error || "That doesn't appear to be a valid ReactLab backup.",
            isError: true
          });
          return;
        }

        const importedPracticals = validation.data.practicals;
        if (data.practicals.length === 0) {
          setData(d => ({
            ...d,
            practicals: importedPracticals,
            activeId: importedPracticals[0]?.id || null
          }));
          setNotice({
            text: `✓ Backup imported successfully (${importedPracticals.length} practicals)`
          });
          return;
        }

        setDialog({
          type: 'import_choice',
          title: 'Import ReactLab backup',
          description: `This backup contains ${importedPracticals.length} practical(s). How would you like to import them?`,
          onMerge: () => {
            const { merged, importedCount } = mergePracticals(data.practicals, importedPracticals, computePracticalHash);
            setData(d => ({
              ...d,
              practicals: merged,
              activeId: importedPracticals[0]?.id || d.activeId
            }));
            setNotice({
              text: `✓ Backup merged successfully (${importedCount} practicals added)`
            });
          },
          onReplace: () => {
            setData(d => ({
              ...d,
              practicals: importedPracticals,
              activeId: importedPracticals[0]?.id || null
            }));
            setNotice({
              text: `✓ Backup imported successfully (${importedPracticals.length} practicals)`
            });
          }
        });
      } catch (err) {
        setNotice({
          text: err.message || "That doesn't appear to be a valid ReactLab backup.",
          isError: true
        });
      }
    };
    reader.readAsText(file);
  }

  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('reactlab-run', run);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('reactlab-run', run);
    };
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setNotice(null);
    setLastSyncError(null);
  }, [active?.id]);

  useEffect(() => {
    const closeMenus = e => {
      if (!e.target.closest('.row-menu')) {
        document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open'));
      }
    };
    const handleEscape = e => {
      if (e.key === 'Escape') {
        if (outputExpanded) {
          setOutputExpanded(false);
        }
        document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open'));
      }
    };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [outputExpanded]);

  function openFile(path) {
    update(p => ({
      ...p,
      activeFile: path,
      selectedFolder: dirname(path),
      openFiles: [...new Set([...p.openFiles, path])]
    }));
  }

  function closeFile(path) {
    update(p => {
      const tabs = p.openFiles.filter(f => f !== path);
      return {
        ...p,
        openFiles: tabs,
        activeFile: p.activeFile === path ? tabs.at(-1) || '/src/App.jsx' : p.activeFile
      };
    });
  }

  function newPractical() {
    setDialog({
      type: 'practical',
      title: 'A new practical. A fresh start.',
      description: 'Keep your question, code, and output together.',
      onSubmit: values => {
        const p = createPractical(values.title, values.question, values.starter === 'simple' ? values.component : null);
        if (!p.title) throw new Error('Give your practical a title.');
        setData(d => ({ ...d, practicals: [...d.practicals, p], activeId: p.id }));
        setSearch('');
      }
    });
  }

  function practicalAction(action, p) {
    if (action === 'duplicate') {
      const copy = duplicatePractical(p);
      setData(d => ({ ...d, practicals: [...d.practicals, copy], activeId: copy.id }));
      setSearch('');
      return;
    }
    setDialog(
      action === 'rename'
        ? {
          title: 'Rename practical',
          value: p.title,
          description: 'Give this practical a name you’ll remember.',
          onSubmit: ({ value }) => {
            if (!value.trim()) throw new Error('Enter a title.');
            update(old => ({ ...old, title: value.trim() }), p.id);
          }
        }
        : {
          danger: true,
          title: `Delete “${p.title}”?`,
          description: 'Its question, files, folders, and code will be permanently removed from this browser.',
          onSubmit: () =>
            setData(d => ({
              ...d,
              practicals: d.practicals.filter(item => item.id !== p.id),
              activeId: d.activeId === p.id ? d.practicals.find(item => item.id !== p.id)?.id || null : d.activeId
            }))
        }
    );
  }

  function fileAction(action, path) {
    if (action === 'duplicate') {
      update(p => duplicateFile(p, path));
      return;
    }
    if (action === 'file' || action === 'folder') {
      setDialog({
        type: action,
        title: action === 'file' ? 'Create a new file' : 'Create a new folder',
        label: action === 'file' ? 'File name' : 'Folder name',
        description: `Inside ${path}. Nested paths are welcome.`,
        placeholder: action === 'file' ? 'ProductCard.jsx' : 'components',
        submitLabel: 'Create',
        onSubmit: ({ value }) => {
          const fullPath = `${path}/${value.trim()}`;
          const next = addEntry(active, fullPath, action === 'folder');
          update(() =>
            action === 'file'
              ? { ...next, activeFile: fullPath, openFiles: [...next.openFiles, fullPath] }
              : { ...next, selectedFolder: fullPath }
          );
        }
      });
      return;
    }
    if (action === 'rename') {
      setDialog({
        title: 'Rename file or folder',
        description: 'Update any imports that use this path after renaming.',
        value: basename(path),
        onSubmit: ({ value }) => {
          const next = renameEntry(active, path, `${dirname(path)}/${value.trim()}`);
          update(() => next);
          setNotice({ text: 'Renamed. Remember to update imports that reference the old path.' });
        }
      });
      return;
    }
    const count = Object.keys(active.files).filter(f => within(f, path)).length;
    setDialog({
      danger: true,
      title: `Delete “${basename(path)}”?`,
      description: `${count > 1 ? `This removes ${count} files and all nested folders.` : 'This removes the selected file or folder.'} This cannot be undone.`,
      onSubmit: () => update(p => deleteEntry(p, path))
    });
  }

  function openEditQuestionDialog() {
    if (!active) return;
    setDialog({
      type: 'question',
      title: 'Edit question',
      description: 'What should this practical do?',
      value: active.question,
      onSubmit: ({ value }) => update(p => ({ ...p, question: value }))
    });
  }

  function startResize(event) {
    event.preventDefault();
    setIsResizing(true);
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const move = e => {
      const percentage = Math.min(65, Math.max(25, ((rect.right - e.clientX) / rect.width) * 100));
      setLayout({ previewWidth: percentage });
    };

    const stop = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  const filtered = data.practicals.filter(p => `${p.title} ${p.question}`.toLowerCase().includes(search.toLowerCase()));
  const currentSnapshot = snapshot?.practical.id === active?.id ? snapshot : null;
  const modified = currentSnapshot && JSON.stringify(currentSnapshot.practical.files) !== JSON.stringify(active?.files);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <Atom size={27} />
          <strong>ReactLab</strong>
        </div>
        <div className="header-actions">
          <span className="save-status" role="status">
            {status === 'Saved locally' && <Check size={15} />} {status}
          </span>
          <button
            className="theme-toggle"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => setLayout({ theme: theme === 'dark' ? 'light' : 'dark' })}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="secondary-button github-button"
            onClick={() => setGithubOpen(true)}
            title={github.connected ? `Connected to ${github.connection?.owner}/${github.connection?.name}` : 'Connect GitHub'}
          >
            <Github size={17} />
            {github.connected ? (
              <span>@{github.user?.login || github.connection?.owner}</span>
            ) : github.authorized ? (
              <span>Choose repository</span>
            ) : (
              <span>Connect GitHub</span>
            )}
          </button>
        </div>
      </header>

      <div className="app-body">
        {layout.sidebar && (
          <aside className="lab-sidebar">
            <div className="lab-heading">
              <h2>
                My practicals <span>{data.practicals.length}</span>
              </h2>
              <button className="icon-button" title="Collapse sidebar" onClick={() => setLayout({ sidebar: false })}>
                <PanelLeft size={16} />
              </button>
            </div>
            <button className="primary-button new-practical" onClick={newPractical} disabled={!!loadError}>
              <Plus size={17} /> New practical
            </button>
            <label className="search-box">
              <Search size={16} />
              <input aria-label="Search practicals" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            <div className="practical-list">
              {filtered.map(p => {
                const pSync = getPracticalSyncStatus(p, data.githubSync || {});
                return (
                  <div className={`practical-item ${p.id === active?.id ? 'selected' : ''}`} key={p.id}>
                    <button
                      className="practical-select"
                      onClick={() => {
                        document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open'));
                        setData(d => ({ ...d, activeId: p.id }));
                      }}
                    >
                      <BookOpen size={16} />
                      <span>{p.title}</span>
                      {github.connected && (
                        <span className="sidebar-sync-badge">
                          {pSync.state === 'UP_TO_DATE' ? (
                            <span className="sync-dot synced" title="Synced with GitHub">✓</span>
                          ) : pSync.state === 'MODIFIED' ? (
                            <span className="sync-dot modified" title="Local changes not on GitHub">•</span>
                          ) : null}
                        </span>
                      )}
                    </button>
                    <details
                      className="row-menu"
                      onToggle={e => {
                        if (e.currentTarget.open) {
                          document.querySelectorAll('details.row-menu[open]').forEach(d => {
                            if (d !== e.currentTarget) d.removeAttribute('open');
                          });
                        }
                      }}
                    >
                      <summary aria-label={`Actions for ${p.title}`}>
                        <MoreHorizontal size={17} />
                      </summary>
                      <div className="dropdown">
                        {['rename', 'duplicate', 'delete'].map(action => (
                          <button
                            className={action === 'delete' ? 'danger-text' : ''}
                            key={action}
                            onClick={e => {
                              e.stopPropagation();
                              e.currentTarget.closest('details')?.removeAttribute('open');
                              practicalAction(action, p);
                            }}
                          >
                            {action[0].toUpperCase() + action.slice(1)}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })}
              {filtered.length === 0 && search && <p className="search-empty">No matching practicals.</p>}
            </div>

            <div className="sidebar-footer">
              <details className="row-menu backup-menu">
                <summary className="sidebar-action-btn" title="Backup workspace" aria-label="Backup and restore practicals">
                  <HardDrive size={14} />
                  <span>Backup</span>
                </summary>
                <div className="dropdown backup-dropdown">
                  <button onClick={handleExportBackup}>
                    <Download size={14} /> Export backup (.json)
                  </button>
                  <button onClick={() => importFileInputRef.current?.click()}>
                    <Upload size={14} /> Import backup…
                  </button>
                </div>
              </details>
              <input
                type="file"
                ref={importFileInputRef}
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportFileChange}
              />
            </div>
          </aside>
        )}

        <main className="main-workspace">
          {loadError ? (
            <div className="workspace-empty">
              <h2>We couldn’t load your workspace</h2>
              <p>{loadError}</p>
              <button className="secondary-button" onClick={() => location.reload()}>
                Retry
              </button>
            </div>
          ) : active ? (
            <>
              <section className="practical-header">
                <div className="practical-title-row">
                  <div>
                    {!layout.sidebar && (
                      <button className="icon-button" title="Show practicals" onClick={() => setLayout({ sidebar: true })}>
                        <PanelLeft size={18} />
                      </button>
                    )}
                    <h1>{active.title}</h1>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      className={`secondary-button github-update-button ${syncStatus.state === 'UP_TO_DATE' ? 'synced' : ''}`}
                      onClick={handleUpdateOnGitHub}
                      disabled={isSyncingActive || github.busy}
                      title={
                        !github.connected
                          ? 'Connect GitHub to push practicals'
                          : syncStatus.state === 'UP_TO_DATE'
                            ? 'Local content matches GitHub'
                            : syncStatus.state === 'NOT_UPLOADED'
                              ? 'Add this practical to GitHub'
                              : 'Push changes to GitHub'
                      }
                      style={{ padding: '9px 15px', fontWeight: 550, gap: 7 }}
                    >
                      {isSyncingActive ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Updating GitHub…
                        </>
                      ) : syncStatus.state === 'UP_TO_DATE' ? (
                        <>
                          <Check size={16} /> Up to date
                        </>
                      ) : syncStatus.state === 'NOT_UPLOADED' ? (
                        <>
                          <UploadCloud size={16} /> Add to GitHub
                        </>
                      ) : (
                        <>
                          <UploadCloud size={16} /> Update on GitHub
                        </>
                      )}
                    </button>
                    <button className="primary-button run-button" onClick={run}>
                      <Play size={15} fill="currentColor" /> Run <kbd>Ctrl ↵</kbd>
                    </button>
                  </div>
                </div>

                <div className="question-heading">
                  <button onClick={() => setLayout({ question: !layout.question })}>
                    {layout.question ? <ChevronDown size={15} /> : <ChevronUp size={15} />} Question
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Edit question"
                    title="Edit question"
                    onClick={openEditQuestionDialog}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                {layout.question && (
                  <p
                    className="question-text question-clickable"
                    title="Click to edit question"
                    onClick={openEditQuestionDialog}
                  >
                    {active.question || 'Add your question here.'}
                  </p>
                )}
              </section>

              <div className={`coding-workspace ${outputExpanded ? 'output-fullscreen' : ''}`} ref={workspaceRef}>
                {!outputExpanded && layout.showFiles && (
                  <FileExplorer
                    key={active.id}
                    practical={active}
                    onOpen={openFile}
                    onSelectFolder={path => update(p => ({ ...p, selectedFolder: path }))}
                    onAction={fileAction}
                    onCollapse={() => setLayout({ showFiles: false })}
                  />
                )}

                {!outputExpanded && (
                  <section className="editor-panel">
                    <div className="code-toolbar">
                      <span>Code</span>
                      <button
                        className={`file-toggle ${layout.showFiles ? 'selected' : ''}`}
                        onClick={() => setLayout({ showFiles: !layout.showFiles })}
                        title={layout.showFiles ? 'Close file explorer' : 'Open file explorer'}
                        aria-label={layout.showFiles ? 'Close file explorer' : 'Open file explorer'}
                      >
                        <FolderTree size={15} /> Files
                      </button>
                    </div>
                    <div className="editor-tabs">
                      {[...new Set([...active.openFiles, active.activeFile])]
                        .filter(path => active.files[path])
                        .map(path => (
                          <div className={`editor-tab ${path === active.activeFile ? 'selected' : ''}`} key={path}>
                            <button title={path} onClick={() => openFile(path)}>
                              <FileIcon path={path} />
                              {basename(path)}
                            </button>
                            <button className="close-tab" aria-label={`Close ${basename(path)}`} onClick={() => closeFile(path)}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                    </div>
                    <div className="editor-container">
                      <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
                        <CodeEditor
                          theme={theme}
                          practical={active}
                          onChange={code =>
                            update(p => ({
                              ...p,
                              files: { ...p.files, [p.activeFile]: { type: 'file', code } }
                            }))
                          }
                          onRun={run}
                          onPosition={setPosition}
                        />
                      </Suspense>
                    </div>
                    <div className="editor-foot">
                      <span>{active.activeFile}</span>
                      <span>
                        Ln {position.lineNumber}, Col {position.column}
                      </span>
                    </div>
                  </section>
                )}

                {!outputExpanded && (
                  <div
                    className="resize-handle"
                    role="separator"
                    aria-label="Resize output panel"
                    aria-orientation="vertical"
                    aria-valuenow={Math.round(layout.previewWidth)}
                    tabIndex={0}
                    onPointerDown={startResize}
                    onKeyDown={e => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        setLayout({
                          previewWidth: Math.min(65, Math.max(25, layout.previewWidth + (e.key === 'ArrowLeft' ? 2 : -2)))
                        });
                      }
                    }}
                  />
                )}

                <div
                  className="preview-wrapper"
                  style={{
                    width: outputExpanded ? '100%' : `${layout.previewWidth}%`,
                    maxWidth: outputExpanded ? '100%' : '65%',
                    flex: outputExpanded ? 1 : undefined,
                    position: 'relative'
                  }}
                >
                  {isResizing && <div className="resize-overlay" />}
                  <PreviewPanel
                    snapshot={currentSnapshot}
                    modified={modified}
                    onRun={run}
                    theme={theme}
                    isExpanded={outputExpanded}
                    onToggleExpand={() => setOutputExpanded(exp => !exp)}
                  />
                </div>
              </div>

              <div className="workspace-status">
                <span>{Object.keys(active.files).length} files · React</span>
                {github.connected ? (
                  <a
                    href={github.connection?.url || `https://github.com/${github.connection?.owner}/${github.connection?.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="repo-link"
                    title="Open GitHub repository"
                    aria-label={`Open ${github.connection?.owner}/${github.connection?.name} repository on GitHub`}
                  >
                    <Github size={14} />
                    <span>{github.connection?.owner}/{github.connection?.name}</span>
                    <ExternalLink size={11} style={{ opacity: 0.7 }} />
                  </a>
                ) : (
                  <span>Ctrl + Enter to run</span>
                )}
              </div>
            </>
          ) : (
            <div className="workspace-empty">
              <Atom size={40} />
              <h1>Your React practicals, all in one place.</h1>
              <p>Create a practical, keep its question and files together, and run it anytime.</p>
              <p>Question + files + runnable output — saved automatically.</p>
              <button className="primary-button" onClick={newPractical}>
                <Plus size={17} /> New practical
              </button>
            </div>
          )}
        </main>
      </div>

      {notice && (
        <div className={`toast ${notice.isError ? 'form-error' : ''}`} role="status">
          <Check size={16} />
          <span>{notice.text}</span>
          {notice.link && (
            <a
              href={notice.link}
              target="_blank"
              rel="noreferrer"
              style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}
            >
              {notice.linkText || 'View on GitHub'} <ExternalLink size={12} />
            </a>
          )}
          <button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {dialog && <Dialog config={dialog} onClose={() => setDialog(null)} />}
      {githubOpen && <GitHubDialog github={github} onClose={() => setGithubOpen(false)} />}
    </div>
  );
}
