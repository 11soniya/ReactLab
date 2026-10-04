export function createSandpackFiles(practical) {
  const files = Object.fromEntries(Object.entries(practical.files).map(([path, file]) => [path, { code: file.code }]));
  files['/index.js'] = { hidden: true, code: `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './src/App.jsx';\ncreateRoot(document.getElementById('root')).render(<App />);` };
  files['/public/index.html'] = { hidden: true, code: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div></body></html>' };
  return files;
}
