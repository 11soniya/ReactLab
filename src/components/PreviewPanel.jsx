import { Component } from 'react';
import { SandpackProvider, SandpackPreview } from '@codesandbox/sandpack-react';
import { Play, Monitor, RotateCw, Globe, ExternalLink } from 'lucide-react';
import { createSandpackFiles } from '../utils/sandpack';
class PreviewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error: error.message }; }
  render() { return this.state.error ? <div className="preview-error"><h3>Preview could not start</h3><p>{this.state.error}</p><p>Your code is safe. Click Run to retry.</p></div> : this.props.children; }
}
export default function PreviewPanel({ snapshot, onRun, modified }) {
  return <section className="preview-panel"><div className="panel-title"><span><Monitor size={15}/> OUTPUT</span><span className="preview-status">{snapshot ? modified ? 'Changes not run' : 'Preview' : 'Ready when you are'}</span></div><div className="preview-address"><Globe size={13}/><span>reactlab / preview</span><button className="icon-button" title="Refresh preview" aria-label="Refresh preview" onClick={onRun}><RotateCw size={14}/></button></div><div className="preview-body">{snapshot ? <PreviewBoundary key={snapshot.runId}><SandpackProvider template="react" files={createSandpackFiles(snapshot.practical)} customSetup={{ entry: '/index.js', dependencies: { react: '18.3.1', 'react-dom': '18.3.1' } }} options={{ autorun: true, recompileMode: 'immediate' }}><SandpackPreview showOpenInCodeSandbox={false} showRefreshButton={false} showNavigator={false} style={{ height: '100%', minHeight: 0 }} /></SandpackProvider></PreviewBoundary> : <div className="empty-preview"><div className="preview-symbol"><Play size={24}/></div><h3>A place for your ideas<br/>to come to life.</h3><p>Run your practical to see your React<br/>app in action, right here.</p><button className="secondary-button" onClick={onRun}><Play size={14}/> Run practical</button><kbd>Ctrl + Enter</kbd></div>}</div><div className="preview-foot"><span className="runtime-dot"/> Isolated React environment<span>Sandpack</span></div></section>;
}
