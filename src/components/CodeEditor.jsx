import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
self.MonacoEnvironment = { getWorker(_, label) { if (label === 'json') return new jsonWorker(); if (label === 'css') return new cssWorker(); if (label === 'typescript' || label === 'javascript') return new tsWorker(); return new editorWorker(); } };
loader.config({ monaco });
monaco.editor.defineTheme('reactlab', { base: 'vs-dark', inherit: true, rules: [{ token: 'comment', foreground: '64716E', fontStyle: 'italic' }, { token: 'string', foreground: 'B7D995' }, { token: 'keyword', foreground: 'C69DDE' }, { token: 'number', foreground: 'E8B786' }], colors: { 'editor.background': '#15171c', 'editorLineNumber.foreground': '#49505C', 'editorLineNumber.activeForeground': '#A5AEBD', 'editor.lineHighlightBackground': '#1B1E25', 'editor.selectionBackground': '#334A45', 'editorCursor.foreground': '#AFE4C2', 'editorIndentGuide.background1': '#252932' } });
monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ jsx: monaco.languages.typescript.JsxEmit.ReactJSX, allowNonTsExtensions: true, allowJs: true, target: monaco.languages.typescript.ScriptTarget.ESNext });
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true });
export default function CodeEditor({ practical, onChange, onRun, onPosition }) {
  const path = practical.activeFile; const language = path.endsWith('.css') ? 'css' : path.endsWith('.json') ? 'json' : 'javascript';
  return <Editor theme="reactlab" path={`${practical.id}${path}`} language={language} value={practical.files[path]?.code || ''} onChange={v => onChange(v ?? '')} loading={<div className="editor-loading">Opening your workspace…</div>} onMount={editor => { editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => window.dispatchEvent(new Event('reactlab-run'))); editor.onDidChangeCursorPosition(e => onPosition(e.position)); }} options={{ fontSize: 13, lineHeight: 23, fontFamily: "'Cascadia Code', 'Consolas', monospace", minimap: { enabled: false }, padding: { top: 20 }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', renderLineHighlight: 'line', overviewRulerBorder: false, hideCursorInOverviewRuler: true, scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 }, bracketPairColorization: { enabled: true } }}/>;
}
