/**
 * Whether the app is running from the Home Screen (installed) rather than in
 * a browser tab. Installed matters on iPhone: Safari may delete data for
 * websites you haven't visited lately, but treats Home Screen apps as keepers.
 */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad (iPadOS reports itself as a Mac, but with a touch screen). */
export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** Chrome/Android's install prompt event (not in TypeScript's DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * On Android (Chrome, Edge, Samsung Internet) the browser offers a real
 * "Install app" dialog, but only if we catch its event and show it from a tap.
 * iPhones have no such dialog: users must use Share → Add to Home Screen,
 * which is why the checklist explains those steps instead.
 */
export class InstallPrompt {
  private event: BeforeInstallPromptEvent | null = null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault(); // We'll offer it from the checklist instead of a browser mini-bar.
      this.event = event as BeforeInstallPromptEvent;
      this.emit();
    });
    window.addEventListener('appinstalled', () => {
      this.event = null;
      this.emit();
    });
  }

  get available(): boolean {
    return this.event !== null;
  }

  async show(): Promise<boolean> {
    if (!this.event) return false;
    await this.event.prompt();
    const { outcome } = await this.event.userChoice;
    this.event = null;
    this.emit();
    return outcome === 'accepted';
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Asks the browser not to clear our data under storage pressure. Never prompts on iOS or Chrome. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
