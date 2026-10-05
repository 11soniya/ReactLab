import { useEffect, useRef, useState } from 'react';
import { X, FileCode2, FolderPlus, Plus, Trash2, HardDriveDownload } from 'lucide-react';

export default function Dialog({ config, onClose }) {
  const [error, setError] = useState('');
  const [starter, setStarter] = useState('simple');
  const ref = useRef();

  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);

  function submit(event) {
    event.preventDefault();
    try {
      config.onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
      onClose();
    } catch (e) {
      setError(e.message);
    }
  }

  if (config.type === 'import_choice') {
    return (
      <dialog
        ref={ref}
        onCancel={onClose}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        className="modal"
      >
        <div className="modal-heading">
          <div className="modal-icon">
            <HardDriveDownload size={20} />
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <h2>{config.title || 'Import ReactLab backup'}</h2>
        <p className="modal-description">{config.description}</p>

        <div className="github-note" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>Merge</strong> adds new practicals safely without touching your existing ones. <strong>Replace</strong> removes current local practicals and loads only the backup.
          </p>
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 9 }}>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                try {
                  config.onReplace();
                  onClose();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Replace existing
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                try {
                  config.onMerge();
                  onClose();
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Merge with existing
            </button>
          </div>
        </div>
        {error && <p role="alert" className="form-error" style={{ marginTop: 12 }}>{error}</p>}
      </dialog>
    );
  }

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="modal"
    >
      <form onSubmit={submit}>
        <div className="modal-heading">
          <div className="modal-icon">
            {config.danger ? <Trash2 size={20} /> : config.type === 'folder' ? <FolderPlus size={20} /> : <FileCode2 size={20} />}
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <h2>{config.title}</h2>
        <p className="modal-description">{config.description || 'A little space for your next big idea.'}</p>
        {config.type === 'practical' ? (
          <>
            <label>Practical title<input autoFocus required maxLength={100} name="title" placeholder="e.g. Temperature Controller" /></label>
            <label>Question<textarea name="question" rows={3} placeholder="What are you building? Add the original question…" /></label>
            <label>Starter type</label>
            <div className="starter-options">
              <label className={starter === 'simple' ? 'chosen' : ''}>
                <input type="radio" name="starter" value="simple" defaultChecked onChange={() => setStarter('simple')} />
                <strong>Simple</strong>
                <span>App + a component</span>
              </label>
              <label className={starter === 'blank' ? 'chosen' : ''}>
                <input type="radio" name="starter" value="blank" onChange={() => setStarter('blank')} />
                <strong>Blank workspace</strong>
                <span>Make it your own</span>
              </label>
            </div>
            {starter === 'simple' && (
              <label>Main component name
                <input name="component" defaultValue="Counter" required pattern="[A-Z][A-Za-z0-9_]*" title="Start with a capital letter; use letters, numbers, or underscores." />
                <small>We’ll create App.jsx and your component in src.</small>
              </label>
            )}
          </>
        ) : config.type === 'question' ? (
          <label>Question<textarea autoFocus name="value" rows={6} defaultValue={config.value} /></label>
        ) : !config.danger && (
          <label>{config.label || 'Name'}<input autoFocus required name="value" defaultValue={config.value || ''} placeholder={config.placeholder || ''} maxLength={200} /></label>
        )}
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button className={config.danger ? 'danger-button' : 'primary-button'} type="submit">
            {config.danger ? <Trash2 size={15} /> : config.type === 'practical' ? <Plus size={15} /> : null}
            {config.submitLabel || (config.danger ? 'Delete' : config.type === 'practical' ? 'Create practical' : 'Save changes')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
