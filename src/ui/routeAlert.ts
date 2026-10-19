import { formatDistance } from './format';

/**
 * The "You're off the route" banner at the top of the screen. It stays up,
 * with a live distance, until the hiker is back on the route or taps OK.
 */
export class RouteAlert {
  private readonly text: HTMLElement;
  private dismissed = false;

  constructor(
    private readonly banner: HTMLElement,
    onShowMe: () => void,
  ) {
    this.text = banner.querySelector('.route-banner-text')!;
    banner.querySelector('.route-show')!.addEventListener('click', onShowMe);
    banner.querySelector('.route-dismiss')!.addEventListener('click', () => {
      this.dismissed = true;
      this.banner.hidden = true;
    });
  }

  /** Just went off-route: show the alert and buzz (on phones that can). */
  alert(meters: number): void {
    this.dismissed = false;
    this.update(meters);
    this.banner.hidden = false;
    // Android only: iPhones don't let websites vibrate.
    navigator.vibrate?.([300, 150, 300]);
  }

  /** Still off-route: keep the distance current. */
  update(meters: number): void {
    if (this.dismissed) return;
    this.text.textContent = `You're ${formatDistance(meters)} from your route. Check the map: the purple line is the trail you planned.`;
  }

  hide(): void {
    this.banner.hidden = true;
  }
}
