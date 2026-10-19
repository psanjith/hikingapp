import { Compass } from '../device/compass';
import { isInstalled, isIos, type InstallPrompt } from '../device/install';
import type { OfflineMaps } from '../maps/offlineMaps';
import { button, el } from './dom';

const ONBOARDED_KEY = 'hikingapp:onboarded';
const INSTALL_TIP_KEY = 'hikingapp:install-tip';
/** Remind browser-tab users to install at most once a day. */
const INSTALL_TIP_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface ReadyPanelActions {
  openMaps(): void;
  openRoutes(): void;
}

type LocationState = 'on' | 'off' | 'unknown';

/**
 * "Get ready to hike": a short checklist, shown on first launch and from the
 * "?" button. Each step shows a tick once it's done, so a beginner can see at
 * a glance whether they're ready to lose signal.
 */
export class ReadyPanel {
  private readonly steps: HTMLElement;
  private location: LocationState = 'unknown';

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly maps: OfflineMaps,
    private readonly install: InstallPrompt,
    private readonly compass: Compass,
    private readonly actions: ReadyPanelActions,
  ) {
    this.steps = dialog.querySelector('.ready-steps')!;
    const close = () => this.close();
    dialog.querySelector('.panel-close')!.addEventListener('click', close);
    dialog.querySelector('.ready-done')!.addEventListener('click', close);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener('close', () => {
      try {
        localStorage.setItem(ONBOARDED_KEY, '1');
      } catch {
        // Worst case, the checklist shows again next time.
      }
    });
    const rerender = () => {
      if (dialog.open) this.render();
    };
    maps.subscribe(rerender);
    install.onChange(rerender);
    // Tick the compass step as soon as the first reading arrives.
    let compassWorking = false;
    compass.subscribe(() => {
      if (compassWorking === compass.isWorking) return;
      compassWorking = compass.isWorking;
      rerender();
    });
  }

  /** True until the user has seen and closed the checklist once. */
  static get isFirstRun(): boolean {
    try {
      return localStorage.getItem(ONBOARDED_KEY) === null;
    } catch {
      return false;
    }
  }

  /** Whether to show the "add to Home Screen" tip now; records that it was shown. */
  static installTipDue(): boolean {
    try {
      const last = Number(localStorage.getItem(INSTALL_TIP_KEY));
      if (Date.now() - last < INSTALL_TIP_INTERVAL_MS) return false;
      localStorage.setItem(INSTALL_TIP_KEY, String(Date.now()));
      return true;
    } catch {
      return false;
    }
  }

  setLocation(state: LocationState): void {
    this.location = state;
    if (this.dialog.open) this.render();
  }

  open(): void {
    this.render();
    this.dialog.showModal();
  }

  close(): void {
    this.dialog.close();
  }

  private render(): void {
    const regions = this.maps.downloadedRegionNames;
    const steps = [
      this.step(1, 'Add the app to your Home Screen', isInstalled(), ...this.installHelp()),
      this.step(
        2,
        'Download a map of where you’ll hike',
        regions.length > 0,
        regions.length > 0
          ? el('p', { text: `Saved: ${regions.join(', ')}.` })
          : el('p', { text: 'Do this at home on Wi-Fi. Without it, the map goes blank when you lose signal.' }),
        regions.length > 0 ? null : button('Choose a map', () => this.go(this.actions.openMaps)),
      ),
      this.step(
        3,
        'Allow location',
        this.location === 'on',
        el('p', {
          text:
            this.location === 'off'
              ? 'Location is blocked. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → “While Using the App”, then reopen the app.'
              : this.location === 'on'
                ? 'GPS works with no cell signal.'
                : 'When your phone asks, tap Allow. GPS works with no cell signal.',
        }),
      ),
      // Only iPhones need this: Android shares the compass without asking.
      Compass.needsPermission
        ? this.step(
            4,
            'Show which way you’re facing',
            this.compass.isWorking,
            el('p', {
              text: this.compass.isWorking
                ? 'The cone on your blue dot points where your phone points.'
                : 'Lets the blue dot show which way your phone points. Tap Allow when asked.',
            }),
            this.compass.isWorking ? null : button('Allow compass', () => this.compass.askFromTap()),
          )
        : null,
      this.step(
        Compass.needsPermission ? 5 : 4,
        'Optional: add the trail you plan to hike',
        false,
        el('p', { text: 'Import a GPX file and the app will warn you if you wander off it.' }),
        button('Add a route', () => this.go(this.actions.openRoutes), 'secondary'),
      ),
    ];
    this.steps.replaceChildren(...steps.filter((step) => step !== null));
  }

  private installHelp(): (HTMLElement | null)[] {
    if (isInstalled()) return [el('p', { text: 'Your maps and hikes are kept safely on this phone.' })];
    if (this.install.available) {
      return [
        el('p', { text: 'It opens full screen and your phone keeps its maps and hikes.' }),
        button('Install app', () => void this.install.show()),
      ];
    }
    return [
      el('p', {
        text: isIos()
          ? 'In Safari, tap the Share button (the square with an arrow), then “Add to Home Screen”. Open the app from that icon from now on: iPhones can delete data from websites, but keep it for Home Screen apps.'
          : 'In your browser’s menu, choose “Install app” or “Add to Home screen”, then open the app from that icon.',
      }),
    ];
  }

  private step(number: number, title: string, done: boolean, ...body: (HTMLElement | null)[]): HTMLElement {
    return el(
      'li',
      { className: `card ready-step${done ? ' is-done' : ''}` },
      el('div', { className: 'ready-badge', text: done ? '✓' : String(number) }),
      el('div', { className: 'ready-body' }, el('div', { className: 'card-name', text: title }), ...body),
    );
  }

  private go(action: () => void): void {
    this.close();
    action();
  }
}
