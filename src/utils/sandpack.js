export function createSandpackFiles(practical, runId) {
  const files = Object.fromEntries(Object.entries(practical.files).map(([path, file]) => [path, { code: file.code }]));
  const runnerCode = `import React, { Component, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './src/App.jsx';

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#bd424b' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600' }}>Render Error</h3>
          <pre style={{ margin: 0, padding: '12px', background: '#fff0f0', border: '1px solid #fed7d7', borderRadius: '6px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#9b2c2c' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function PracticalRunner() {
  ${runId ? `useEffect(() => {
    try {
      window.parent.postMessage({ type: 'reactlab-rendered', runId: ${JSON.stringify(runId)} }, '*');
    } catch (e) {}
  }, []);` : ''}
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

const container = document.getElementById('root') || document.body;
createRoot(container).render(<PracticalRunner />);
`;

  const htmlCode = '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1" /><title>ReactLab</title></head><body><div id="root"></div></body></html>';

  files['/index.js'] = { hidden: true, code: runnerCode };
  files['/src/index.js'] = { hidden: true, code: runnerCode };
  files['/App.js'] = { hidden: true, code: "export { default } from './src/App.jsx';" };
  files['/public/index.html'] = { hidden: true, code: htmlCode };
  files['/index.html'] = { hidden: true, code: htmlCode };
  return files;
}

