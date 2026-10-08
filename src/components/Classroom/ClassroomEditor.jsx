import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import {
  ArrowLeft,
  Play,
  Check,
  Send,
  Loader2,
  FolderTree,
  X,
  Lock,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { classroomApi } from '../../utils/classroomApi';
import FileExplorer, { FileIcon } from '../FileExplorer';
import PreviewPanel from '../PreviewPanel';
import Dialog from '../Dialog';
import { addEntry, renameEntry, deleteEntry, duplicateFile, basename, dirname } from '../../utils/filesystem';

const CodeEditor = lazy(() => import('../CodeEditor'));

const DEFAULT_STARTER_FILES = {
  '/src/App.jsx': {
    type: 'file',
    code: `import React, { useState } from 'react';\nimport './styles.css';\n\nexport default function App() {\n  return (\n    <div className="container">\n      <h1>Solution</h1>\n      <p>Start writing your solution here.</p>\n    </div>\n  );\n}`
  },
  '/src/styles.css': {
    type: 'file',
    code: `body {\n  font-family: system-ui, -apple-system, sans-serif;\n  padding: 24px;\n  background: #f8fafc;\n  color: #0f172a;\n}\n\n.container {\n  max-width: 600px;\n  margin: 0 auto;\n}`
  }
};

export default function ClassroomEditor({ assignment, user, onBack, theme = 'dark' }) {
  const [practical, setPractical] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState(assignment.status || 'Pending');
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('All changes saved');
  const [snapshot, setSnapshot] = useState(null);
  const [showFiles, setShowFiles] = useState(false);
  const [position, setPosition] = useState({ lineNumber: 1, column: 1 });
  const [previewWidth, setPreviewWidth] = useState(45);
  const [isResizing, setIsResizing] = useState(false);
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [questionCollapsed, setQuestionCollapsed] = useState(false);

  // Submit Modal
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const workspaceRef = useRef();
  const autosaveTimerRef = useRef(null);
  const practicalRef = useRef(practical);
  practicalRef.current = practical;

  useEffect(() => {
    loadAssignmentWork();
  }, [assignment.id]);

  async function loadAssignmentWork() {
    setLoading(true);
    try {
      // First check if there's a draft or existing submission
      const draftRes = await classroomApi.getDraft(assignment.id);

      if (draftRes.isSubmitted) {
        setIsSubmitted(true);
        setSubmissionStatus(draftRes.status || 'Submitted');
        // Fetch submission snapshot
        const subRes = await classroomApi.getSubmission(draftRes.submissionId);
        const sub = subRes.submission;
        const practicalObj = {
          id: `classroom-${assignment.id}`,
          title: assignment.title,
          question: assignment.question,
          files: sub.files,
          folders: sub.folders || ['/src'],
          activeFile: sub.activeFile || '/src/App.jsx',
          openFiles: Object.keys(sub.files)
        };
        setPractical(practicalObj);
        setSnapshot({ practical: practicalObj, runId: crypto.randomUUID() });
      } else if (draftRes.draft) {
        setIsSubmitted(false);
        const draft = draftRes.draft;
        const practicalObj = {
          id: `classroom-${assignment.id}`,
          title: assignment.title,
          question: assignment.question,
          files: draft.files,
          folders: draft.folders || ['/src'],
          activeFile: draft.activeFile || '/src/App.jsx',
          openFiles: Object.keys(draft.files)
        };
        setPractical(practicalObj);
        setSnapshot({ practical: practicalObj, runId: crypto.randomUUID() });
      } else {
        // Initial clean practical
        setIsSubmitted(false);
        const initialPractical = {
          id: `classroom-${assignment.id}`,
          title: assignment.title,
          question: assignment.question,
          files: structuredClone(DEFAULT_STARTER_FILES),
          folders: ['/src'],
          activeFile: '/src/App.jsx',
          openFiles: ['/src/App.jsx', '/src/styles.css']
        };
        setPractical(initialPractical);
        setSnapshot({ practical: initialPractical, runId: crypto.randomUUID() });
      }
    } catch (err) {
      alert(err.message || 'Failed to load assignment work.');
    } finally {
      setLoading(false);
    }
  }

  function updatePractical(fn) {
    if (isSubmitted) return; // Disallow edits if submitted
    setPractical(prev => {
      const next = fn(prev);
      scheduleAutosave(next);
      return next;
    });
  }

  function scheduleAutosave(p) {
    if (isSubmitted || !p) return;
    setSaveStatus('Saving…');
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        await classroomApi.saveDraft(assignment.id, p.files, p.folders, p.activeFile);
        setSaveStatus('Saved to cloud');
      } catch (err) {
        setSaveStatus('Autosave error');
      }
    }, 800);
  }

  function run() {
    if (practicalRef.current) {
      setSnapshot({ practical: structuredClone(practicalRef.current), runId: crypto.randomUUID() });
    }
  }

  async function handleFinalSubmit() {
    if (!practicalRef.current || isSubmitted) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const p = practicalRef.current;
      const res = await classroomApi.submitAssignment(assignment.id, p.files, p.folders, p.activeFile);
      setIsSubmitted(true);
      setSubmissionStatus('Submitted');
      setShowConfirmSubmit(false);
    } catch (err) {
      setSubmitError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  // File explorer interactions
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

  function handleFileAction(type, target) {
    if (isSubmitted) return;
    setDialog({
      type,
      target,
      onConfirm: async name => {
        try {
          if (type === 'file' || type === 'folder') {
            const next = addEntry(practical, target, name, type);
            updatePractical(() => next);
            if (type === 'file') openFile(`${target}/${name}`);
          } else if (type === 'rename') {
            const next = renameEntry(practical, target, name);
            updatePractical(() => next);
          } else if (type === 'delete') {
            const next = deleteEntry(practical, target);
            updatePractical(() => next);
          } else if (type === 'duplicate') {
            const next = duplicateFile(practical, target);
            updatePractical(() => next);
          }
          setDialog(null);
        } catch (e) {
          alert(e.message);
        }
      }
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

  if (loading || !practical) {
    return (
      <div className="loading-state h-96">
        <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        <span>Loading assignment workspace…</span>
      </div>
    );
  }

  const modified = snapshot && JSON.stringify(snapshot.practical.files) !== JSON.stringify(practical.files);

  return (
    <div className="classroom-editor-view">
      {/* Top Header */}
      <div className="classroom-editor-header">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" className="back-link-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div className="editor-assignment-info">
            <h1>{assignment.title}</h1>
            <span className="save-status text-xs">
              {isSubmitted ? (
                <span className={`status-badge ${submissionStatus.toLowerCase()} py-0.5 px-2`}>
                  {submissionStatus === 'Checked' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                  {submissionStatus} (Read-Only)
                </span>
              ) : (
                <>
                  <Check size={13} className="text-[var(--accent)]" /> {saveStatus}
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="primary-button run-button"
            onClick={run}
            title="Run Code (Ctrl+Enter)"
          >
            <Play size={15} /> Run
          </button>

          {!isSubmitted && (
            <button
              type="button"
              className="primary-button text-xs py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              onClick={() => setShowConfirmSubmit(true)}
            >
              <Send size={14} /> Submit Final Solution
            </button>
          )}
        </div>
      </div>

      {/* Assignment Question Drawer */}
      <div className="assignment-question-banner">
        <div
          className="question-toggle-head"
          onClick={() => setQuestionCollapsed(c => !c)}
        >
          <strong>Question Statement</strong>
          <button type="button" className="icon-button">
            {questionCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
        {!questionCollapsed && (
          <div className="question-content-box">
            <p>{assignment.question}</p>
          </div>
        )}
      </div>

      {/* Main Coding Workspace */}
      <div className="coding-workspace flex-1" ref={workspaceRef}>
        {/* File Explorer (collapsible) */}
        {showFiles && (
          <FileExplorer
            practical={practical}
            readOnly={isSubmitted}
            onOpen={openFile}
            onSelectFolder={path => setPractical(p => ({ ...p, selectedFolder: path }))}
            onAction={handleFileAction}
            onCollapse={() => setShowFiles(false)}
          />
        )}

        {/* Code Editor Panel */}
        {!outputExpanded && (
          <section className="editor-panel">
            <div className="code-toolbar">
              <span>Code {isSubmitted && <span className="text-xs text-[var(--muted)]">(Read Only)</span>}</span>
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
                  readOnly={isSubmitted}
                  practical={practical}
                  onChange={code =>
                    updatePractical(p => ({
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

        {/* Output Preview */}
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
            modified={modified}
            onRun={run}
            theme={theme}
            isExpanded={outputExpanded}
            onToggleExpand={() => setOutputExpanded(exp => !exp)}
          />
        </div>
      </div>

      {/* Confirmation Modal: Final Submit */}
      {showConfirmSubmit && (
        <dialog className="modal" open>
          <div className="modal-heading">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              <h2>Confirm Final Submission</h2>
            </div>
            <button type="button" className="icon-button" onClick={() => setShowConfirmSubmit(false)}>✕</button>
          </div>
          <div className="modal-description">
            <p><strong>Are you sure you want to submit your assignment?</strong></p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This is your <strong>one-time final submission</strong>. Once submitted, your code snapshot will be saved permanently, and you will not be able to make further edits or resubmit.
            </p>
          </div>

          {submitError && (
            <div className="form-error mb-3">
              {submitError}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowConfirmSubmit(false)}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleFinalSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Yes, Submit Solution'}
            </button>
          </div>
        </dialog>
      )}

      {dialog && <Dialog config={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
