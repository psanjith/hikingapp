import { registerSW } from 'virtual:pwa-register';
import { showToast } from './toast';

/**
 * Registers the service worker that caches the app for offline use.
 *
 * When a new version is deployed, the new service worker downloads in the
 * background but waits. We ask the user before switching, because reloading
 * the app by surprise in the middle of a hike would be a bad experience.
 */
export function registerServiceWorker(): void {
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      showToast('A new version is available.', {
        actionLabel: 'Update',
        onAction: () => void updateServiceWorker(true),
      });
    },
    onOfflineReady() {
      showToast('Ready to work offline.', { durationMs: 4000 });
    },
  });
}
