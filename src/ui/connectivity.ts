/**
 * Shows an "Offline" chip when there's no internet, so users know the app is
 * still working on purpose (GPS doesn't need internet) rather than broken.
 *
 * Note: navigator.onLine only knows whether the phone has *a* network
 * connection, not whether that connection actually reaches the internet. It's
 * good enough for an informational chip, but nothing important depends on it.
 */
export function watchConnectivity(chip: HTMLElement): void {
  const update = () => {
    chip.hidden = navigator.onLine;
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}
