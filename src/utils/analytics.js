/**
 * Google Analytics 4 (GA4) Integration for ReactLab
 * Measurement ID: G-511B3F1JBX
 *
 * Privacy & Security Guarantees:
 * 1. Disabled on localhost and development environments.
 * 2. Strictly opt-in: No external scripts or cookieless pings before explicit consent.
 * 3. Clicking "Decline" prevents all GA4 measurement requests and prevents script injection.
 * 4. Disabling analytics later instantly halts all future tracking via ga-disable flag, consent update, and DOM script removal.
 * 5. Never transmits student code, questions, filenames, GitHub tokens, or PII.
 * 6. Sanitizes URLs (removes OAuth parameters, tokens, and query strings).
 * 7. Deduplicates page_view events.
 * 8. Dynamic domain compatibility (compatible with Render and custom domains).
 */

export const GA_MEASUREMENT_ID = 'G-511B3F1JBX';
export const CONSENT_STORAGE_KEY = 'reactlab_analytics_consent';

export const ConsentState = {
  GRANTED: 'granted',
  DENIED: 'denied',
  PENDING: 'pending'
};

/**
 * Checks if analytics is permitted to run in the current environment.
 * Disallowed in dev mode and on local hostnames (localhost, 127.0.0.1, ::1, .local, file://).
 */
export function isAnalyticsAllowedEnvironment(customEnv = null, customLocation = null) {
  const env = customEnv || (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : null);
  const loc = customLocation || (typeof window !== 'undefined' ? window.location : null);

  if (!loc) {
    return false;
  }

  // If in Vite dev mode or non-production environment, disable tracking
  if (env && typeof env.PROD !== 'undefined') {
    if (!env.PROD) return false;
  } else if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
    return false;
  }

  const hostname = (loc.hostname || '').toLowerCase();
  const protocol = (loc.protocol || '').toLowerCase();

  const isLocalHost = (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.localhost') ||
    protocol === 'file:'
  );

  return !isLocalHost;
}

/**
 * Retrieves the current analytics consent status.
 * @param {Storage|null} [storage]
 * @returns {'granted' | 'denied' | 'pending'}
 */
export function getConsentStatus(storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage) return ConsentState.DENIED;
  try {
    const stored = storage.getItem(CONSENT_STORAGE_KEY);
    if (stored === ConsentState.GRANTED) return ConsentState.GRANTED;
    if (stored === ConsentState.DENIED) return ConsentState.DENIED;
    return ConsentState.PENDING;
  } catch {
    return ConsentState.DENIED;
  }
}

/**
 * Checks if the global Google Analytics opt-out flag is set on the window.
 */
export function isGaDisabled() {
  if (typeof window === 'undefined') return true;
  return Boolean(window[`ga-disable-${GA_MEASUREMENT_ID}`]);
}

/**
 * Updates the user's analytics consent preference.
 * When set to 'denied':
 * - Sets the official Google Analytics opt-out flag (`window['ga-disable-G-511B3F1JBX'] = true`).
 * - Updates Google Consent Mode to deny all storage.
 * - Removes the gtag script tag from the DOM.
 * - Prevents all future tracking calls and cookieless pings.
 *
 * @param {'granted' | 'denied'} status
 * @param {Storage|null} [storage]
 */
export function setConsentStatus(status, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  const normalized = status === ConsentState.GRANTED ? ConsentState.GRANTED : ConsentState.DENIED;
  if (storage) {
    try {
      storage.setItem(CONSENT_STORAGE_KEY, normalized);
    } catch (err) {
      console.warn('Could not save analytics consent', err);
    }
  }

  if (typeof window !== 'undefined') {
    if (normalized === ConsentState.DENIED) {
      // 1. Set Google Analytics window-level opt-out property to block all data transmission
      window[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

      // 2. Update consent mode to denied
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied'
        });
      }

      // 3. Remove script element from document head if present
      const scriptEl = document.getElementById('ga4-gtag-script');
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }

      isInitialized = false;
      hasTrackedInitialPageView = false;
    } else {
      // Clear opt-out flag when re-enabling
      try {
        delete window[`ga-disable-${GA_MEASUREMENT_ID}`];
      } catch {
        window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
      }

      // If granted and in allowed environment, initialize & track page_view
      if (isAnalyticsAllowedEnvironment()) {
        initAnalytics();
      }
    }

    // Broadcast consent change event for UI reactivity
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('reactlab-consent-change', { detail: normalized }));
    }
  }

  return normalized;
}

let isInitialized = false;
let hasTrackedInitialPageView = false;

/**
 * Reset initialization state (primarily for test environments).
 */
