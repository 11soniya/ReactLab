import { useEffect, useRef, useState } from 'react';

async function request(path, body, method) {
  const isPost = body !== undefined || method === 'POST';
  const response = await fetch(`/api/github/${path}`, {
    method: method || (isPost ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'GitHub request failed.');
  }
  return result;
}

export function useGitHub(saved, remember) {
  const rememberRef = useRef(remember);
  rememberRef.current = remember;

  const [state, setState] = useState({
    configured: false,
    authorized: false,
    connected: false,
    loading: true,
    user: null,
    connection: saved || null,
    installUrl: null
  });

  const [status, setStatus] = useState('Checking connection…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncingPracticalId, setSyncingPracticalId] = useState(null);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  async function refresh() {
    try {
      const result = await request('status');
      setState(s => ({
        ...s,
        ...result,
        loading: false
      }));
      if (result.connection) {
        rememberRef.current?.(result.connection);
      }
      setStatus(
        result.connected
          ? `Connected to ${result.connection.owner}/${result.connection.name}`
          : result.authorized
            ? 'Choose a repository'
            : 'Not connected'
      );
    } catch {
      setState(s => ({ ...s, loading: false, configured: false }));
      setStatus('GitHub unavailable');
      setError('GitHub connection is unavailable. Please check your setup.');
    }
  }

  useEffect(() => {
    refresh();
    const url = new URL(location.href);
    if (url.searchParams.has('github')) {
      const statusParam = url.searchParams.get('github');
      if (statusParam === 'denied') {
        setError('GitHub authorization was cancelled. Your code is saved locally.');
      } else if (statusParam === 'authorized') {
        refresh();
      }
      url.searchParams.delete('github');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await request('start', {}, 'POST');
      if (result.url) {
        location.assign(result.url);
      } else {
        throw new Error('Failed to get GitHub authorization URL.');
      }
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function fetchRepos() {
    setError('');
    try {
      const result = await request('repos');
      return result.repositories || [];
    } catch (e) {
      setError(e.message);
      return [];
    }
  }

  async function selectRepository(payload) {
    setBusy(true);
    setError('');
    try {
      const result = await request('repository', payload);
      setState(s => ({
        ...s,
        connected: true,
        connection: result.connection
      }));
      if (result.connection) {
        rememberRef.current?.(result.connection);
      }
      await refresh();
      return result.connection;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }

  // Manual "Update on GitHub"
  async function updatePractical(practical) {
    if (!state.connected || !practical) return null;
    setSyncingPracticalId(practical.id);
    setError('');
    try {
      const result = await request('sync', { practical });
      setLastSyncResult({
        practicalId: practical.id,
        unchanged: result.unchanged,
        sha: result.sha,
        url: result.url,
        folderUrl: result.folderUrl,
        message: result.message || (result.unchanged ? 'GitHub is already up to date' : 'Updated on GitHub'),
        timestamp: Date.now()
      });
      return result;
    } catch (e) {
      const msg = `Could not update GitHub: ${e.message}. Your practical is still saved locally.`;
      setError(msg);
      throw new Error(msg);
    } finally {
      setSyncingPracticalId(null);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      await request('disconnect', {}, 'POST');
      setState(s => ({
        ...s,
        authorized: false,
        connected: false,
        user: null,
        connection: null
      }));
      rememberRef.current?.(null);
      setStatus('Disconnected');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return {
    ...state,
    status,
    error,
    busy,
    syncingPracticalId,
    lastSyncResult,
    connect,
    refresh,
    fetchRepos,
    selectRepository,
    updatePractical,
    disconnect
  };
}
