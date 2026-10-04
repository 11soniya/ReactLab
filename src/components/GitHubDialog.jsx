import { useEffect, useRef, useState } from 'react';
import { Github, X, Check, ExternalLink } from 'lucide-react';
export default function GitHubDialog({ github, saved, practicals, onClose }) {
  const ref = useRef(); const [error, setError] = useState('');
  useEffect(() => { const previous = document.activeElement; ref.current.showModal(); return () => previous?.focus(); }, []);
  async function submit(event) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); setError('');
    try { await github.connect(values.get('token').trim(), values.get('repo').trim()); form.reset(); practicals.forEach(github.sync); }
    catch (e) { setError(e.message); }
  }
  return <dialog ref={ref} className="modal github-dialog" onCancel={onClose}><div className="modal-heading"><Github size={25}/><button className="icon-button" aria-label="Close GitHub dialog" onClick={onClose}><X size={20}/></button></div><h2>{github.connected ? 'Your practice, backed up.' : 'Connect GitHub'}</h2>
    {github.connected ? <><p className="modal-description">Your practicals sync to <a href={saved.url} target="_blank" rel="noreferrer">{saved.owner}/{saved.name} <ExternalLink size={13}/></a>.</p><div className="connection-summary"><Check size={18}/><div><strong>{github.status}</strong><p>Changed code is committed after the preview renders. Unchanged runs do not create extra commits.</p></div></div>{github.error && <p className="form-error" role="alert">{github.error}</p>}<div className="modal-actions"><button className="secondary-button" onClick={github.disconnect}>Disconnect</button><button className="primary-button" onClick={() => practicals.forEach(github.sync)}>Sync all now</button></div></> : <form onSubmit={submit}>
      <p className="modal-description">One private repository. A folder for every practical. Your first connection copies all practicals; later changes sync after a successful run.</p>
      <label>Repository name<input name="repo" defaultValue={saved?.name || 'reactlab-practicals'} required pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,99}"/></label>
      <label>GitHub access token<input autoFocus name="token" type="password" autoComplete="off" spellCheck={false} required placeholder="Paste your GitHub token"/></label>
      <details className="github-help"><summary>How do I get a token?</summary><p>Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">fine-grained token</a> for your account. Allow repository creation (Administration: read/write) and Contents: read/write. Creating a new repository requires access to all repositories; after creation, you can restrict the token to this repository. Alternatively, a classic token needs the repo scope.</p><p>Your token goes only to api.github.com and stays in memory for this tab. Reconnect after refreshing. Never paste tokens into a practical.</p></details>
      <p className="github-note">Commits use your GitHub identity on the default branch. To show private activity on your graph, enable <a href="https://docs.github.com/en/account-and-profile/how-tos/contribution-settings/showing-your-private-contributions-and-achievements-on-your-profile" target="_blank" rel="noreferrer">private contributions</a>. GitHub may take up to 24 hours to update.</p>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={github.busy}>{github.busy ? 'Connecting…' : saved ? 'Connect & sync' : 'Create repository & sync'}</button></div>
    </form>}
  </dialog>;
}
