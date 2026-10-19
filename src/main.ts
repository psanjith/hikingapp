import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

import type { VectorTileSource } from 'maplibre-gl';
import { DEFAULT_VIEW, GPS_RECHECK_AFTER_MS, STALE_FIX_MS } from './config';
import { createBrowserLocationSource } from './location/browserLocationSource';
import { FixWatchdog } from './location/fixWatchdog';
import type { LocationFix } from './location/types';
import { createMap } from './map/createMap';
import { FollowUser } from './map/followUser';
import { RouteLayer } from './map/routeLayer';
import { UserLocationLayer } from './map/userLocationLayer';
import { createOpfsMapFileStore } from './maps/mapFileStore';
import { OfflineMaps } from './maps/offlineMaps';
import { tileUrl } from './maps/style';
import { TileRouter } from './maps/tileRouter';
import { createIndexedDbRouteStore } from './routes/routeStore';
import { Routes } from './routes/routes';
import { loadLastView, saveLastPosition } from './storage/lastPosition';
import { watchConnectivity } from './ui/connectivity';
import { GpsStatus } from './ui/gpsStatus';
import { MapsPanel } from './ui/mapsPanel';
import { LOCATE_ICON, MAPS_ICON, MapButtonControl, ROUTES_ICON } from './ui/mapButtonControl';
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

// Created before the location layer, so the route is drawn underneath the blue dot.
const routeLayer = new RouteLayer(map);
const routes = new Routes(createIndexedDbRouteStore());
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

// Bottom-right buttons. MapLibre stacks bottom controls upwards, so the one
// added last sits on top: locate (most used) at the bottom, then Maps, Routes.
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
recenter.setActive(follow.isFollowing);
follow.onChange((following) => recenter.setActive(following));

// If readings stop arriving, first ask for a fresh one; only if that fails too,
// grey out the dot so nobody trusts a position that might be minutes old.
const watchdog = new FixWatchdog({
  recheckAfterMs: GPS_RECHECK_AFTER_MS,
  staleAfterMs: STALE_FIX_MS,
  onRecheck: () => location.restart(),
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
    userLocation.update(fix);
    gpsStatus.showFix(fix, false);
    follow.handleFix(fix);
  },
  onError(kind) {
    gpsStatus.showError(kind);
  },
});

// Remember the last position when the app is closed or backgrounded.
document.addEventListener('visibilitychange', () => {
  const fix = location.lastFix;
  if (document.visibilityState === 'hidden' && fix) saveLastPosition(fix.lon, fix.lat);
});

// --- App shell -------------------------------------------------------------------

watchConnectivity(requireElement('offline-chip'));
registerServiceWorker();
