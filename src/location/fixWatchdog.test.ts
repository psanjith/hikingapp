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

  it('rechecks once after a quiet spell, before declaring GPS lost', () => {
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

  it('reports a loss once if nothing arrives, and resets when GPS comes back', () => {
    const { watchdog, onRecheck, onStale } = setup();
    watchdog.fixReceived(0);
    watchdog.tick(20_000);
    watchdog.tick(45_000);
    watchdog.tick(60_000);
    expect(onStale).toHaveBeenCalledTimes(1);

    watchdog.fixReceived(70_000);
    watchdog.tick(90_000);
    expect(onRecheck).toHaveBeenCalledTimes(2);
  });
});
