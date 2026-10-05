import { Component, useMemo, useRef } from 'react';
import { Play, RotateCw } from 'lucide-react';
import { generatePreviewHtml } from '../utils/localRunner';

class PreviewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error: error.message }; }
  render() {
    return this.state.error ? (
      <div className="preview-error">
        <h3>Preview could not start</h3>
        <p>{this.state.error}</p>
        <p>Your code is safe. Click Run to retry.</p>
      </div>
    ) : this.props.children;
  }
}

export default function PreviewPanel({ snapshot, onRun, modified, theme = 'light' }) {
  const container = useRef();
  const html = useMemo(() => {
    if (!snapshot) return '';
    return generatePreviewHtml(snapshot.practical, snapshot.runId, theme);
  }, [snapshot, theme]);

  return (
    <section className="preview-panel" ref={container}>
      <div className="panel-title">
        <span>Output</span>
        <span className="preview-status">{snapshot && modified ? 'Run to see changes' : ''}</span>
        {snapshot && (
          <button className="icon-button" title="Refresh preview" aria-label="Refresh preview" onClick={onRun}>
            <RotateCw size={15} />
          </button>
        )}
      </div>
      <div className="preview-body">
        {snapshot ? (
          <PreviewBoundary key={snapshot.runId}>
            <iframe
              key={snapshot.runId}
              srcDoc={html}
              title="ReactLab Preview"
              className="preview-frame"
              sandbox="allow-scripts allow-same-origin allow-modals"
              style={{ width: '100%', height: '100%', border: 0, display: 'block', background: 'transparent' }}
            />
          </PreviewBoundary>
        ) : (
          <div className="empty-preview">
            <div className="preview-symbol"><Play size={22} /></div>
            <h3>Your output appears here</h3>
            <p>Click Run to try your code.</p>
          </div>
        )}
      </div>
    </section>
  );
}
