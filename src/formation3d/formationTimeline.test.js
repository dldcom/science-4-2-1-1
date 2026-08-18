import { describe, expect, it } from 'vitest';
import {
  FORMATION_PHASES,
  FORMATION_FLOW,
  FORMATION_TIMING,
  IMPACT_COUNT,
  createInitialFormationState,
  getFormationPhaseStep,
  getPhaseLabel,
  getPhaseProgress,
  isFormationComplete,
  reduceFormation,
} from './formationTimeline.js';

describe('formation timeline', () => {
  it('names the cause-and-effect flow in child-friendly order', () => {
    expect(FORMATION_FLOW.map((step) => step.label)).toEqual([
      '큰 충돌',
      '큰 웅덩이',
      '용암이 채움',
      '식어서 굳음',
      '달의 바다',
    ]);
  });

  it('uses slower classroom playback rates for impacts and volcanism', () => {
    expect(FORMATION_TIMING.impactStep).toBeGreaterThan(0.005);
    expect(FORMATION_TIMING.impactStep).toBeLessThanOrEqual(0.02);
    expect(FORMATION_TIMING.volcanismStep).toBeGreaterThan(0.005);
    expect(FORMATION_TIMING.volcanismStep).toBeLessThan(FORMATION_TIMING.impactStep);
    expect(getFormationPhaseStep(FORMATION_PHASES.IMPACTS)).toBe(FORMATION_TIMING.impactStep);
    expect(getFormationPhaseStep(FORMATION_PHASES.VOLCANISM)).toBe(FORMATION_TIMING.volcanismStep);
    expect(getFormationPhaseStep(FORMATION_PHASES.FINAL_IMPACTS)).toBe(FORMATION_TIMING.finalImpactStep);
  });

  it('holds the current scene at its end until the next-stage action is requested', () => {
    let state = createInitialFormationState();

    state = reduceFormation(state, { type: 'NEXT_STAGE' });
    expect(state.phase).toBe(FORMATION_PHASES.IMPACTS);
    expect(state.impactIndex).toBe(0);
    expect(state.impactProgress).toBe(0);

    state = reduceFormation(state, { type: 'ADVANCE_PROGRESS', amount: 1 });
    expect(state.phase).toBe(FORMATION_PHASES.IMPACTS);
    expect(state.impactIndex).toBe(0);
    expect(state.impactProgress).toBe(1);

    state = reduceFormation(state, { type: 'ADVANCE_PROGRESS', amount: 0.2 });
    expect(state.impactIndex).toBe(0);
    expect(state.impactProgress).toBe(1);

    state = reduceFormation(state, { type: 'NEXT_STAGE' });
    expect(state.phase).toBe(FORMATION_PHASES.IMPACTS);
    expect(state.impactIndex).toBe(1);
    expect(state.impactProgress).toBe(0);
  });

  it('starts with a smooth educational moon state', () => {
    const state = createInitialFormationState();

    expect(state.phase).toBe(FORMATION_PHASES.SMOOTH);
    expect(state.impactIndex).toBe(0);
    expect(state.impactProgress).toBe(0);
    expect(state.lavaProgress).toBe(0);
  });

  it('moves through four impact events before volcanism', () => {
    let state = createInitialFormationState();

    state = reduceFormation(state, { type: 'ADVANCE', amount: 10 });
    expect(state.phase).toBe(FORMATION_PHASES.IMPACTS);

    for (let index = 0; index < IMPACT_COUNT; index += 1) {
      state = reduceFormation(state, { type: 'ADVANCE', amount: 10 });
      if (index < IMPACT_COUNT - 1) {
        expect(state.phase).toBe(FORMATION_PHASES.IMPACTS);
        expect(state.impactIndex).toBe(index + 1);
      }
    }

    expect(state.phase).toBe(FORMATION_PHASES.VOLCANISM);
    expect(state.impactIndex).toBe(IMPACT_COUNT);
  });

  it('finishes lava before entering the final impact phase', () => {
    let state = createInitialFormationState();
    state = reduceFormation(state, { type: 'JUMP_TO', phase: FORMATION_PHASES.VOLCANISM });

    state = reduceFormation(state, { type: 'ADVANCE', amount: 0.5 });
    expect(state.phase).toBe(FORMATION_PHASES.VOLCANISM);
    expect(state.lavaProgress).toBe(0.5);

    state = reduceFormation(state, { type: 'ADVANCE', amount: 0.5 });
    expect(state.phase).toBe(FORMATION_PHASES.FINAL_IMPACTS);
    expect(state.lavaProgress).toBe(1);
  });

  it('reduced motion advances a phase to its final state immediately', () => {
    let state = createInitialFormationState({ reducedMotion: true });

    state = reduceFormation(state, { type: 'ADVANCE', amount: 0.01 });
    expect(state.phase).toBe(FORMATION_PHASES.IMPACTS);
    expect(state.impactIndex).toBe(0);
    expect(state.impactProgress).toBe(1);

    state = reduceFormation(state, { type: 'ADVANCE', amount: 0.01 });
    expect(state.impactIndex).toBe(1);
    expect(state.impactProgress).toBe(1);
  });

  it('reduced motion can still reach the complete summary', () => {
    let state = createInitialFormationState({ reducedMotion: true });
    let guard = 0;
    while (!isFormationComplete(state) && guard < 12) {
      state = reduceFormation(state, { type: 'ADVANCE', amount: 0.01 });
      guard += 1;
    }

    expect(isFormationComplete(state)).toBe(true);
    expect(guard).toBeLessThanOrEqual(10);
  });

  it('reports a complete summary only after the final step', () => {
    let state = createInitialFormationState();
    state = reduceFormation(state, { type: 'JUMP_TO', phase: FORMATION_PHASES.SUMMARY });

    expect(isFormationComplete(state)).toBe(true);
    expect(getPhaseLabel(state)).toContain('현재');
    expect(getPhaseProgress(state)).toBe(1);
  });
});
