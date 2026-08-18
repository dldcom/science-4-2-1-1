import { describe, expect, it } from 'vitest';
import { BASIN_TARGET, FINAL_CRATER_EVENTS, INITIAL_CRATER_EVENTS, LAVA_PATHS, uvToDirection } from './craterEvents.js';

const cameraFront = [0, 0, 1];
const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

function directionFor(uv) {
  return uvToDirection(uv);
}

describe('formation geometry contract', () => {
  it('maps the texture UV at the camera front to positive Z', () => {
    const direction = directionFor([0.25, 0.5]);
    expect(direction[2]).toBeGreaterThan(0.99);
  });

  it('keeps the primary basin impact on the camera-facing hemisphere', () => {
    const direction = directionFor(INITIAL_CRATER_EVENTS[0].uv);
    expect(dot(direction, cameraFront)).toBeGreaterThan(0.65);
  });

  it('makes the primary early impact larger than later impacts', () => {
    expect(INITIAL_CRATER_EVENTS[0].radius).toBeGreaterThan(FINAL_CRATER_EVENTS[0].radius * 2);
  });

  it('marks the first event as the basin-forming impact', () => {
    const basinImpact = INITIAL_CRATER_EVENTS[0];
    expect(basinImpact.role).toBe('basin-forming');
    expect(basinImpact.radius).toBeGreaterThanOrEqual(0.23);
    expect(basinImpact.impactorScale).toBeGreaterThanOrEqual(1.9);
    expect(INITIAL_CRATER_EVENTS.slice(1).every((event) => event.role !== 'basin-forming')).toBe(true);
  });

  it('defines a bowl, raised rim, and ejecta reach for every impact', () => {
    for (const event of [...INITIAL_CRATER_EVENTS, ...FINAL_CRATER_EVENTS]) {
      expect(event.depth).toBeGreaterThan(0);
      expect(event.rimHeight).toBeGreaterThan(0);
      expect(event.ejectaScale).toBeGreaterThan(1);
      expect(event.ejectaScale).toBeLessThanOrEqual(3.2);
    }
    expect(INITIAL_CRATER_EVENTS[0].depth).toBeGreaterThan(FINAL_CRATER_EVENTS[0].depth);
    expect(INITIAL_CRATER_EVENTS[0].ejectaScale).toBeGreaterThan(FINAL_CRATER_EVENTS[0].ejectaScale);
  });

  it('uses multi-point lava paths that finish at the basin target', () => {
    expect(LAVA_PATHS.length).toBeGreaterThan(0);
    for (const path of LAVA_PATHS) {
      expect(path.points.length).toBeGreaterThanOrEqual(3);
      expect(path.points.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1)).toBe(true);
    }
    const mainFlow = LAVA_PATHS.find((path) => path.role === 'main-flow');
    expect(LAVA_PATHS.filter((path) => path.role === 'main-flow')).toHaveLength(1);
    expect(LAVA_PATHS.filter((path) => path.role === 'branch')).toHaveLength(1);
    expect(mainFlow.points.at(-1)).toEqual(BASIN_TARGET);
    expect(mainFlow.flowStart).toBe(0);
    expect(mainFlow.flowEnd).toBeLessThan(LAVA_PATHS.find((path) => path.role === 'branch').flowStart);
    for (const branch of LAVA_PATHS.filter((path) => path.role === 'branch')) {
      expect(mainFlow.points).toContainEqual(branch.points.at(-1));
      expect(branch.points.at(-1)).not.toEqual(BASIN_TARGET);
      expect(branch.flowStart).toBeLessThan(branch.flowEnd);
    }
  });
});
