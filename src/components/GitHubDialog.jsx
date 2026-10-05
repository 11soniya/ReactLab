import { useEffect, useRef } from 'react';
import { Github, X, Check, ExternalLink, ShieldCheck } from 'lucide-react';
export default function GitHubDialog({ github, saved, practicals, onClose }) {
  const ref = useRef();
  useEffect(() => { const previous = document.activeElement; ref.current.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} className="modal github-dialog" onCancel={onClose}>
    <div className="modal-heading"><Github size={25}/><button className="icon-button" aria-label="Close GitHub dialog" onClick={onClose}><X size={20}/></button></div>
    <h2>{github.connected ? 'Your practice, backed up.' : 'Connect GitHub'}</h2>
    {github.loading ? <p>Checking your connection…</p> : !github.configured ? <><p className="modal-description">GitHub sign-in is being set up for ReactLab. Your practicals are still saved in this browser.</p><div className="connection-summary"><ShieldCheck size={20}/><p>The owner needs to register the ReactLab GitHub App before connections can be enabled. No personal access token is needed.</p></div><div className="modal-actions"><button className="secondary-button" onClick={github.refresh}>Check again</button><button className="primary-button" onClick={onClose}>Continue practicing</button></div></> : github.connected ? <>
      <p className="modal-description">Syncing to <a href={github.connection.url} target="_blank" rel="noreferrer">{github.connection.owner}/{github.connection.name} <ExternalLink size={13}/></a>.</p><div className="connection-summary"><Check size={18}/><div><strong>{github.status}</strong><p>Changed code is committed after the preview renders. Unchanged runs create no extra commits.</p></div></div><div className="modal-actions"><button className="secondary-button" onClick={github.disconnect} disabled={github.busy}>Disconnect</button><button className="primary-button" onClick={() => practicals.forEach(github.sync)}>Sync all now</button></div>
    </> : github.authorized ? <>
      <p className="modal-description">{github.connection ? 'Choose only your practice repository when installing the ReactLab GitHub App.' : 'GitHub authorization is complete. Now create your private practice repository.'}</p>
      {github.connection && <p className="github-note">Select <strong>{github.connection.owner}/{github.connection.name}</strong>. ReactLab will refuse to sync if the installation includes other repositories.</p>}
      <div className="modal-actions"><button className="secondary-button" onClick={github.disconnect}>Disconnect</button>{github.connection ? <><a className="secondary-button" href={github.installUrl} target="_blank" rel="noreferrer">Choose repository</a><button className="primary-button" onClick={github.refresh}>Check connection</button></> : <button className="primary-button" onClick={github.createRepository} disabled={github.busy}>{github.busy ? 'Creating…' : 'Create practice repository'}</button>}</div>
    </> : <form onSubmit={event => { event.preventDefault(); github.connect(new FormData(event.currentTarget).get('repo').trim()); }}>
      <p className="modal-description">Authorize ReactLab on GitHub, then connect one private repository for your practicals.</p>
      <label>Repository name<input name="repo" defaultValue={saved?.name || 'reactlab-practicals'} required pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,99}"/></label>
      <div className="github-note"><ShieldCheck size={18}/><p>ReactLab requests permission to create your practice repository and read/write its code. It does not need issues, pull requests, workflows, or organization access.</p><p>Authorization happens on github.com. Credentials stay on the server.</p></div>
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={github.busy}><Github size={17}/>{github.busy ? 'Opening GitHub…' : 'Continue with GitHub'}</button></div>
    </form>}
    {github.error && <p className="form-error" role="alert">{github.error}</p>}
  </dialog>;
}
