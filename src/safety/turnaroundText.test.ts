import { describe, expect, it } from 'vitest';
import { DAYLIGHT_BUFFER_MS, type TurnaroundPlan } from './turnaround';
import { describeDaylightAtStart, describeTurnaround, TurnaroundAlerts } from './turnaroundText';

const MIN = 60_000;
const NOW = 0;
const SUNSET = 240 * MIN;
/** Minutes after "now", for readable assertions. */
const clock = (ms: number) => `T+${Math.round(ms / MIN)}`;

function plan(overrides: Partial<TurnaroundPlan>): TurnaroundPlan {
  return {
    mode: 'out-and-back',
    sunset: SUNSET,
    deadline: SUNSET - DAYLIGHT_BUFFER_MS,
    afterDark: false,
    turnAroundBy: 120 * MIN,
    backAt: 30 * MIN,
    via: null,
    destinationAt: null,
    finishAt: null,
    calibrated: true,
    ...overrides,
  };
}

describe('describeTurnaround', () => {
  it('counts down to the turnaround time, turning amber then red', () => {
    expect(describeTurnaround(plan({ turnAroundBy: 120 * MIN }), NOW, clock)).toEqual({
      text: 'Turn around in 2 h (by T+120) · sunset T+240',
      tone: 'good',
    });
    expect(describeTurnaround(plan({ turnAroundBy: 40 * MIN }), NOW, clock).tone).toBe('fair');
    expect(describeTurnaround(plan({ turnAroundBy: 10 * MIN }), NOW, clock).tone).toBe('poor');
  });

  it('says turn around now once the time has passed', () => {
    expect(describeTurnaround(plan({ turnAroundBy: -5 * MIN, backAt: 200 * MIN }), NOW, clock).text).toBe(
      'Turn around now to get back before dark (sunset T+240).',
    );
    expect(describeTurnaround(plan({ turnAroundBy: -5 * MIN, backAt: 260 * MIN }), NOW, clock).text).toContain('after sunset');
  });

  it('on the way back, shows the estimated time back', () => {
    expect(describeTurnaround(plan({ mode: 'returning', turnAroundBy: null, backAt: 150 * MIN }), NOW, clock)).toEqual({
      text: 'Back at about T+150 · sunset T+240',
      tone: 'good',
    });
    expect(describeTurnaround(plan({ mode: 'returning', backAt: 230 * MIN }), NOW, clock).tone).toBe('fair');
    expect(describeTurnaround(plan({ mode: 'returning', backAt: 250 * MIN }), NOW, clock).tone).toBe('poor');
  });

  it('on a loop, says when to go back the way you came', () => {
    const message = describeTurnaround(plan({ mode: 'loop', via: 'back', backAt: 200 * MIN }), NOW, clock);
    expect(message.text).toContain('Go back the way you came');
    expect(message.tone).toBe('fair');
  });

  it('for a summit route, says whether the whole plan fits before dark', () => {
    const onTrack = plan({ mode: 'destination', destinationAt: 60 * MIN, finishAt: 150 * MIN });
    expect(describeTurnaround(onTrack, NOW, clock).text).toBe('On track: at the end by T+60, back by T+150 · sunset T+240');
    const tooLate = plan({ mode: 'destination', destinationAt: 120 * MIN, finishAt: 300 * MIN, turnAroundBy: 90 * MIN });
    expect(describeTurnaround(tooLate, NOW, clock).text).toBe(
      "Turn around in 1 h 30 min (by T+90) · sunset T+240. You won't reach the end and get back before dark.",
    );
  });

  it('after sunset, says so plainly', () => {
    expect(describeTurnaround(plan({ afterDark: true }), NOW, clock).text).toContain('after sunset');
  });
});

describe('describeDaylightAtStart', () => {
  it('gives the time to be back by', () => {
    expect(describeDaylightAtStart(NOW, SUNSET, clock)).toBe('Sunset is at T+240. Plan to be back by T+210.');
  });

  it('warns when there is little daylight left, or none', () => {
    expect(describeDaylightAtStart(NOW, 100 * MIN, clock)).toContain('Only 1 h 40 min of daylight left');
    expect(describeDaylightAtStart(NOW, -MIN, clock)).toContain('after sunset');
  });
});

describe('TurnaroundAlerts', () => {
  it('alerts once each at 30 minutes, 10 minutes and turn-around time', () => {
    const alerts = new TurnaroundAlerts();
    const at = (minutesLeft: number) => alerts.check(plan({ turnAroundBy: minutesLeft * MIN }), NOW, clock);
    expect(at(45)).toBeNull();
    expect(at(29)).toContain('30 minutes');
    expect(at(25)).toBeNull();
    expect(at(9)).toContain('10 minutes');
    expect(at(0)).toContain('Time to turn around');
    expect(at(-5)).toBeNull();
  });

  it('jumps straight to the most urgent alert, without the earlier ones afterwards', () => {
    const alerts = new TurnaroundAlerts();
    expect(alerts.check(plan({ turnAroundBy: 5 * MIN }), NOW, clock)).toContain('10 minutes');
    expect(alerts.check(plan({ turnAroundBy: 25 * MIN }), NOW, clock)).toBeNull();
  });

  it('stays quiet on a summit route that fits before dark', () => {
    const alerts = new TurnaroundAlerts();
    const onTrack = plan({ mode: 'destination', turnAroundBy: 5 * MIN, destinationAt: 60 * MIN, finishAt: 150 * MIN });
    expect(alerts.check(onTrack, NOW, clock)).toBeNull();
  });

  it('warns once when a loop needs to be cut short, or the way back runs past sunset', () => {
    const alerts = new TurnaroundAlerts();
    expect(alerts.check(plan({ mode: 'loop', via: 'back' }), NOW, clock)).toContain('Finishing the loop');
    expect(alerts.check(plan({ mode: 'loop', via: 'back' }), NOW, clock)).toBeNull();
    expect(alerts.check(plan({ mode: 'returning', backAt: 260 * MIN }), NOW, clock)).toContain('after sunset');
  });

  it('starts over for a new hike', () => {
    const alerts = new TurnaroundAlerts();
    alerts.check(plan({ turnAroundBy: 0 }), NOW, clock);
    alerts.reset();
    expect(alerts.check(plan({ turnAroundBy: 0 }), NOW, clock)).toContain('Time to turn around');
  });
});
