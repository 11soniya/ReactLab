import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GA_MEASUREMENT_ID,
  CONSENT_STORAGE_KEY,
  ConsentState,
  getConsentStatus,
  setConsentStatus,
  isAnalyticsAllowedEnvironment,
  getSanitizedLocation,
  trackSafeEvent,
  trackPageView,
  initAnalytics,
  isGaDisabled,
  _resetAnalyticsState
} from '../src/utils/analytics.js';

test('GA_MEASUREMENT_ID matches required Google Analytics measurement ID', () => {
  assert.equal(GA_MEASUREMENT_ID, 'G-511B3F1JBX');
});

test('Consent status management works with in-memory storage', () => {
  const map = new Map();
  const mockStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v))
  };

  // Initially pending when not set
  assert.equal(getConsentStatus(mockStorage), ConsentState.PENDING);

  // Set to granted
  setConsentStatus(ConsentState.GRANTED, mockStorage);
  assert.equal(getConsentStatus(mockStorage), ConsentState.GRANTED);
  assert.equal(mockStorage.getItem(CONSENT_STORAGE_KEY), 'granted');

  // Set to denied
  setConsentStatus(ConsentState.DENIED, mockStorage);
  assert.equal(getConsentStatus(mockStorage), ConsentState.DENIED);
  assert.equal(mockStorage.getItem(CONSENT_STORAGE_KEY), 'denied');
});

test('isAnalyticsAllowedEnvironment rejects localhost and development environments', () => {
  const prodEnv = { PROD: true };
  const devEnv = { PROD: false };

  // 1. Dev mode -> disallowed
  assert.equal(
    isAnalyticsAllowedEnvironment(devEnv, { hostname: 'reactlab.onrender.com', protocol: 'https:' }),
    false
  );

  // 2. Localhost hostnames in production -> disallowed
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1', 'my-pc.local', 'test.localhost']) {
    assert.equal(
      isAnalyticsAllowedEnvironment(prodEnv, { hostname: host, protocol: 'http:' }),
      false,
      `Host ${host} should be disallowed`
    );
  }

  // 3. file: protocol -> disallowed
  assert.equal(
    isAnalyticsAllowedEnvironment(prodEnv, { hostname: '', protocol: 'file:' }),
    false
  );

  // 4. Public production hosts (Render, custom domain) -> allowed
  assert.equal(
    isAnalyticsAllowedEnvironment(prodEnv, { hostname: 'reactlab.onrender.com', protocol: 'https:' }),
    true
  );
  assert.equal(
    isAnalyticsAllowedEnvironment(prodEnv, { hostname: 'reactlab.dev', protocol: 'https:' }),
    true
  );
  assert.equal(
    isAnalyticsAllowedEnvironment(prodEnv, { hostname: 'custom-domain.org', protocol: 'https:' }),
    true
  );
});

test('getSanitizedLocation strips OAuth tokens, query params, and hashes without hardcoding domains', () => {
  const mockLocation = {
    origin: 'https://reactlab-deployment.onrender.com',
    protocol: 'https:',
    host: 'reactlab-deployment.onrender.com',
    pathname: '/',
    search: '?github=authorized&code=gho_secret12345&state=oauth_state_xyz',
    hash: '#access_token=secret_token'
  };

  const sanitized = getSanitizedLocation(mockLocation);
  assert.equal(sanitized.page_location, 'https://reactlab-deployment.onrender.com/');
  assert.equal(sanitized.page_path, '/');
  assert.equal(sanitized.page_title, 'ReactLab — Your practical workspace');
  assert.equal(sanitized.page_location.includes('secret'), false);
  assert.equal(sanitized.page_location.includes('code='), false);
  assert.equal(sanitized.page_location.includes('github='), false);
});

test('trackSafeEvent strips sensitive parameters (code, questions, filenames, tokens)', (t) => {
  const recordedEvents = [];
  const fakeGtag = (...args) => {
    recordedEvents.push(args);
  };

  // Mock globals
  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;

  const storageMap = new Map();
  storageMap.set(CONSENT_STORAGE_KEY, 'granted');

  globalThis.window = {
    gtag: fakeGtag,
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    location: {
      origin: 'https://reactlab.onrender.com',
      hostname: 'reactlab.onrender.com',
      protocol: 'https:',
      pathname: '/'
    },
    dispatchEvent: () => {}
  };

  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
  });

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  trackSafeEvent('run_practical', {
    duration_ms: 120,
    practical_code: 'export default () => <div>Student secret code</div>',
    question_text: 'Secret homework question',
    filename: 'SecretComponent.jsx',
    file_path: '/src/SecretComponent.jsx',
    github_token: 'ghp_secretToken12345',
    user_email: 'student@example.com'
  });

  process.env.NODE_ENV = prevEnv;

  assert.equal(recordedEvents.length, 1);
  const [eventType, eventName, payload] = recordedEvents[0];
  assert.equal(eventType, 'event');
  assert.equal(eventName, 'run_practical');
  assert.deepEqual(payload, { duration_ms: 120 });
  assert.equal(payload.practical_code, undefined);
  assert.equal(payload.question_text, undefined);
  assert.equal(payload.filename, undefined);
  assert.equal(payload.github_token, undefined);
});

