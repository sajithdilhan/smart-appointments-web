/**
 * F1 already ships the 14-day strip as `dayStrip` in `core/time` (it needs `addDays` and the
 * noon-UTC label trick, which live there), so F3 re-exports it here instead of duplicating it.
 */
export { dayStrip, type DayStripItem } from '../../../core/time';
