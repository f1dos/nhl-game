import type { Player } from './types';
import { clamp, RNG } from './random';

/** Probability per exposed skater event; recovery is measured in advance ticks. */
export function injuryProbability(p: Player, physical: number, minutes: number) {
  if (p.injury > 0) return 0;
  return clamp(0.001 * (1 + (100-p.attributes.durability)/100)
    * (0.7 + physical/100) * (1+p.fatigue/100)
    * (1+Math.max(0,p.age-30)/30) * (1+minutes/60), 0.0002, 0.008);
}

export function inflictInjury(p: Player, rng: RNG) {
  const severity = rng.next();
  const type = severity < .75 ? 'bruise' : severity < .95 ? 'strain' : 'fracture';
  p.injury = type === 'bruise' ? rng.int(1,3) : type === 'strain' ? rng.int(4,10) : rng.int(15,30);
  return type;
}