test('trackPageView deduplicates initial page_view and requires consent', (t) => {
  _resetAnalyticsState();
  const recordedEvents = [];
  const fakeGtag = (...args) => {
    recordedEvents.push(args);
  };

  const originalWindow = globalThis.window;
  const storageMap = new Map();

  globalThis.window = {
    gtag: fakeGtag,
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    location: {
      origin: 'https://reactlab.onrender.com',
      hostname: 'reactlab.onrender.com',
      protocol: 'https:',
      pathname: '/'
    },
    dispatchEvent: () => {}
  };

  t.after(() => {
    globalThis.window = originalWindow;
    _resetAnalyticsState();
  });

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  // 1. When consent is pending/denied -> nothing tracked
  const deniedTrack = trackPageView();
  assert.equal(deniedTrack, false);
  assert.equal(recordedEvents.length, 0);

  // 2. When consent is granted -> tracks page view
  storageMap.set(CONSENT_STORAGE_KEY, 'granted');
  const firstTrack = trackPageView();
  assert.equal(firstTrack, true);
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0][0], 'event');
  assert.equal(recordedEvents[0][1], 'page_view');
  assert.equal(recordedEvents[0][2].page_title, 'ReactLab — Your practical workspace');
  assert.equal(recordedEvents[0][2].page_location, 'https://reactlab.onrender.com/');

  // 3. Second call -> deduplicated, does not send duplicate event
  const duplicateTrack = trackPageView();
  assert.equal(duplicateTrack, false);
  assert.equal(recordedEvents.length, 1);

  process.env.NODE_ENV = prevEnv;
});

test('Clicking Decline strictly prevents scripts and measurement requests including cookieless pings', (t) => {
  _resetAnalyticsState();
  const appendedElements = [];
  const storageMap = new Map();
  const mockGtagCalls = [];

  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;

  globalThis.document = {
    getElementById: (id) => null,
    createElement: (tag) => ({ tag, id: '', src: '', async: false }),
    head: {
      appendChild: (el) => appendedElements.push(el)
    }
  };

  globalThis.window = {
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    location: {
      origin: 'https://reactlab.onrender.com',
      hostname: 'reactlab.onrender.com',
      protocol: 'https:',
      pathname: '/'
    },
    dispatchEvent: () => {}
  };

  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    _resetAnalyticsState();
  });

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  // User explicitly declines
  setConsentStatus(ConsentState.DENIED, globalThis.window.localStorage);

  // 1. Consent status is denied
  assert.equal(getConsentStatus(globalThis.window.localStorage), ConsentState.DENIED);

  // 2. Opt-out property is set
  assert.equal(isGaDisabled(), true);

  // 3. Script element was NOT appended to head
  assert.equal(appendedElements.length, 0);

  // 4. initAnalytics fails and does not inject script
  const initialized = initAnalytics();
  assert.equal(initialized, false);
  assert.equal(appendedElements.length, 0);

  // 5. trackPageView and trackSafeEvent are blocked
  assert.equal(trackPageView(), false);
  assert.equal(trackSafeEvent('some_action'), false);

  process.env.NODE_ENV = prevEnv;
});

test('Disabling analytics later stops further tracking and removes script element', (t) => {
  _resetAnalyticsState();
  const storageMap = new Map();
  const gtagCalls = [];
  let scriptRemoved = false;

  const mockScript = {
    id: 'ga4-gtag-script',
    parentNode: {
      removeChild: (el) => {
        if (el === mockScript) scriptRemoved = true;
      }
    }
  };

  const originalWindow = globalThis.window;
  const originalDoc = globalThis.document;

  globalThis.document = {
    getElementById: (id) => (id === 'ga4-gtag-script' ? mockScript : null),
    createElement: (tag) => ({ tag, id: '', src: '', async: false }),
    head: {
      appendChild: () => {}
    }
  };

  globalThis.window = {
    gtag: (...args) => gtagCalls.push(args),
    dataLayer: [],
    localStorage: {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v))
    },
    location: {
      origin: 'https://reactlab.onrender.com',
      hostname: 'reactlab.onrender.com',
      protocol: 'https:',
      pathname: '/'
    },
    dispatchEvent: () => {}
  };

  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDoc;
    _resetAnalyticsState();
  });

  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  // Initially granted
  storageMap.set(CONSENT_STORAGE_KEY, 'granted');
  assert.equal(trackPageView(), true);
  assert.equal(gtagCalls.length, 1);

  // User later turns off / disables analytics
  setConsentStatus(ConsentState.DENIED, globalThis.window.localStorage);

  // 1. Consent is now DENIED
  assert.equal(getConsentStatus(globalThis.window.localStorage), ConsentState.DENIED);

  // 2. Global ga-disable flag is active
  assert.equal(isGaDisabled(), true);

  // 3. Script tag was removed from DOM
  assert.equal(scriptRemoved, true);

  // 4. gtag was called with consent update denied
  const consentUpdateCall = gtagCalls.find(c => c[0] === 'consent' && c[1] === 'update');
  assert(consentUpdateCall);
  assert.equal(consentUpdateCall[2].analytics_storage, 'denied');

  // 5. Subsequent tracking attempts are 100% blocked
  const trackingBlocked1 = trackPageView();
  const trackingBlocked2 = trackSafeEvent('run_practical');
  assert.equal(trackingBlocked1, false);
  assert.equal(trackingBlocked2, false);

  process.env.NODE_ENV = prevEnv;
});
