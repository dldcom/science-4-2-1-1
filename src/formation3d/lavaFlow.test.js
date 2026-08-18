import { describe, expect, it } from 'vitest';
import { LAVA_PATHS } from './craterEvents.js';
import { getLavaFront } from './lavaFlow.js';

describe('lava flow timing', () => {
  const main = LAVA_PATHS.find((path) => path.role === 'main-flow');
  const branches = LAVA_PATHS.filter((path) => path.role === 'branch');

  it('lets the main flow reach the basin before branches become visible', () => {
    expect(getLavaFront(0.28, main)).toBeGreaterThan(0);
    expect(getLavaFront(0.56, main)).toBe(1);
    expect(getLavaFront(0.56, branches[0])).toBe(0);
  });

  it('reveals branches sequentially after the main flow', () => {
    expect(getLavaFront(0.62, branches[0])).toBeGreaterThan(0);
    expect(getLavaFront(0.56, branches[0])).toBe(0);
  });

  it('keeps all paths fully revealed after the flow settles', () => {
    for (const path of LAVA_PATHS) expect(getLavaFront(1, path)).toBe(1);
  });

  it('uses the same schedule for each path as the surface arrival map', () => {
    for (const path of LAVA_PATHS) {
      expect(getLavaFront(path.flowStart, path)).toBe(0);
      expect(getLavaFront(path.flowEnd, path)).toBe(1);
    }
  });
});