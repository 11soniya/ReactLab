import { useRef, useState } from 'react';
import { connectRepository, syncPractical } from '../utils/github';
export function useGitHub(saved, remember) {
  const session = useRef(null); const queue = useRef(Promise.resolve()); const epoch = useRef(0);
  const [connected, setConnected] = useState(false); const [status, setStatus] = useState(saved ? 'Reconnect to sync' : 'Not connected'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function connect(token, name) {
    setBusy(true); setError('');
    try { const connection = await connectRepository(token, name, saved); session.current = { token, connection }; epoch.current++; remember(connection); setConnected(true); setStatus('Connected'); return connection; }
    catch (e) { setError(e.message); throw e; } finally { setBusy(false); }
  }
  function sync(practical) {
    const current = session.current; if (!current) return;
    const generation = epoch.current; const snapshot = structuredClone(practical);
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (generation !== epoch.current) return;
      setStatus('Syncing…'); setError('');
      try { const result = await syncPractical(current.token, current.connection, snapshot); if (generation === epoch.current) setStatus(result.unchanged ? 'Up to date' : 'Synced to GitHub'); }
      catch (e) { if (generation === epoch.current) { setStatus('Sync failed'); setError(e.message); } }
    });
  }
  function disconnect() { epoch.current++; session.current = null; setConnected(false); setStatus('Reconnect to sync'); setError(''); }
  return { connect, sync, disconnect, connected, busy, status, error };
}
