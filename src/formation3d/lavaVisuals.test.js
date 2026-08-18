import { describe, expect, it } from 'vitest';
import { getLavaVisualWeights } from './lavaVisuals.js';

describe('lava visual progression', () => {
  it('keeps an active lava front narrow around the mapped path', () => {
    const nearPath = getLavaVisualWeights({ arrival: 0.42, basin: 1, progress: 0.45 });
    const farFromPath = getLavaVisualWeights({ arrival: 0.05, basin: 1, progress: 0.45 });
    expect(nearPath.active).toBeGreaterThan(0);
    expect(farFromPath.active).toBe(0);
  });

  it('does not darken the basin before cooling begins', () => {
    const early = getLavaVisualWeights({ arrival: 0.05, basin: 1, progress: 0.08 });
    expect(early.cooled).toBe(0);
    expect(early.active).toBeGreaterThanOrEqual(0);
  });

  it('leaves a strong cooled basalt weight only near the end', () => {
    const mid = getLavaVisualWeights({ arrival: 0.4, basin: 1, progress: 0.45 });
    const late = getLavaVisualWeights({ arrival: 0.4, basin: 1, progress: 0.95 });
    expect(late.cooled).toBeGreaterThan(mid.cooled);
    expect(late.cooled).toBeGreaterThan(0.6);
  });
});
