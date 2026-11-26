// The period of Versions, in days: whole days from 1 to 3650 (docs/spec/git-versioning.md, rule 5). Apart from
// History so that what keeps it (Project settings) does not bring isomorphic-git along.

/** The period, in days, when the Project's settings give none. */
export const DEFAULT_PERIOD = 180;

/** A period in days brought into 1–3650; not a number → the default. Whole days (rounded). */
export function clampPeriod(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_PERIOD;
  return Math.min(3650, Math.max(1, Math.round(days)));
}
