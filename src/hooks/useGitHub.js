import { useEffect, useRef, useState } from 'react';
async function request(path, body) {
  const response = await fetch(`/api/github/${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.message || 'GitHub connection failed.'); return result;
}
export function useGitHub(saved, remember) {
  const queue = useRef(Promise.resolve()); const epoch = useRef(0); const stateRef = useRef({}); const rememberRef = useRef(remember); rememberRef.current = remember;
  const [state, setState] = useState({ configured: false, authorized: false, connected: false, loading: true });
  const [status, setStatus] = useState('Checking connection…'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  stateRef.current = state;
  async function refresh() {
    try { const result = await request('status'); setState({ ...result, loading: false }); if (result.connection) rememberRef.current(result.connection); setStatus(result.connected ? 'Connected to GitHub' : result.authorized ? 'Finish GitHub setup' : 'Not connected'); }
    catch { setState(s => ({ ...s, loading: false, configured: false })); setStatus('GitHub unavailable'); setError('GitHub connection is unavailable. Please retry.'); }
  }
  useEffect(() => { refresh(); const url = new URL(location.href); if (url.searchParams.has('github')) { if (url.searchParams.get('github') === 'denied') setError('GitHub authorization was cancelled. Your code is still saved locally.'); url.searchParams.delete('github'); history.replaceState(null, '', url.pathname + url.search + url.hash); } }, []);
  async function connect(name) { setBusy(true); setError(''); try { const result = await request('start', { name }); location.assign(result.url); } catch (e) { setError(e.message); setBusy(false); } }
  async function createRepository() { setBusy(true); setError(''); try { const result = await request('repository', {}); rememberRef.current(result.connection); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function sync(practical) {
    if (!stateRef.current.connected) return;
    const generation = epoch.current; const snapshot = structuredClone(practical);
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (generation !== epoch.current || !stateRef.current.connected) return;
      setStatus('Syncing…'); setError('');
      try { const result = await request('sync', { practical: snapshot }); if (generation === epoch.current) setStatus(result.unchanged ? 'Up to date' : 'Synced to GitHub'); }
      catch (e) { if (generation === epoch.current) { setStatus('Sync failed'); setError(e.message); } }
    });
  }
  async function disconnect() { epoch.current++; setBusy(true); try { const result = await request('disconnect', {}); setState(s => ({ ...s, connected: false, authorized: false })); setStatus('Disconnected'); setError(result.revoked ? '' : 'Disconnected locally. You can also revoke access in GitHub Settings → Applications.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return { ...state, connect, createRepository, refresh, sync, disconnect, busy, status, error };
}
