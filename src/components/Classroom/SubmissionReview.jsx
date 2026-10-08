import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  FolderTree,
  X,
  Loader2,
  Eye,
  Check
} from 'lucide-react';
import { classroomApi } from '../../utils/classroomApi';
import FileExplorer, { FileIcon } from '../FileExplorer';
import PreviewPanel from '../PreviewPanel';
import { basename } from '../../utils/filesystem';

const CodeEditor = lazy(() => import('../CodeEditor'));

export default function SubmissionReview({ submissionId, onBack, theme = 'dark' }) {
  const [submission, setSubmission] = useState(null);
  const [practical, setPractical] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('Submitted');
  const [showFiles, setShowFiles] = useState(true);
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const [previewWidth, setPreviewWidth] = useState(48);
  const [isResizing, setIsResizing] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);

  const workspaceRef = useRef();
  const practicalRef = useRef(practical);
  practicalRef.current = practical;

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  async function loadSubmission() {
    setLoading(true);
    try {
      const res = await classroomApi.getSubmission(submissionId);
      const sub = res.submission;
      setSubmission(sub);
      setStatus(sub.status);

      const practicalObj = {
        id: `review-${sub.id}`,
        title: sub.assignmentTitle,
        question: sub.assignmentQuestion,
        files: sub.files,
        folders: sub.folders || ['/src'],
        activeFile: sub.activeFile || '/src/App.jsx',
        openFiles: Object.keys(sub.files)
      };

      setPractical(practicalObj);
      setSnapshot({ practical: practicalObj, runId: crypto.randomUUID() });
    } catch (err) {
      alert(err.message || 'Failed to load submission.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkChecked() {
    if (checking || status === 'Checked') return;
    setChecking(true);
    try {
      await classroomApi.markChecked(submissionId);
      setStatus('Checked');
    } catch (err) {
      alert(err.message || 'Failed to mark as checked.');
    } finally {
      setChecking(false);
    }
  }

  function run() {
    if (practicalRef.current) {
      setSnapshot({ practical: structuredClone(practicalRef.current), runId: crypto.randomUUID() });
    }
  }

  function openFile(path) {
    if (!practical) return;
    setPractical(p => ({
      ...p,
      activeFile: path,
      openFiles: p.openFiles.includes(path) ? p.openFiles : [...p.openFiles, path]
    }));
  }

  function closeFile(path) {
    if (!practical) return;
    setPractical(p => {
      const open = p.openFiles.filter(f => f !== path);
      return {
        ...p,
        openFiles: open.length > 0 ? open : [p.activeFile],
        activeFile: p.activeFile === path ? (open[open.length - 1] || Object.keys(p.files)[0]) : p.activeFile
      };
    });
  }

  function startResize(event) {
    event.preventDefault();
    setIsResizing(true);
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;

    const move = e => {
      const percentage = Math.min(65, Math.max(25, ((rect.right - e.clientX) / rect.width) * 100));
      setPreviewWidth(percentage);
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

  if (loading || !submission || !practical) {
    return (
      <div className="loading-state h-96">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        <span>Loading submission review…</span>
      </div>
    );
  }

  return (
    <div className="classroom-editor-view">
      {/* Top Header */}
      <div className="classroom-editor-header">
        <div className="flex items-center gap-4 min-w-0">
          <button type="button" className="back-link-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Submissions
          </button>
          <div className="review-meta-header">
            <div className="flex items-center gap-2">
              <h2>{submission.studentName}</h2>
              <span className="text-xs text-[var(--muted)]">({submission.studentEmail})</span>
              <span className={`status-badge ${status.toLowerCase()}`}>
                {status === 'Checked' ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                {status}
              </span>
            </div>
            <span className="text-xs text-[var(--muted)]">
              {submission.assignmentTitle} · Submitted {new Date(submission.submittedAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="primary-button run-button"
            onClick={run}
            title="Run Code in Sandbox"
          >
            <Play size={15} /> Run Code
          </button>

          {status === 'Submitted' ? (
            <button
              type="button"
              className="primary-button text-xs py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={handleMarkChecked}
              disabled={checking}
            >
              {checking ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Marking…
                </>
              ) : (
                <>
                  <Check size={15} /> Mark as Checked
                </>
              )}
            </button>
          ) : (
            <span className="checked-complete-badge">
              <CheckCircle2 size={16} className="text-emerald-500" /> Checked
            </span>
          )}
        </div>
      </div>

      {/* Main Coding Workspace (Read-only) */}
      <div className="coding-workspace flex-1" ref={workspaceRef}>
        {/* File Explorer (Read-only) */}
        {showFiles && (
          <FileExplorer
            practical={practical}
            readOnly={true}
            onOpen={openFile}
            onSelectFolder={path => setPractical(p => ({ ...p, selectedFolder: path }))}
            onAction={() => {}}
            onCollapse={() => setShowFiles(false)}
          />
        )}

        {/* Monaco Editor (Read-only) */}
        {!outputExpanded && (
          <section className="editor-panel">
            <div className="code-toolbar">
              <span className="flex items-center gap-2">
                Code <span className="text-xs text-[var(--muted)]">(Student Submission · Read Only)</span>
              </span>
              <button
                type="button"
                className={`file-toggle ${showFiles ? 'selected' : ''}`}
                onClick={() => setShowFiles(!showFiles)}
              >
                <FolderTree size={14} /> Files
              </button>
            </div>

            <div className="editor-tabs">
              {[...new Set([...practical.openFiles, practical.activeFile])]
                .filter(path => practical.files[path])
                .map(path => (
                  <div className={`editor-tab ${path === practical.activeFile ? 'selected' : ''}`} key={path}>
                    <button type="button" onClick={() => openFile(path)}>
                      <FileIcon path={path} />
                      {basename(path)}
                    </button>
                    {practical.openFiles.length > 1 && (
                      <button
                        type="button"
                        className="close-tab"
                        onClick={() => closeFile(path)}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
            </div>

            <div className="editor-container">
              <Suspense fallback={<div className="editor-loading">Loading editor…</div>}>
                <CodeEditor
                  theme={theme}
                  readOnly={true}
                  practical={practical}
                  onChange={() => {}}
                  onRun={run}
                  onPosition={setPosition}
                />
              </Suspense>
            </div>

            <div className="editor-foot">
              <span>{practical.activeFile}</span>
              <span>Ln {position.lineNumber}, Col {position.column}</span>
            </div>
          </section>
        )}

        {/* Resize Handle */}
        {!outputExpanded && (
          <div
            className="resize-handle"
            role="separator"
            onPointerDown={startResize}
          />
        )}

        {/* Preview Output */}
        <div
          className="preview-wrapper"
          style={{
            width: outputExpanded ? '100%' : `${previewWidth}%`,
            maxWidth: outputExpanded ? '100%' : '65%',
            flex: outputExpanded ? 1 : undefined,
            position: 'relative'
          }}
        >
          {isResizing && <div className="resize-overlay" />}
          <PreviewPanel
            snapshot={snapshot}
            modified={false}
            onRun={run}
            theme={theme}
            isExpanded={outputExpanded}
            onToggleExpand={() => setOutputExpanded(exp => !exp)}
          />
        </div>
      </div>
    </div>
  );
}
