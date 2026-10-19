import { describe, expect, it, vi } from 'vitest';
import { FixWatchdog } from './fixWatchdog';

function setup() {
  const onRecheck = vi.fn();
  const onStale = vi.fn();
  const watchdog = new FixWatchdog({ recheckAfterMs: 20_000, staleAfterMs: 45_000, onRecheck, onStale });
  return { watchdog, onRecheck, onStale };
}

describe('FixWatchdog', () => {
  it('does nothing before the first fix', () => {
    const { watchdog, onRecheck, onStale } = setup();
    watchdog.tick(100_000);
    expect(onRecheck).not.toHaveBeenCalled();
    expect(onStale).not.toHaveBeenCalled();
  });

  it('rechecks after a quiet spell, before declaring GPS lost', () => {
    const { watchdog, onRecheck, onStale } = setup();
    watchdog.fixReceived(0);
    watchdog.tick(19_000);
    expect(onRecheck).not.toHaveBeenCalled();
    watchdog.tick(20_000);
    watchdog.tick(25_000);
    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect(onStale).not.toHaveBeenCalled();
  });

  it('does not report a loss when the recheck brings a fresh fix', () => {
    const { watchdog, onStale } = setup();
    watchdog.fixReceived(0);
    watchdog.tick(20_000); // Recheck...
    watchdog.fixReceived(21_000); // ...and a fix arrives.
    watchdog.tick(50_000);
    expect(onStale).not.toHaveBeenCalled();
  });

  it('keeps rechecking for as long as it stays quiet, even after reporting a loss', () => {
    const { watchdog, onRecheck, onStale } = setup();
    watchdog.fixReceived(0);
    for (let t = 5_000; t <= 120_000; t += 5_000) watchdog.tick(t);
    expect(onRecheck).toHaveBeenCalledTimes(6); // At 20, 40, 60, 80, 100 and 120 s.
    expect(onStale).toHaveBeenCalledTimes(1);
  });

  it('resets when GPS comes back', () => {
    const { watchdog, onStale } = setup();
    watchdog.fixReceived(0);
    watchdog.tick(45_000);
    watchdog.fixReceived(50_000);
    watchdog.tick(70_000);
    watchdog.tick(95_000);
    expect(onStale).toHaveBeenCalledTimes(2);
  });
});
