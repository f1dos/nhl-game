import { stableHash } from "./potential";

export const PORTRAIT_COUNT = 180;

export function regenPortraitIndex(id: string) {
  const cohort = /^(draft|entrant|intl)-(\d+)-(\d+)(?:-|$)/.exec(id);
  if (!cohort) return stableHash(id) % PORTRAIT_COUNT;
  // 73 is coprime to 180, so a cohort visits every face before repeating.
  const offset = stableHash(cohort[1] + ":" + cohort[2]);
  return (offset + Number(cohort[3]) * 73) % PORTRAIT_COUNT;
}
