import { useEffect, useRef } from 'react';
import { ShieldCheck, X, CheckCircle2, XCircle } from 'lucide-react';
import { ConsentState } from '../utils/analytics.js';

export default function PrivacyDialog({ consentStatus, onUpdateConsent, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);

  const isGranted = consentStatus === ConsentState.GRANTED;

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="modal privacy-dialog"
      aria-labelledby="privacy-dialog-title"
    >
      <div className="modal-heading">
        <div className="modal-icon">
          <ShieldCheck size={20} />
        </div>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <h2 id="privacy-dialog-title">Privacy & Analytics Preferences</h2>
      <p className="modal-description">
        ReactLab stores your practicals locally in your browser. We do not send your code or questions to Google Analytics. If you choose to sync a practical to GitHub, its files and question are sent to GitHub for that purpose.
      </p>

      <div className="privacy-feature-list">
        <div className="privacy-feature-card">
          <h4>
            <CheckCircle2 size={15} style={{ color: 'var(--accent)' }} /> What GA4 processes (when enabled)
          </h4>
          <ul>
            <li>Aggregated page view counts and session duration</li>
            <li>Pseudonymous client & browser identifiers</li>
            <li>Technical device, OS, and screen resolution data</li>
            <li>Anonymized IP addresses for coarse regional metrics</li>
          </ul>
        </div>

        <div className="privacy-feature-card">
          <h4>
            <XCircle size={15} style={{ color: 'var(--danger)' }} /> What is NOT sent to analytics
          </h4>
          <ul>
            <li>Your React code and component files</li>
            <li>Your practical questions, notes, or prompts</li>
            <li>Local file names or workspace directory layout</li>
            <li>GitHub access tokens or account credentials</li>
            <li>Direct personal identifiers (names, emails)</li>
          </ul>
        </div>
      </div>

      <div className="privacy-status-box">
        <span>Current status:</span>
        <span className={`privacy-badge ${isGranted ? 'granted' : 'denied'}`}>
          {isGranted ? '✓ Analytics Enabled' : '✕ Analytics Disabled'}
        </span>
      </div>

      <div className="sidebar-note" style={{ padding: '12px 4px 0', fontSize: '11px', lineHeight: '1.6' }}>
        <span>
          <strong>Data transparency:</strong> When declined or disabled, the <code>ga-disable</code> opt-out flag and consent checks prevent all subsequent measurement. Disabling analytics stops future application-generated tracking, but previously transmitted data remains subject to Google's retention and deletion policies.
        </span>
      </div>

      <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
        {isGranted ? (
          <button
            type="button"
            className="secondary-button danger-text"
            onClick={() => onUpdateConsent(ConsentState.DENIED)}
          >
            Disable Analytics
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            onClick={() => onUpdateConsent(ConsentState.GRANTED)}
          >
            Enable Analytics
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}
