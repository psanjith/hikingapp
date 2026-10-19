/**
 * Keeps the phone screen on while something important is happening (a map
 * download now; hike recording from Stage 4). Browsers pause web apps when the
 * screen locks, so this is the most reliable way to keep working on the web.
 *
 * The browser drops the lock whenever the app is hidden, so we re-request it
 * each time the app becomes visible again, for as long as it's wanted.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (this.wanted && document.visibilityState === 'visible') void this.request();
    });
  }

  static get isSupported(): boolean {
    return 'wakeLock' in navigator;
  }

  async acquire(): Promise<void> {
    this.wanted = true;
    await this.request();
  }

  async release(): Promise<void> {
    this.wanted = false;
    await this.sentinel?.release();
    this.sentinel = null;
  }

  private async request(): Promise<void> {
    if (!ScreenWakeLock.isSupported || this.sentinel) return;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch {
      // Denied (e.g. low-power mode). Not fatal: the screen may just sleep.
    }
  }
}
