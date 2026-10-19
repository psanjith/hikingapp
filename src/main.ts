import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import { DEFAULT_VIEW, STALE_FIX_MS } from './config';
import { createBrowserLocationSource } from './location/browserLocationSource';
import type { LocationFix } from './location/types';
import { createMap } from './map/createMap';
import { FollowUser } from './map/followUser';
import { UserLocationLayer } from './map/userLocationLayer';
import { loadLastView, saveLastPosition } from './storage/lastPosition';
import { watchConnectivity } from './ui/connectivity';
import { GpsStatus } from './ui/gpsStatus';
import { RecenterControl } from './ui/recenterControl';
import { registerServiceWorker } from './ui/serviceWorker';
import { showToast } from './ui/toast';

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element;
}

const map = createMap(requireElement('map'), loadLastView() ?? DEFAULT_VIEW);
const location = createBrowserLocationSource();
const userLocation = new UserLocationLayer(map);
const follow = new FollowUser(map);
const gpsStatus = new GpsStatus(requireElement('gps-chip'), requireElement('gps-banner'));

const recenter = new RecenterControl(() => follow.recenter(location.lastFix));
map.addControl(recenter, 'bottom-right');
recenter.setActive(follow.isFollowing);
follow.onChange((following) => recenter.setActive(following));

// --- Live location -----------------------------------------------------------

let lastFixReceivedAt = 0;
let isStale = false;

location.subscribe({
  onFix(fix: LocationFix) {
    // Use our own clock for staleness rather than fix.timestamp, which comes
    // from the device's GPS stack and isn't always in sync with Date.now().
    lastFixReceivedAt = Date.now();
    isStale = false;
    userLocation.update(fix);
    gpsStatus.showFix(fix, false);
    follow.handleFix(fix);
  },
  onError(kind) {
    gpsStatus.showError(kind);
  },
});

// If readings stop arriving (GPS lost, or the browser paused it), grey out the
// dot so nobody trusts a position that might be minutes old.
setInterval(() => {
  const fix = location.lastFix;
  if (!fix || isStale) return;
  if (Date.now() - lastFixReceivedAt > STALE_FIX_MS) {
    isStale = true;
    userLocation.update(fix, true);
    gpsStatus.showFix(fix, true);
  }
}, 5_000);

// Remember the last position when the app is closed or backgrounded.
document.addEventListener('visibilitychange', () => {
  const fix = location.lastFix;
  if (document.visibilityState === 'hidden' && fix) saveLastPosition(fix.lon, fix.lat);
});

// --- Map loading problems ------------------------------------------------------

let warnedMapOffline = false;
map.on('error', () => {
  if (warnedMapOffline || navigator.onLine) return;
  warnedMapOffline = true;
  showToast("Some map areas aren't saved yet. Your location still works without internet.", {
    durationMs: 8000,
  });
});

// --- App shell -------------------------------------------------------------------

watchConnectivity(requireElement('offline-chip'));
registerServiceWorker();
