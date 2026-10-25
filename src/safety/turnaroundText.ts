import { formatClock, formatTimeLeft } from '../ui/format';
import { DAYLIGHT_BUFFER_MS, type TurnaroundPlan } from './turnaround';

export type Tone = 'good' | 'fair' | 'poor';

export interface TurnaroundMessage {
  text: string;
  tone: Tone;
}

/** Below this much time before turning around, the message turns amber, then red. */
const FAIR_MS = 60 * 60_000;
const POOR_MS = 15 * 60_000;

/**
 * The line shown in the hike bar: plain words, and a colour for how much
 * time there is to spare. `clock` formats times of day (injectable for tests).
 */
export function describeTurnaround(plan: TurnaroundPlan, now: number, clock = formatClock): TurnaroundMessage {
  const sunset = clock(plan.sunset);
  if (plan.afterDark) return { text: "It's after sunset. Head back carefully and use your headlamp.", tone: 'poor' };

  // How the estimated time back compares with sunset.
  const arrival = (prefix: string): TurnaroundMessage => {
    const back = clock(plan.backAt);
    if (plan.backAt <= plan.deadline) return { text: `${prefix} ${back} · sunset ${sunset}`, tone: 'good' };
    if (plan.backAt <= plan.sunset) return { text: `${prefix} ${back}, close to sunset (${sunset}). Keep moving.`, tone: 'fair' };
    return { text: `${prefix} ${back}, after sunset (${sunset}). Get your headlamp ready.`, tone: 'poor' };
  };

  switch (plan.mode) {
    case 'returning':
      return arrival('Back at about');
    case 'loop':
      if (plan.via === 'continue') return arrival('Finish the loop at about');
      return {
        text: `Go back the way you came: finishing the loop would end after dark. Back at about ${clock(plan.backAt)}.`,
        tone: plan.backAt <= plan.sunset ? 'fair' : 'poor',
      };
    case 'destination':
      if (plan.finishAt! <= plan.deadline) {
        return {
          text: `On track: at the end by ${clock(plan.destinationAt!)}, back by ${clock(plan.finishAt!)} · sunset ${sunset}`,
          tone: 'good',
        };
      }
      return withNote(turnAround(plan, now, sunset, clock), "You won't reach the end and get back before dark.");
    case 'out-and-back':
      return turnAround(plan, now, sunset, clock);
  }
}

function turnAround(plan: TurnaroundPlan, now: number, sunset: string, clock: (ms: number) => string): TurnaroundMessage {
  const left = plan.turnAroundBy! - now;
  if (left <= 0) {
    return plan.backAt <= plan.sunset
      ? { text: `Turn around now to get back before dark (sunset ${sunset}).`, tone: 'poor' }
      : { text: `Turn around now: you'll be back around ${clock(plan.backAt)}, after sunset.`, tone: 'poor' };
  }
  return {
    text: `Turn around in ${formatTimeLeft(left)} (by ${clock(plan.turnAroundBy!)}) · sunset ${sunset}`,
    tone: left < POOR_MS ? 'poor' : left < FAIR_MS ? 'fair' : 'good',
  };
}

/** Adds a sentence (times like "6:12 p.m." may already end the text with a full stop). */
function withNote(message: TurnaroundMessage, note: string): TurnaroundMessage {
  const joiner = message.text.endsWith('.') ? ' ' : '. ';
  return { text: message.text + joiner + note, tone: message.tone === 'good' ? 'fair' : message.tone };
}

/** What to say about daylight when a hike starts. */
export function describeDaylightAtStart(now: number, sunset: number, clock = formatClock): string {
  if (now >= sunset) return "It's already after sunset. Bring a headlamp and stick to trails you know.";
  const deadline = sunset - DAYLIGHT_BUFFER_MS;
  if (deadline - now < 90 * 60_000) {
    return `Only ${formatTimeLeft(sunset - now)} of daylight left (sunset ${clock(sunset)}). Pick a short hike and turn around early.`;
  }
  return `Sunset is at ${clock(sunset)}. Plan to be back by ${clock(deadline)}.`;
}

/**
 * Decides when to interrupt the hiker: once each at 30 minutes, 10 minutes
 * and "turn around now", plus once for each kind of late-return warning.
 * Never repeats an alert, and skips straight to the most urgent one if the
 * hiker starts late.
 */
export class TurnaroundAlerts {
  private fired = new Set<string>();

  reset(): void {
    this.fired.clear();
  }

  check(plan: TurnaroundPlan, now: number, clock = formatClock): string | null {
    if (plan.afterDark) return this.once('dark', "It's after sunset. Head back carefully and use your headlamp.");

    if (plan.mode === 'out-and-back' || plan.mode === 'destination') {
      if (plan.mode === 'destination' && plan.finishAt! <= plan.deadline) return null; // On track for the whole plan.
      const left = plan.turnAroundBy! - now;
      const level = left <= 0 ? 'now' : left <= 10 * 60_000 ? '10' : left <= 30 * 60_000 ? '30' : null;
      if (!level || this.fired.has(level)) return null;
      // Mark this and every less urgent level, so they don't fire afterwards.
      for (const l of ['30', '10', 'now']) {
        this.fired.add(l);
        if (l === level) break;
      }
      return {
        '30': 'In about 30 minutes, turn around to get back before dark.',
        '10': 'In about 10 minutes, turn around to get back before dark.',
        now: 'Time to turn around and head back, to get out before dark.',
      }[level];
    }

    if (plan.mode === 'loop' && plan.via === 'back') {
      return this.once('loop-back', 'Finishing the loop would end after dark. Going back the way you came gets you out sooner.');
    }
    if (plan.backAt > plan.sunset) {
      return this.once('late', `At this pace you'll be back after sunset (${clock(plan.sunset)}). Keep moving and get your headlamp ready.`);
    }
    return null;
  }

  private once(key: string, message: string): string | null {
    if (this.fired.has(key)) return null;
    this.fired.add(key);
    return message;
  }
}
