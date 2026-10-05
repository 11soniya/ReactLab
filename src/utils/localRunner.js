import { transform } from 'sucrase';

function dirname(path) {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generatePreviewHtml(practical, runId, theme = 'light') {
  if (!practical || !practical.files) {
    return '<!DOCTYPE html><html><body></body></html>';
  }

  const files = practical.files;
  let compileError = null;
  const compiledModules = {};
  let combinedCss = '';

  for (const [path, fileObj] of Object.entries(files)) {
    const code = fileObj.code || '';
    if (path.endsWith('.css')) {
      combinedCss += `\n/* ${path} */\n` + code;
      compiledModules[path] = 'module.exports = {};';
    } else if (path.endsWith('.json')) {
      try {
        JSON.parse(code);
        compiledModules[path] = `module.exports = ${code};`;
      } catch (err) {
        compiledModules[path] = 'module.exports = {};';
      }
    } else {
      try {
        const transformed = transform(code, {
          transforms: ['jsx', 'imports', 'typescript'],
          jsxRuntime: 'classic',
          production: false
        });
        compiledModules[path] = transformed.code;
      } catch (err) {
        compileError = {
          file: path,
          message: err.message
        };
        break;
      }
    }
  }

  const isDark = theme === 'dark';
  const defaultBg = isDark ? '#191d24' : '#ffffff';
  const defaultColor = isDark ? '#e0e6ee' : '#222b38';

  if (compileError) {
    const cardBg = isDark ? '#2a1a1c' : '#fef2f2';
    const border = isDark ? '#5c2227' : '#fecaca';
    const text = isDark ? '#fca5a5' : '#b91c1c';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: ${defaultBg};
      color: ${defaultColor};
    }
    .error-card {
      background: ${cardBg};
      border: 1px solid ${border};
      border-radius: 8px;
      padding: 16px 20px;
      color: ${text};
    }
    h3 { margin: 0 0 8px; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    p { margin: 0 0 10px; font-size: 13px; opacity: 0.9; }
    pre {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="error-card">
    <h3>⚠️ Syntax / Compile Error</h3>
    <p>File: <strong>${escapeHtml(compileError.file)}</strong></p>
    <pre>${escapeHtml(compileError.message)}</pre>
  </div>
</body>
</html>`;
  }

  const modulesJson = JSON.stringify(compiledModules);
  const fileListJson = JSON.stringify(Object.keys(files));
  const runIdJson = JSON.stringify(runId || '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReactLab Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: ${defaultBg};
      color: ${defaultColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
    }
    #root {
      min-height: 100vh;
    }
    .runtime-error {
      margin: 20px;
      padding: 16px 20px;
      background: ${isDark ? '#2a1a1c' : '#fef2f2'};
      border: 1px solid ${isDark ? '#5c2227' : '#fecaca'};
      border-radius: 8px;
      color: ${isDark ? '#fca5a5' : '#991b1b'};
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
    }
    .runtime-error h3 {
      margin: 0 0 8px;
      font-size: 15px;
      font-weight: 600;
    }
    .runtime-error pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.5;
    }
  </style>
  <style id="student-styles">
    ${combinedCss}
  </style>
</head>
<body>
  <div id="root"></div>

  <script>
    (function() {
      var React = window.parent.React;
      var ReactDOM = window.parent.ReactDOMClient || window.parent.ReactDOM;
      var runId = ${runIdJson};
      var rawModules = ${modulesJson};
      var allFilePaths = ${fileListJson};

      if (!React || !ReactDOM) {
        document.getElementById('root').innerHTML = '<div class="runtime-error"><h3>React Runtime Not Available</h3><p>Could not connect to host React runtime.</p></div>';
        return;
      }

      var cache = {};

      function dirname(path) {
        var parts = path.split('/');
        parts.pop();
        return parts.join('/') || '/';
      }

      function resolvePath(importPath, currentFile) {
        if (importPath === 'react' || importPath === 'react/jsx-runtime') return 'react';
        if (importPath === 'react-dom' || importPath === 'react-dom/client') return 'react-dom';
        
        var baseDir = dirname(currentFile);
        var combined = importPath.startsWith('/') ? importPath : (baseDir === '/' ? '/' + importPath : baseDir + '/' + importPath);
        
        var parts = combined.split('/');
        var stack = [];
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          if (!p || p === '.') continue;
          if (p === '..') stack.pop();
          else stack.push(p);
        }
        var normalized = '/' + stack.join('/');

        if (rawModules[normalized] !== undefined) return normalized;
        var exts = ['.jsx', '.js', '.json', '.css'];
        for (var j = 0; j < exts.length; j++) {
          if (rawModules[normalized + exts[j]] !== undefined) return normalized + exts[j];
        }
        var indices = ['/index.jsx', '/index.js'];
        for (var k = 0; k < indices.length; k++) {
          if (rawModules[normalized + indices[k]] !== undefined) return normalized + indices[k];
        }
        return normalized;
      }

      function customRequire(currentFile) {
        return function(specifier) {
          if (specifier === 'react' || specifier === 'react/jsx-runtime') {
            return React;
          }
          if (specifier === 'react-dom' || specifier === 'react-dom/client') {
            return ReactDOM;
          }
          var resolved = resolvePath(specifier, currentFile);
          if (cache[resolved]) {
            return cache[resolved].exports;
          }
          if (rawModules[resolved] === undefined) {
            throw new Error("Cannot find module '" + specifier + "' (attempted to resolve '" + resolved + "')");
          }
          var module = { exports: {} };
          cache[resolved] = module;
          
          try {
            var fn = new Function('exports', 'require', 'module', 'React', rawModules[resolved]);
            fn(module.exports, customRequire(resolved), module, React);
          } catch (err) {
            delete cache[resolved];
            throw err;
          }
          return module.exports;
        };
      }

      class ErrorBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { hasError: false, error: null };
        }
        static getDerivedStateFromError(error) {
          return { hasError: true, error: error };
        }
        componentDidCatch(error, errorInfo) {
          console.error("Preview runtime error:", error, errorInfo);
        }
        render() {
          if (this.state.hasError) {
            return React.createElement('div', { className: 'runtime-error' },
              React.createElement('h3', null, '⚠️ Runtime Error'),
              React.createElement('pre', null, (this.state.error && this.state.error.message) || String(this.state.error))
            );
          }
          return this.props.children;
        }
      }

      try {
        var entryRequire = customRequire('/src');
        var entryModule = entryRequire('/src/App.jsx');
        var App = entryModule && (entryModule.default || entryModule);

        if (!App || (typeof App !== 'function' && typeof App !== 'object')) {
          throw new Error('Default export from /src/App.jsx must be a React component.');
        }

        var rootContainer = document.getElementById('root');
        var root = ReactDOM.createRoot ? ReactDOM.createRoot(rootContainer) : { render: function(el) { ReactDOM.render(el, rootContainer); } };
        
        function AppWrapper() {
          React.useEffect(function() {
            try {
              if (runId && window.parent) {
                window.parent.postMessage({ type: 'reactlab-rendered', runId: runId }, '*');
              }
            } catch (e) {}
          }, []);

          return React.createElement(ErrorBoundary, null, React.createElement(App, null));
        }

        root.render(React.createElement(AppWrapper, null));
      } catch (err) {
        var rootEl = document.getElementById('root');
        rootEl.innerHTML = '<div class="runtime-error"><h3>⚠️ Execution Error</h3><pre>' + (err.message || String(err)) + '</pre></div>';
      }
    })();
  </script>
</body>
</html>`;
}
