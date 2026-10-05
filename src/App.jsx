import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Atom, Plus, Search, MoreHorizontal, BookOpen, Check, HardDrive, PanelLeft, FolderTree, ChevronDown, ChevronUp, Pencil, Play, X, Code2, Sun, Moon, Github } from 'lucide-react';
import { useWorkspace } from './hooks/useWorkspace';
import { createPractical, duplicatePractical } from './utils/practicals';
import { addEntry, renameEntry, deleteEntry, duplicateFile, basename, dirname, allFolders, within } from './utils/filesystem';
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
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const [search, setSearch] = useState(''); const [dialog, setDialog] = useState(null); const [snapshot, setSnapshot] = useState(null); const [position, setPosition] = useState({ lineNumber: 1, column: 1 }); const [notice, setNotice] = useState(''); const workspaceRef = useRef();
  const layout = { sidebar: true, showFiles: false, question: true, previewWidth: 42, ...data.layout };
  const activeRef = useRef(active); activeRef.current = active;
  function run() { if (activeRef.current) setSnapshot({ practical: structuredClone(activeRef.current), runId: crypto.randomUUID() }); }
  useEffect(() => { const handler = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } }; window.addEventListener('keydown', handler); window.addEventListener('reactlab-run', run); return () => { window.removeEventListener('keydown', handler); window.removeEventListener('reactlab-run', run); }; }, []);
  useEffect(() => { setSnapshot(null); setNotice(''); }, [active?.id]);
  useEffect(() => {
    const closeMenus = e => { if (!e.target.closest('.row-menu')) document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open')); };
    const handleEscape = e => { if (e.key === 'Escape') document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open')); };
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);
  function openFile(path) { update(p => ({ ...p, activeFile: path, selectedFolder: dirname(path), openFiles: [...new Set([...p.openFiles, path])] })); }
  function closeFile(path) { update(p => { const tabs = p.openFiles.filter(f => f !== path); return { ...p, openFiles: tabs, activeFile: p.activeFile === path ? tabs.at(-1) || '/src/App.jsx' : p.activeFile }; }); }
  function newPractical() { setDialog({ type: 'practical', title: 'A new practical. A fresh start.', description: 'Keep your question, code, and output together.', onSubmit: values => { const p = createPractical(values.title, values.question, values.starter === 'simple' ? values.component : null); if (!p.title) throw new Error('Give your practical a title.'); setData(d => ({ ...d, practicals: [...d.practicals, p], activeId: p.id })); setSearch(''); } }); }
  function practicalAction(action, p) {
    if (action === 'duplicate') { const copy = duplicatePractical(p); setData(d => ({ ...d, practicals: [...d.practicals, copy], activeId: copy.id })); setSearch(''); return; }
    setDialog(action === 'rename' ? { title: 'Rename practical', value: p.title, description: 'Give this practical a name you’ll remember.', onSubmit: ({ value }) => { if (!value.trim()) throw new Error('Enter a title.'); update(old => ({ ...old, title: value.trim() }), p.id); } } : { danger: true, title: `Delete “${p.title}”?`, description: 'Its question, files, folders, and code will be permanently removed from this browser.', onSubmit: () => setData(d => ({ ...d, practicals: d.practicals.filter(item => item.id !== p.id), activeId: d.activeId === p.id ? d.practicals.find(item => item.id !== p.id)?.id || null : d.activeId })) });
  }
  function fileAction(action, path) {
    if (action === 'duplicate') { update(p => duplicateFile(p, path)); return; }
    if (action === 'file' || action === 'folder') { setDialog({ type: action, title: action === 'file' ? 'Create a new file' : 'Create a new folder', label: action === 'file' ? 'File name' : 'Folder name', description: `Inside ${path}. Nested paths are welcome.`, placeholder: action === 'file' ? 'ProductCard.jsx' : 'components', submitLabel: 'Create', onSubmit: ({ value }) => { const fullPath = `${path}/${value.trim()}`; const next = addEntry(active, fullPath, action === 'folder'); update(() => action === 'file' ? { ...next, activeFile: fullPath, openFiles: [...next.openFiles, fullPath] } : { ...next, selectedFolder: fullPath }); } }); return; }
    if (action === 'rename') { setDialog({ title: 'Rename file or folder', description: 'Update any imports that use this path after renaming.', value: basename(path), onSubmit: ({ value }) => { const next = renameEntry(active, path, `${dirname(path)}/${value.trim()}`); update(() => next); setNotice('Renamed. Remember to update imports that reference the old path.'); } }); return; }
    const count = Object.keys(active.files).filter(f => within(f, path)).length;
    setDialog({ danger: true, title: `Delete “${basename(path)}”?`, description: `${count > 1 ? `This removes ${count} files and all nested folders.` : 'This removes the selected file or folder.'} This cannot be undone.`, onSubmit: () => update(p => deleteEntry(p, path)) });
  }
  function startResize(event) {
    event.preventDefault(); const rect = workspaceRef.current.getBoundingClientRect();
    const move = e => setLayout({ previewWidth: Math.min(65, Math.max(25, (rect.right - e.clientX) / rect.width * 100)) });
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); document.body.style.cursor = ''; }; document.body.style.cursor = 'col-resize'; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  }
  const filtered = data.practicals.filter(p => `${p.title} ${p.question}`.toLowerCase().includes(search.toLowerCase()));
  const currentSnapshot = snapshot?.practical.id === active?.id ? snapshot : null;
  const modified = currentSnapshot && JSON.stringify(currentSnapshot.practical.files) !== JSON.stringify(active?.files);
  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><Atom size={27}/><strong>ReactLab</strong></div>
      <div className="header-actions">
        <span className="save-status" role="status">{status === 'Saved locally' && <Check size={15}/>} {status}</span>
        <button className="theme-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setLayout({ theme: theme === 'dark' ? 'light' : 'dark' })}>{theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}</button>
        <button className="secondary-button github-button" onClick={() => setGithubOpen(true)}><Github size={17}/>{github.connected ? 'GitHub connected' : 'Connect GitHub'}</button>
      </div>
    </header>
    <div className="app-body">
      {layout.sidebar && <aside className="lab-sidebar">
        <div className="lab-heading"><h2>My practicals <span>{data.practicals.length}</span></h2><button className="icon-button" title="Collapse sidebar" onClick={() => setLayout({ sidebar: false })}><PanelLeft size={16}/></button></div>
        <button className="primary-button new-practical" onClick={newPractical} disabled={!!loadError}><Plus size={17}/> New practical</button>
        <label className="search-box"><Search size={16}/><input aria-label="Search practicals" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <div className="practical-list">{filtered.map(p => <div className={`practical-item ${p.id === active?.id ? 'selected' : ''}`} key={p.id}>
          <button className="practical-select" onClick={() => { document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open')); setData(d => ({ ...d, activeId: p.id })); }}><BookOpen size={16}/><span>{p.title}</span></button>
          <details className="row-menu" onToggle={e => { if (e.currentTarget.open) document.querySelectorAll('details.row-menu[open]').forEach(d => { if (d !== e.currentTarget) d.removeAttribute('open'); }); }}><summary aria-label={`Actions for ${p.title}`}><MoreHorizontal size={17}/></summary><div className="dropdown">{['rename', 'duplicate', 'delete'].map(action => <button className={action === 'delete' ? 'danger-text' : ''} key={action} onClick={e => { e.stopPropagation(); e.currentTarget.closest('details')?.removeAttribute('open'); practicalAction(action, p); }}>{action[0].toUpperCase() + action.slice(1)}</button>)}</div></details>
        </div>)}{filtered.length === 0 && search && <p className="search-empty">No matching practicals.</p>}</div>
        <div className="sidebar-note"><HardDrive size={15}/><span>Saved in this browser</span></div>
      </aside>}
      <main className="main-workspace">
        {loadError ? <div className="workspace-empty"><h2>We couldn’t load your workspace</h2><p>{loadError}</p><button className="secondary-button" onClick={() => location.reload()}>Retry</button></div> : active ? <>
          <section className="practical-header">
            <div className="practical-title-row"><div>{!layout.sidebar && <button className="icon-button" title="Show practicals" onClick={() => setLayout({ sidebar: true })}><PanelLeft size={18}/></button>}<h1>{active.title}</h1></div><button className="primary-button run-button" onClick={run}><Play size={15} fill="currentColor"/> Run <kbd>Ctrl ↵</kbd></button></div>
            <div className="question-heading"><button onClick={() => setLayout({ question: !layout.question })}>{layout.question ? <ChevronDown size={15}/> : <ChevronUp size={15}/>} Question</button><button className="icon-button" aria-label="Edit question" onClick={() => setDialog({ type: 'question', title: 'Edit question', description: 'What should this practical do?', value: active.question, onSubmit: ({ value }) => update(p => ({ ...p, question: value })) })}><Pencil size={14}/></button></div>
            {layout.question && <p className="question-text">{active.question || 'Add your question here.'}</p>}
          </section>
          <div className="coding-workspace" ref={workspaceRef}>
            {layout.showFiles && <FileExplorer key={active.id} practical={active} onOpen={openFile} onSelectFolder={path => update(p => ({ ...p, selectedFolder: path }))} onAction={fileAction} onCollapse={() => setLayout({ showFiles: false })}/>}
            <section className="editor-panel">
              <div className="code-toolbar"><span>Code</span><button className={`file-toggle ${layout.showFiles ? 'selected' : ''}`} onClick={() => setLayout({ showFiles: !layout.showFiles })}><FolderTree size={15}/> Files</button></div>
              <div className="editor-tabs">{[...new Set([...active.openFiles, active.activeFile])].filter(path => active.files[path]).map(path => <div className={`editor-tab ${path === active.activeFile ? 'selected' : ''}`} key={path}><button title={path} onClick={() => openFile(path)}><FileIcon path={path}/>{basename(path)}</button><button className="close-tab" aria-label={`Close ${basename(path)}`} onClick={() => closeFile(path)}><X size={12}/></button></div>)}</div>
              <div className="editor-container"><Suspense fallback={<div className="editor-loading">Loading editor…</div>}><CodeEditor theme={theme} practical={active} onChange={code => update(p => ({ ...p, files: { ...p.files, [p.activeFile]: { type: 'file', code } } }))} onRun={run} onPosition={setPosition}/></Suspense></div>
              <div className="editor-foot"><span>{active.activeFile}</span><span>Ln {position.lineNumber}, Col {position.column}</span></div>
            </section>
            <div className="resize-handle" role="separator" aria-label="Resize output panel" aria-orientation="vertical" aria-valuenow={Math.round(layout.previewWidth)} tabIndex={0} onPointerDown={startResize} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setLayout({ previewWidth: Math.min(65, Math.max(25, layout.previewWidth + (e.key === 'ArrowLeft' ? 2 : -2))) }); } }}/>
            <div className="preview-wrapper" style={{ width: `${layout.previewWidth}%` }}><PreviewPanel snapshot={currentSnapshot} modified={modified} onRun={run} onReady={practical => github.sync(practical)} theme={theme}/></div>
          </div>
          <div className="workspace-status"><span>{Object.keys(active.files).length} files · React</span>{data.github ? <button onClick={() => setGithubOpen(true)} className={github.error ? 'error-text' : ''}><Github size={14}/>{github.status}</button> : <span>Ctrl + Enter to run</span>}</div>
        </> : <div className="workspace-empty"><Atom size={40}/><h1>Your next idea starts here.</h1><p>Create a practical. Write some React. See it work.</p><button className="primary-button" onClick={newPractical}><Plus size={17}/> New practical</button></div>}
      </main>
    </div>
    {notice && <div className="toast" role="status"><Check size={16}/>{notice}<button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss"><X size={14}/></button></div>}
    {dialog && <Dialog config={dialog} onClose={() => setDialog(null)}/>}
    {githubOpen && <GitHubDialog github={github} saved={data.github} practicals={data.practicals} onClose={() => setGithubOpen(false)}/>}
  </div>;
}
