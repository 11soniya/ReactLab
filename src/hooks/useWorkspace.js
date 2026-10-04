import { useEffect, useRef, useState } from 'react';
import { createStarter } from '../utils/practicals';
import { loadWorkspace, saveWorkspace } from '../utils/storage';
function initialize() {
  try { const saved = loadWorkspace(); if (saved) return { data: saved, error: null }; const starter = createStarter(); return { data: { version: 1, practicals: [starter], activeId: starter.id, layout: { sidebar: true, files: true, question: true, previewWidth: 38 } }, error: null }; }
  catch (error) { return { data: { version: 1, practicals: [], activeId: null, layout: {} }, error: error.message }; }
}
export function useWorkspace() {
  const [initial] = useState(initialize); const [data, setData] = useState(initial.data); const [status, setStatus] = useState(initial.error ? 'Save unavailable' : 'Saved locally'); const latest = useRef(data);
  latest.current = data;
  const persist = () => { if (initial.error) return; try { saveWorkspace(latest.current); setStatus('Saved locally'); } catch { setStatus('Save failed — browser storage is full or unavailable'); } };
  useEffect(() => { if (initial.error) return; setStatus('Saving…'); const timer = setTimeout(persist, 450); return () => clearTimeout(timer); }, [data]);
  useEffect(() => { const flush = () => persist(); const hide = () => { if (document.visibilityState === 'hidden') flush(); }; window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hide); return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hide); }; }, []);
  const active = data.practicals.find(p => p.id === data.activeId) || data.practicals[0];
  const update = (fn, id = active?.id) => setData(d => ({ ...d, practicals: d.practicals.map(p => p.id === id ? { ...fn(p), updatedAt: new Date().toISOString() } : p) }));
  const setLayout = values => setData(d => ({ ...d, layout: { ...d.layout, ...values } }));
  return { data, setData, active, update, status, loadError: initial.error, persist, setLayout };
}
