import { Shield } from 'lucide-react';

export default function PrivacyBanner({ onAccept, onDecline, onOpenPrivacySettings }) {
  return (
    <aside className="privacy-banner" role="region" aria-label="Privacy and Analytics Notice">
      <div className="privacy-banner-content">
        <div className="privacy-banner-icon" aria-hidden="true">
          <Shield size={20} />
        </div>
        <div className="privacy-banner-text">
          <strong>Privacy Notice:</strong> ReactLab stores your practicals locally in your browser. We do not send your code or questions to Google Analytics. If you choose to sync a practical to GitHub, its files and question are sent to GitHub for that purpose.
        </div>
      </div>
      <div className="privacy-banner-actions">
        <button
          type="button"
          className="secondary-button privacy-btn-sm"
          onClick={onOpenPrivacySettings}
          title="Learn more about our data practices"
        >
          Privacy Details
        </button>
        <button
          type="button"
          className="secondary-button privacy-btn-sm"
          onClick={onDecline}
          title="Decline analytics tracking"
        >
          Decline
        </button>
        <button
          type="button"
          className="primary-button privacy-btn-sm"
          onClick={onAccept}
          title="Accept analytics"
        >
          Accept
        </button>
      </div>
    </aside>
  );
}
