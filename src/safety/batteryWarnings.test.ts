import { describe, expect, it } from 'vitest';
import { BatteryWarnings } from './batteryWarnings';

const on = (level: number, charging = false) => ({ level, charging });

describe('BatteryWarnings', () => {
  it('warns once as each level is passed', () => {
    const warnings = new BatteryWarnings();
    expect(warnings.check(on(0.5))).toBeNull();
    expect(warnings.check(on(0.3))).toBe(0.3);
    expect(warnings.check(on(0.29))).toBeNull();
    expect(warnings.check(on(0.2))).toBe(0.2);
    expect(warnings.check(on(0.1))).toBe(0.1);
    expect(warnings.check(on(0.05))).toBeNull();
  });

  it('warns once, for the lowest level, when several are passed at once', () => {
    const warnings = new BatteryWarnings();
    expect(warnings.check(on(0.08))).toBe(0.1);
    expect(warnings.check(on(0.07))).toBeNull();
  });

  it('never warns while charging, and starts over after charging', () => {
    const warnings = new BatteryWarnings();
    warnings.check(on(0.25));
    expect(warnings.check(on(0.15, true))).toBeNull();
    expect(warnings.check(on(0.28))).toBe(0.3);
  });
});
