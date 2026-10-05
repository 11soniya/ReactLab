import { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, FileJson, FilePlus2, Folder, FolderOpen, FolderPlus, MoreHorizontal, PanelLeftClose, Braces, Hash } from 'lucide-react';
import { allFolders, basename, dirname } from '../utils/filesystem';
export function FileIcon({ path, size = 15 }) { return path.endsWith('.css') ? <Hash size={size} className="css-icon"/> : path.endsWith('.json') ? <FileJson size={size} className="json-icon"/> : path.endsWith('.jsx') ? <span className="jsx-icon">⚛</span> : <Braces size={size} className="js-icon"/>; }
export default function FileExplorer({ practical, onOpen, onSelectFolder, onAction, onCollapse }) {
  const [collapsed, setCollapsed] = useState({}); const folders = allFolders(practical);
  function tree(parent) {
    const dirs = folders.filter(p => p !== parent && dirname(p) === parent);
    const files = Object.keys(practical.files).filter(p => dirname(p) === parent).sort();
    return [...dirs.map(path => row(path, true)), ...files.map(path => row(path, false))];
  }
  function row(path, folder) {
    const depth = path.split('/').length - 2; const isOpen = !collapsed[path];
    return <div key={path}>
      <div className={`tree-row ${!folder && practical.activeFile === path ? 'active' : ''} ${folder && practical.selectedFolder === path ? 'selected-folder' : ''}`} style={{ paddingLeft: 13 + depth * 14 }}>
        <button className="tree-name" title={path} onClick={() => { document.querySelectorAll('details.row-menu[open]').forEach(el => el.removeAttribute('open')); if (folder) { onSelectFolder(path); setCollapsed(c => ({ ...c, [path]: !c[path] })); } else onOpen(path); }}>
          {folder ? <>{isOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>} {isOpen ? <FolderOpen size={15}/> : <Folder size={15}/>}</> : <FileIcon path={path}/>}
          <span>{basename(path)}</span>
        </button>
        {path !== '/src' && <details className="row-menu" onToggle={e => { if (e.currentTarget.open) document.querySelectorAll('details.row-menu[open]').forEach(d => { if (d !== e.currentTarget) d.removeAttribute('open'); }); }}><summary aria-label={`Actions for ${basename(path)}`}><MoreHorizontal size={15}/></summary><div className="dropdown">{folder && <><button onClick={e => action(e, 'file', path)}>New file</button><button onClick={e => action(e, 'folder', path)}>New folder</button></>}{path !== '/src/App.jsx' && <button onClick={e => action(e, 'rename', path)}>Rename</button>}{!folder && <button onClick={e => action(e, 'duplicate', path)}>Duplicate file</button>}{path !== '/src/App.jsx' && <button className="danger-text" onClick={e => action(e, 'delete', path)}>Delete</button>}</div></details>}
      </div>
      {folder && isOpen && tree(path)}
    </div>;
  }
  function action(e, type, path) { e.stopPropagation(); e.currentTarget.closest('details')?.removeAttribute('open'); onAction(type, path); }
  return <aside className="file-explorer"><div className="panel-title"><span>EXPLORER</span><button className="icon-button" title="Collapse files" onClick={onCollapse}><PanelLeftClose size={15}/></button></div><div className="explorer-subtitle"><ChevronDown size={12}/> PRACTICAL FILES</div><div className="file-tree">{row('/src', true)}</div><div className="file-actions"><button onClick={() => onAction('file', practical.selectedFolder || '/src')}><FilePlus2 size={15}/> New file</button><button onClick={() => onAction('folder', practical.selectedFolder || '/src')}><FolderPlus size={15}/> New folder</button></div><div className="explorer-foot"><span>{Object.keys(practical.files).length} files</span><span>React</span></div></aside>;
}
