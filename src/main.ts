import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import type { VectorTileSource } from 'maplibre-gl';
import { BACKGROUND_WARNING_MS, DEFAULT_VIEW, GPS_RECHECK_AFTER_MS, STALE_FIX_MS } from './config';
import { watchBattery } from './device/battery';
import { ScreenWakeLock } from './device/wakeLock';
import { createBrowserLocationSource } from './location/browserLocationSource';
import { FixWatchdog } from './location/fixWatchdog';
import { GpsDiagnostics } from './location/gpsDiagnostics';
import type { LocationFix } from './location/types';
import { createMap } from './map/createMap';
import { FollowUser } from './map/followUser';
import { RouteLayer } from './map/routeLayer';
import { fitMapTo } from './map/fitBounds';
import { TrackLayer } from './map/trackLayer';
import { UserLocationLayer } from './map/userLocationLayer';
import { createOpfsMapFileStore } from './maps/mapFileStore';
import { OfflineMaps } from './maps/offlineMaps';
import { tileUrl } from './maps/style';
import { HikeHistory } from './history/hikeHistory';
import { TileRouter } from './maps/tileRouter';
import { createIndexedDbHikeStore } from './recording/hikeStore';
import { Recorder } from './recording/recorder';
import { createIndexedDbRouteStore } from './routes/routeStore';
import { Routes } from './routes/routes';
import { loadLastView, saveLastPosition } from './storage/lastPosition';
import { watchConnectivity } from './ui/connectivity';
import { formatDistance, formatDuration } from './ui/format';
import { GpsDetailsPanel } from './ui/gpsDetailsPanel';
import { GpsStatus } from './ui/gpsStatus';
import { HikeBar } from './ui/hikeBar';
import { HikeViewer } from './ui/hikeViewer';
import { HistoryPanel } from './ui/historyPanel';
import { MapsPanel } from './ui/mapsPanel';
import { HIKES_ICON, LOCATE_ICON, MAPS_ICON, MapButtonControl, ROUTES_ICON } from './ui/mapButtonControl';
import { RoutesPanel } from './ui/routesPanel';
import { registerServiceWorker } from './ui/serviceWorker';
import { showToast } from './ui/toast';

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in index.html`);
  return element as T;
}

// --- Map + offline regions -----------------------------------------------------

const tileRouter = new TileRouter();
const map = createMap(requireElement('map'), loadLastView() ?? DEFAULT_VIEW);

// MapLibre caches tiles it has already drawn, including empty ones from areas
// with no map yet. Changing the tile URL's version makes it ask again, e.g.
// right after a region finishes downloading or the internet comes back.
let tileVersion = 0;
function refreshTiles(): void {
  map.getSource<VectorTileSource>('protomaps')?.setTiles([tileUrl(++tileVersion)]);
}

const offlineMaps = new OfflineMaps(createOpfsMapFileStore(), tileRouter, refreshTiles);
const mapsPanel = new MapsPanel(requireElement<HTMLDialogElement>('maps-panel'), offlineMaps);
window.addEventListener('online', refreshTiles);

void offlineMaps.init().then(() => {
  refreshTiles();
  if (!offlineMaps.hasDownloadedRegions) {
    showToast('No offline map yet. Download one before your hike, in case you lose signal.', {
      actionLabel: 'Maps',
      onAction: () => mapsPanel.open(),
      durationMs: 15_000,
    });
  }
});

// --- Imported GPX routes ---------------------------------------------------------

// Map layers are created in drawing order: imported route, then a past hike,
// then the hike being recorded, then (below) the blue dot on top of everything.
const routeLayer = new RouteLayer(map);
const pastHikeLayer = new TrackLayer(map, 'past-hike', '#c2185b'); // Pink: a hike from history.
const trackLayer = new TrackLayer(map, 'recorded-track', '#00838f'); // Teal: the hike in progress.
const routeStore = createIndexedDbRouteStore();
const routes = new Routes(routeStore);
routes.subscribe(() => routeLayer.show(routes.active));
void routes.init();

// --- Live location -----------------------------------------------------------

const location = createBrowserLocationSource();
const userLocation = new UserLocationLayer(map);
const follow = new FollowUser(map);

const routesPanel = new RoutesPanel(requireElement<HTMLDialogElement>('routes-panel'), routes, offlineMaps, {
  focus(route) {
    follow.stop();
    routeLayer.fitTo(route);
  },
  openMaps: () => mapsPanel.open(),
});
const gpsStatus = new GpsStatus(requireElement('gps-chip'), requireElement('gps-banner'));
const gpsDiagnostics = new GpsDiagnostics();

// Bottom-right buttons. MapLibre stacks bottom controls upwards, so the one
// added last sits on top: locate (most used) at the bottom, then Maps, Routes, Hikes.
const recenter = new MapButtonControl({
  label: 'Centre map on my location',
  icon: LOCATE_ICON,
  className: 'locate-btn',
  onClick: () => follow.recenter(location.lastFix),
});
map.addControl(recenter, 'bottom-right');
map.addControl(
  new MapButtonControl({
    label: 'Offline maps',
    icon: MAPS_ICON,
    caption: 'Maps',
    onClick: () => mapsPanel.open(),
  }),
  'bottom-right',
);
map.addControl(
  new MapButtonControl({
    label: 'Trail routes (GPX)',
    icon: ROUTES_ICON,
    caption: 'Routes',
    onClick: () => routesPanel.open(),
  }),
  'bottom-right',
);
map.addControl(
  new MapButtonControl({
    label: 'My hikes',
    icon: HIKES_ICON,
    caption: 'Hikes',
    // Declared further down; only called on tap, long after startup.
    onClick: () => historyPanel.open(),
  }),
  'bottom-right',
);
recenter.setActive(follow.isFollowing);
follow.onChange((following) => recenter.setActive(following));

// If readings stop arriving, first ask for a fresh one; only if that fails too,
// grey out the dot so nobody trusts a position that might be minutes old.
const watchdog = new FixWatchdog({
  recheckAfterMs: GPS_RECHECK_AFTER_MS,
  staleAfterMs: STALE_FIX_MS,
  onRecheck() {
    gpsDiagnostics.rechecks += 1;
    location.restart();
  },
  onStale() {
    const fix = location.lastFix;
    if (!fix) return;
    userLocation.update(fix, true);
    gpsStatus.showFix(fix, true);
  },
});
setInterval(() => watchdog.tick(Date.now()), 5_000);

location.subscribe({
  onFix(fix: LocationFix) {
    // Use our own clock for staleness rather than fix.timestamp, which comes
    // from the device's GPS stack and isn't always in sync with Date.now().
    watchdog.fixReceived(Date.now());
    gpsDiagnostics.fix(fix, Date.now());
    userLocation.update(fix);
    gpsStatus.showFix(fix, false);
    follow.handleFix(fix);
  },
  onError(kind) {
    gpsDiagnostics.error(kind, Date.now());
    gpsStatus.showError(kind);
  },
});

// --- Hike recording -------------------------------------------------------------

const hikeStore = createIndexedDbHikeStore();
const recorder = new Recorder(hikeStore, location);
const recordingWakeLock = new ScreenWakeLock();
const hikeBar = new HikeBar(requireElement('hike-dock'), recorder, {
  start: () => void startHike(),
  finish: () => void finishHike(),
});

recorder.subscribe(() => trackLayer.show(recorder.track));

// Keep the screen on only while actually recording: browsers stop GPS when the
// screen locks. While paused, the phone may sleep and save battery.
let lastRecorderState = recorder.state;
recorder.subscribe(() => {
  if (recorder.state === lastRecorderState) return;
  lastRecorderState = recorder.state;
  if (recorder.state === 'recording') void recordingWakeLock.acquire();
  else void recordingWakeLock.release();
});

/** "Morning hike", "Afternoon hike"…: the date is shown separately, so the name needn't repeat it. */
function defaultHikeName(start: Date): string {
  const hour = start.getHours();
  return hour < 12 ? 'Morning hike' : hour < 17 ? 'Afternoon hike' : 'Evening hike';
}

async function startHike(): Promise<void> {
  try {
    await recorder.start(defaultHikeName(new Date()));
  } catch {
    showToast("Couldn't start recording because this phone's storage isn't available.", { durationMs: 8_000 });
    return;
  }
  follow.recenter(location.lastFix);
  const screenStaysOn = await recordingWakeLock.acquire();
  showToast(
    screenStaysOn
      ? 'Recording. The screen will stay on. Keep this app open: phones stop GPS when the screen locks.'
      : 'Recording. Your screen may lock by itself, which stops GPS. Set Auto-Lock to Never (Settings → Display & Brightness) while you hike.',
    { durationMs: 10_000 },
  );
}

async function finishHike(): Promise<void> {
  const hike = recorder.current;
  if (!hike) return;
  const summary = `${formatDistance(hike.distanceMeters)} · ${formatDuration(recorder.elapsedMs())}`;
  const question =
    hike.pointCount < 2
      ? 'Nothing has been recorded yet. Stop and discard this hike?'
      : `Finish and save this hike?\n\n${summary}`;
  if (!confirm(question)) return;
  const saved = await recorder.finish();
  if (!saved) {
    showToast('Hike discarded.', { durationMs: 4_000 });
    return;
  }
  await history.refresh();
  showToast(`Hike saved · ${summary}`, {
    actionLabel: 'My hikes',
    onAction: () => historyPanel.open(),
    durationMs: 8_000,
  });
}

// --- Hike history ----------------------------------------------------------------

const history = new HikeHistory(hikeStore, routeStore, routes);
void history.refresh();
const hikeViewer = new HikeViewer(
  requireElement('hike-dock').querySelector<HTMLElement>('.hike-view')!,
  history,
  pastHikeLayer,
  (bounds) => {
    follow.stop();
    fitMapTo(map, bounds);
  },
);
const historyPanel = new HistoryPanel(requireElement<HTMLDialogElement>('history-panel'), history, (hike) => {
  void hikeViewer.show(hike);
});

// Bring back a hike that was in progress when the app was closed or crashed.
void recorder.restore().then((hike) => {
  if (!hike) return;
  showToast(
    `Your hike in progress was saved (${formatDistance(hike.distanceMeters)}). It's paused: tap Resume to keep recording.`,
    { durationMs: 15_000 },
  );
});

