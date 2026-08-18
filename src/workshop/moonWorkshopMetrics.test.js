import { describe, expect, it } from 'vitest';
import { getAchievementSummary } from './moonWorkshopMetrics.js';

const crater = (x, y, z, hasMare = false) => ({ direction: [x, y, z], hasMare });

describe('getAchievementSummary', () => {
  it('awards a clean moon when no changes were made', () => {
    const result = getAchievementSummary([]);

    expect(result.metrics).toEqual({ craterCount: 0, mareCount: 0, zoneCount: 0 });
    expect(result.awards.map((award) => award.id)).toEqual(['clean-moon']);
  });

  it('awards the lunar sea prize when at least three craters become dark regions', () => {
    const result = getAchievementSummary([
      crater(0.8, 0.1, 0.4, true),
      crater(-0.7, 0.2, 0.5, true),
      crater(0.1, -0.8, 0.5, true),
    ]);

    expect(result.awards.map((award) => award.id)).toContain('lunar-sea');
  });

  it('awards the meteor party prize at eight craters', () => {
    const result = getAchievementSummary(Array.from({ length: 8 }, (_, index) => crater(index % 2 ? -0.4 : 0.4, 0.2, 0.8)));

    expect(result.awards.map((award) => award.id)).toContain('meteor-party');
  });

  it('awards the bumpy moon prize when craters span three surface zones', () => {
    const result = getAchievementSummary([
      crater(0.8, 0.1, 0.4),
      crater(-0.8, 0.1, 0.4),
      crater(0.1, -0.8, 0.4),
    ]);

    expect(result.metrics.zoneCount).toBe(3);
    expect(result.awards.map((award) => award.id)).toContain('bumpy-moon');
  });
});
