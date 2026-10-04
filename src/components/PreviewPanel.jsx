import { Component, useEffect, useRef } from 'react';
import { SandpackProvider, SandpackPreview } from '@codesandbox/sandpack-react';
import { Play, RotateCw } from 'lucide-react';
import { createSandpackFiles } from '../utils/sandpack';
class PreviewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="preview-error"><h3>Preview could not start</h3><p>{this.state.error}</p><p>Your code is safe. Click Run to retry.</p></div> : this.props.children; }
}
export default function PreviewPanel({ snapshot, onRun, modified, onReady }) {
  const container = useRef(); const callback = useRef(onReady); callback.current = onReady;
  useEffect(() => {
    let handled = false;
    const ready = event => {
      if (!snapshot || handled || event.data?.type !== 'reactlab-rendered' || event.data.runId !== snapshot.runId) return;
      const frame = container.current?.querySelector('iframe');
      if (!frame || event.source !== frame.contentWindow) return;
      handled = true; callback.current?.(snapshot.practical);
    };
    window.addEventListener('message', ready); return () => window.removeEventListener('message', ready);
  }, [snapshot]);
  return <section className="preview-panel" ref={container}>
    <div className="panel-title"><span>Output</span><span className="preview-status">{snapshot && modified ? 'Run to see changes' : ''}</span>{snapshot && <button className="icon-button" title="Refresh preview" aria-label="Refresh preview" onClick={onRun}><RotateCw size={15}/></button>}</div>
    <div className="preview-body">{snapshot ? <PreviewBoundary key={snapshot.runId}><SandpackProvider template="react" files={createSandpackFiles(snapshot.practical, snapshot.runId)} customSetup={{ entry: '/index.js', dependencies: { react: '18.3.1', 'react-dom': '18.3.1' } }} options={{ autorun: true, recompileMode: 'immediate' }}><SandpackPreview showOpenInCodeSandbox={false} showRefreshButton={false} showNavigator={false} style={{ height: '100%', minHeight: 0 }}/></SandpackProvider></PreviewBoundary> : <div className="empty-preview"><div className="preview-symbol"><Play size={22}/></div><h3>Your output appears here</h3><p>Click Run to try your code.</p></div>}</div>
  </section>;
}