export function _resetAnalyticsState() {
  isInitialized = false;
  hasTrackedInitialPageView = false;
  if (typeof window !== 'undefined') {
    try {
      delete window[`ga-disable-${GA_MEASUREMENT_ID}`];
    } catch {
      window[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
    }
  }
}

/**
 * Sanitizes current URL to guarantee no query parameters (e.g. OAuth tokens, state) or sensitive routes are tracked.
 * @param {Location|null} [customLocation]
 */
export function getSanitizedLocation(customLocation = null) {
  const loc = customLocation || (typeof window !== 'undefined' ? window.location : null);
  if (!loc) {
    return {
      page_location: 'https://reactlab.app/',
      page_path: '/',
      page_title: 'ReactLab — Your practical workspace'
    };
  }

  const origin = loc.origin || (loc.protocol && loc.host ? `${loc.protocol}//${loc.host}` : '');
  const pathname = loc.pathname || '/';

  return {
    page_location: `${origin}${pathname}`,
    page_path: pathname,
    page_title: 'ReactLab — Your practical workspace'
  };
}

/**
 * Initializes the official gtag.js script and sets up Consent Mode v2.
 * Strictly requires that consent is GRANTED and environment is allowed.
 */
export function initAnalytics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  if (!isAnalyticsAllowedEnvironment()) {
    return false;
  }

  const consent = getConsentStatus();
  if (consent !== ConsentState.GRANTED) {
    return false;
  }

  if (isGaDisabled()) {
    return false;
  }

  // Ensure dataLayer exists
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
  }

  // Configure Google Consent Mode v2
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied'
  });

  // Inject official Google Tag script exactly once
  const scriptId = 'ga4-gtag-script';
  let scriptEl = document.getElementById(scriptId);
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = scriptId;
    scriptEl.async = true;
    scriptEl.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(scriptEl);
  }

  if (!isInitialized) {
    window.gtag('js', new Date());
    // Disable automatic page view so we have exact deduplicated control
    window.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true
    });
    isInitialized = true;
  }

  // Track page view exactly once
  trackPageView();
  return true;
}

/**
 * Tracks a sanitized page_view event. Guaranteed deduplication per page load.
 */
export function trackPageView() {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return false;
  }

  if (isGaDisabled() || !isAnalyticsAllowedEnvironment() || getConsentStatus() !== ConsentState.GRANTED) {
    return false;
  }

  if (hasTrackedInitialPageView) {
    return false;
  }

  const { page_location, page_path, page_title } = getSanitizedLocation();

  window.gtag('event', 'page_view', {
    page_title,
    page_location,
    page_path
  });

  hasTrackedInitialPageView = true;
  return true;
}

/**
 * Tracks high-level safe UI events without any code, question text, filenames, or tokens.
 * @param {string} eventName
 * @param {Record<string, any>} [params]
 */
export function trackSafeEvent(eventName, params = {}) {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
      return false;
    }

    if (isGaDisabled() || !isAnalyticsAllowedEnvironment() || getConsentStatus() !== ConsentState.GRANTED) {
      return false;
    }

    // Strictly filter out sensitive parameters
    const forbiddenKeywords = ['code', 'question', 'title', 'filename', 'path', 'token', 'user', 'email', 'secret', 'key'];
    const safeParams = {};

    for (const [key, val] of Object.entries(params)) {
      const lowerKey = key.toLowerCase();
      if (forbiddenKeywords.some(f => lowerKey.includes(f))) {
        continue;
      }
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        safeParams[key] = val;
      }
    }

    window.gtag('event', eventName, safeParams);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a practical has already been opened during the current browser tab session.
 * @param {string} practicalId
 * @param {Storage|null} [storage]
 */
export function isPracticalTrackedInSession(practicalId, storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (!storage || !practicalId) return false;
  try {
    const raw = storage.getItem('reactlab_session_practicals');
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(practicalId);
  } catch {
    return false;
  }
}

/**
 * Marks a practical as opened during the current browser tab session.
 * @param {string} practicalId
 * @param {Storage|null} [storage]
 */
export function markPracticalTrackedInSession(practicalId, storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (!storage || !practicalId) return;
  try {
    const raw = storage.getItem('reactlab_session_practicals');
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && !list.includes(practicalId)) {
      list.push(practicalId);
      storage.setItem('reactlab_session_practicals', JSON.stringify(list));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Checks if a practical was newly created in the current browser tab session.
 * @param {string} practicalId
 * @param {Storage|null} [storage]
 */
export function isPracticalCreatedInSession(practicalId, storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (!storage || !practicalId) return false;
  try {
    const raw = storage.getItem('reactlab_session_created');
    if (!raw) return false;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.includes(practicalId);
  } catch {
    return false;
  }
}

/**
 * Marks a practical as created in the current browser tab session so it is not double-counted as reopened.
 * @param {string} practicalId
 * @param {Storage|null} [storage]
 */
export function markPracticalCreatedInSession(practicalId, storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (!storage || !practicalId) return;
  try {
    const raw = storage.getItem('reactlab_session_created');
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && !list.includes(practicalId)) {
      list.push(practicalId);
      storage.setItem('reactlab_session_created', JSON.stringify(list));
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Tracks practical_reopened once per practical per session (persisting across page reloads in the same tab).
 * @param {string} practicalId
 * @param {Storage|null} [storage]
 */
export function trackPracticalReopen(practicalId, storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (!practicalId) return false;
  if (isPracticalCreatedInSession(practicalId, storage)) return false;
  if (isPracticalTrackedInSession(practicalId, storage)) return false;

  markPracticalTrackedInSession(practicalId, storage);
  return trackSafeEvent('practical_reopened');
}

/**
 * Tracks github_connected once per OAuth authorization session (persisting across browser refreshes).
 * @param {Storage|null} [storage]
 */
export function trackGitHubConnectedOnce(storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (storage) {
    try {
      if (storage.getItem('reactlab_github_connected_tracked')) {
        return false;
      }
      storage.setItem('reactlab_github_connected_tracked', 'true');
    } catch {
      // Continue if storage fails
    }
  }
  return trackSafeEvent('github_connected');
}