let lastSaveErrorAt = 0;
recorder.onSaveError(() => {
  if (Date.now() - lastSaveErrorAt < 60_000) return; // One warning a minute is enough.
  lastSaveErrorAt = Date.now();
  showToast("Couldn't save the latest part of your hike. Your phone may be out of storage space.", {
    durationMs: 10_000,
  });
});

void watchBattery((status) => hikeBar.setBattery(status));

const gpsDetails = new GpsDetailsPanel(requireElement<HTMLDialogElement>('gps-panel'), gpsDiagnostics, recorder);
requireElement('gps-chip').addEventListener('click', () => gpsDetails.open());

// Browsers stop GPS while the app is in the background or the screen is locked.
// The recorder already avoids drawing a fake straight line across the gap; this
// tells the hiker why part of their track is missing.
let hiddenWhileRecordingAt: number | null = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    gpsDiagnostics.backgrounded += 1;
    hiddenWhileRecordingAt = recorder.state === 'recording' ? Date.now() : null;
    return;
  }
  if (hiddenWhileRecordingAt === null) return;
  const awayMs = Date.now() - hiddenWhileRecordingAt;
  hiddenWhileRecordingAt = null;
  if (awayMs > BACKGROUND_WARNING_MS) {
    const minutes = Math.max(1, Math.round(awayMs / 60_000));
    showToast(
      `The app was in the background for ${minutes} min. Phones can stop GPS then, so part of your track may be missing. Keep this app open while recording.`,
      { durationMs: 12_000 },
    );
  }
});

// Remember the last position when the app is closed or backgrounded.
document.addEventListener('visibilitychange', () => {
  const fix = location.lastFix;
  if (document.visibilityState === 'hidden' && fix) saveLastPosition(fix.lon, fix.lat);
});

// --- App shell -------------------------------------------------------------------

watchConnectivity(requireElement('offline-chip'));
registerServiceWorker();
