import { describe, expect, it } from 'vitest';
import { FORMATION_PHASES } from './formationTimeline.js';
import { getTerrainMixForState } from './formationVisuals.js';

describe('formation material progression', () => {
  it('keeps early crust stable until the first meteor is almost at the surface', () => {
    expect(getTerrainMixForState({ phase: FORMATION_PHASES.IMPACTS, impactIndex: 0, impactProgress: 0.8 })).toBe(0);
    expect(getTerrainMixForState({ phase: FORMATION_PHASES.IMPACTS, impactIndex: 0, impactProgress: 0.99 })).toBe(0);
  });

  it('reveals detailed terrain after an impact has settled', () => {
    expect(getTerrainMixForState({ phase: FORMATION_PHASES.IMPACTS, impactIndex: 1, impactProgress: 0 })).toBe(0.28);
  });
});