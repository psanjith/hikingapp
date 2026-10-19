export interface BatteryStatus {
  /** 0 to 1. */
  level: number;
  charging: boolean;
}

/** The Battery Status API: Chrome on Android has it; Safari (so every iPhone browser) doesn't. */
interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

/**
 * Calls `onChange` with the battery level now and whenever it changes.
 * Returns false if this browser won't tell us, so the UI can hide the battery
 * indicator instead of showing something wrong. Like location, this sits
 * behind a small function so a native build can supply the real value.
 */
export async function watchBattery(onChange: (status: BatteryStatus) => void): Promise<boolean> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (!nav.getBattery) return false;
  try {
    const battery = await nav.getBattery();
    const report = () => onChange({ level: battery.level, charging: battery.charging });
    battery.addEventListener('levelchange', report);
    battery.addEventListener('chargingchange', report);
    report();
    return true;
  } catch {
    return false;
  }
}
