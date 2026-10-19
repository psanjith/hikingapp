/** The orientation event fields we use (iOS adds the webkit ones). */
export interface OrientationFields {
  alpha: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;
}

/**
 * Compass heading (degrees clockwise from north, 0–360) from an orientation
 * event, or null if this event doesn't carry one.
 *
 * - iPhone: Safari gives the heading directly as webkitCompassHeading.
 * - Android: "deviceorientationabsolute" gives alpha, the rotation from north
 *   measured anticlockwise, so the heading is 360 − alpha.
 * Both are measured relative to the top of the phone, so if the screen is
 * turned sideways, its rotation is added back.
 */
export function headingFromOrientation(event: OrientationFields, screenAngle: number): number | null {
  let heading: number;
  if (typeof event.webkitCompassHeading === 'number' && event.webkitCompassHeading >= 0) {
    heading = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha !== null) {
    heading = 360 - event.alpha;
  } else {
    return null; // Relative-only orientation (not tied to north): useless for a compass.
  }
  return normalise(heading + screenAngle);
}

/**
 * Moves a smoothed heading part of the way towards a new reading, the short
 * way round, so the cone glides instead of jittering, and turning from 359° to
 * 1° is a 2° nudge rather than a 358° spin.
 */
export function blendHeading(previous: number | null, next: number, weight = 0.3): number {
  if (previous === null) return normalise(next);
  const difference = ((next - previous + 540) % 360) - 180; // −180…180
  return normalise(previous + difference * weight);
}

function normalise(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

type PermissionRequester = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * The phone's compass. Like location, it's isolated here so a native build
 * could plug in the platform compass instead.
 */
export class Compass {
  private smoothed: number | null = null;
  private readonly listeners = new Set<(heading: number) => void>();
  private lastReadingAt = 0;

  constructor() {
    // Android Chrome: absolute (north-referenced) orientation has its own event.
    window.addEventListener('deviceorientationabsolute', this.handle as EventListener);
    // iPhone: the ordinary event, with webkitCompassHeading.
    window.addEventListener('deviceorientation', this.handle as EventListener);
  }

  /** iPhones need a one-time "Allow motion & orientation" tap before any readings arrive. */
  static get needsPermission(): boolean {
    return typeof (globalThis.DeviceOrientationEvent as PermissionRequester | undefined)?.requestPermission === 'function';
  }

  /** The latest smoothed heading, if the compass has reported one. */
  get heading(): number | null {
    return this.smoothed;
  }

  /** Whether the compass has reported anything in the last few seconds. */
  get isWorking(): boolean {
    return Date.now() - this.lastReadingAt < 3_000;
  }

  /** Must be called straight from a tap (iOS rule). Resolves immediately if already allowed. */
  async requestPermission(): Promise<boolean> {
    const requester = globalThis.DeviceOrientationEvent as PermissionRequester | undefined;
    if (!requester?.requestPermission) return true;
    try {
      return (await requester.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Call at the start of a tap handler: on iPhone, asks for compass access if
   * it isn't working yet. Must run before any `await` in the handler, while
   * iOS still counts it as part of the tap.
   */
  askFromTap(): void {
    if (Compass.needsPermission && !this.isWorking) void this.requestPermission();
  }

  /**
   * Asks for compass access on the first tap anywhere after the app opens.
   *
   * iOS never lets a page ask on its own: requestPermission() only works as
   * part of a tap, and is silently refused otherwise. The first touch is the
   * earliest moment possible. If access was already given, iOS answers
   * straight away with no prompt; it can also forget between launches, which
   * is why this runs every time.
   */
  askOnFirstTap(): void {
    if (!Compass.needsPermission) return;
    const ask = () => {
      document.removeEventListener('touchend', ask, true);
      document.removeEventListener('click', ask, true);
      this.askFromTap();
    };
    document.addEventListener('touchend', ask, true);
    document.addEventListener('click', ask, true);
  }

  /** Calls `listener` with every new heading. Returns a function that stops it. */
  subscribe(listener: (heading: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handle = (event: DeviceOrientationEvent & OrientationFields): void => {
    const screenAngle = screen.orientation?.angle ?? 0;
    const heading = headingFromOrientation(event, screenAngle);
    if (heading === null) return;
    this.lastReadingAt = Date.now();
    this.smoothed = blendHeading(this.smoothed, heading);
    for (const listener of this.listeners) listener(this.smoothed);
  };
}
