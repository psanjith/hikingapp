const SEEN_KEY = 'hikingapp:record-intro-seen';

/**
 * "Before you start": shown the first time someone starts recording.
 *
 * As a web app, recording only works while the app is open on screen (phones
 * stop GPS for websites when locked or in the background). That's only
 * dangerous if a hiker doesn't know it, so it's spelled out once, up front,
 * instead of being buried in a toast.
 */
export class RecordIntro {
  private onStart: (() => void) | null = null;

  constructor(private readonly dialog: HTMLDialogElement) {
    dialog.querySelector('.intro-start')!.addEventListener('click', () => {
      remember();
      this.dialog.close();
      this.onStart?.();
    });
    const cancel = () => this.dialog.close();
    dialog.querySelector('.intro-cancel')!.addEventListener('click', cancel);
    dialog.querySelector('.panel-close')!.addEventListener('click', cancel);
  }

  /** Runs `start` straight away if the intro has been seen, otherwise after it. */
  beforeStarting(start: () => void): void {
    if (seen()) {
      start();
      return;
    }
    this.onStart = start;
    this.dialog.showModal();
  }
}

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // It will just show again next time.
  }
}
