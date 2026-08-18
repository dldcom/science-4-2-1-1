export const FORMATION_PHASES = Object.freeze({
  SMOOTH: 'smooth-surface',
  IMPACTS: 'impacts',
  VOLCANISM: 'volcanism',
  FINAL_IMPACTS: 'final-impacts',
  SUMMARY: 'summary',
});

export const IMPACT_COUNT = 4;
export const FINAL_IMPACT_COUNT = 3;
export const FORMATION_TIMING = Object.freeze({
  intervalMs: 50,
  smoothDurationSeconds: 2.8,
  impactStep: 0.018,
  volcanismStep: 0.012,
  finalImpactStep: 0.018,
});

export const FORMATION_FLOW = Object.freeze([
  Object.freeze({ id: 'impact', label: '큰 충돌' }),
  Object.freeze({ id: 'basin', label: '큰 웅덩이' }),
  Object.freeze({ id: 'lava', label: '용암이 채움' }),
  Object.freeze({ id: 'cooling', label: '식어서 굳음' }),
  Object.freeze({ id: 'mare', label: '달의 바다' }),
]);

export function getFormationPhaseStep(phase) {
  switch (phase) {
    case FORMATION_PHASES.IMPACTS: return FORMATION_TIMING.impactStep;
    case FORMATION_PHASES.VOLCANISM: return FORMATION_TIMING.volcanismStep;
    case FORMATION_PHASES.FINAL_IMPACTS: return FORMATION_TIMING.finalImpactStep;
    default: return 0.01;
  }
}

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function getActiveSegmentProgress(state) {
  switch (state.phase) {
    case FORMATION_PHASES.IMPACTS: return state.impactProgress;
    case FORMATION_PHASES.VOLCANISM: return state.lavaProgress;
    case FORMATION_PHASES.FINAL_IMPACTS: return state.finalImpactProgress;
    case FORMATION_PHASES.SUMMARY: return 1;
    default: return 0;
  }
}

function advanceFormationProgress(state, amount) {
  const step = Math.max(0, Number(amount) || 0);
  if (state.phase === FORMATION_PHASES.IMPACTS) return { ...state, impactProgress: clamp(state.impactProgress + step) };
  if (state.phase === FORMATION_PHASES.VOLCANISM) return { ...state, lavaProgress: clamp(state.lavaProgress + step) };
  if (state.phase === FORMATION_PHASES.FINAL_IMPACTS) return { ...state, finalImpactProgress: clamp(state.finalImpactProgress + step) };
  return state;
}

function advanceFormationStage(state) {
  if (state.phase === FORMATION_PHASES.SMOOTH) {
    return { ...state, phase: FORMATION_PHASES.IMPACTS, impactIndex: 0, impactProgress: 0 };
  }
  if (state.phase === FORMATION_PHASES.IMPACTS) {
    if (state.impactProgress < 1) return { ...state, impactProgress: 1 };
    if (state.impactIndex + 1 < IMPACT_COUNT) return { ...state, impactIndex: state.impactIndex + 1, impactProgress: 0 };
    return { ...state, phase: FORMATION_PHASES.VOLCANISM, impactIndex: IMPACT_COUNT, impactProgress: 1, lavaProgress: 0 };
  }
  if (state.phase === FORMATION_PHASES.VOLCANISM) {
    if (state.lavaProgress < 1) return { ...state, lavaProgress: 1 };
    return { ...state, phase: FORMATION_PHASES.FINAL_IMPACTS, lavaProgress: 1, finalImpactIndex: 0, finalImpactProgress: 0 };
  }
  if (state.phase === FORMATION_PHASES.FINAL_IMPACTS) {
    if (state.finalImpactProgress < 1) return { ...state, finalImpactProgress: 1 };
    if (state.finalImpactIndex + 1 < FINAL_IMPACT_COUNT) return { ...state, finalImpactIndex: state.finalImpactIndex + 1, finalImpactProgress: 0 };
    return { ...state, phase: FORMATION_PHASES.SUMMARY, finalImpactIndex: FINAL_IMPACT_COUNT, finalImpactProgress: 1 };
  }
  return state;
}

export function createInitialFormationState(options = {}) {
  return {
    phase: FORMATION_PHASES.SMOOTH,
    impactIndex: 0,
    impactProgress: 0,
    lavaProgress: 0,
    finalImpactIndex: 0,
    finalImpactProgress: 0,
    reducedMotion: Boolean(options.reducedMotion),
  };
}

export function reduceFormation(state, action) {
  if (action.type === 'RESET') return createInitialFormationState({ reducedMotion: state.reducedMotion });
  if (action.type === 'SET_REDUCED_MOTION') {
    return { ...state, reducedMotion: Boolean(action.value) };
  }
  if (action.type === 'JUMP_TO') {
    const phase = action.phase;
    if (phase === FORMATION_PHASES.SMOOTH) return createInitialFormationState({ reducedMotion: state.reducedMotion });
    if (phase === FORMATION_PHASES.IMPACTS) return { ...state, phase, impactIndex: 0, impactProgress: 0 };
    if (phase === FORMATION_PHASES.VOLCANISM) return { ...state, phase, impactIndex: IMPACT_COUNT, impactProgress: 1, lavaProgress: 0 };
    if (phase === FORMATION_PHASES.FINAL_IMPACTS) return { ...state, phase, lavaProgress: 1, finalImpactIndex: 0, finalImpactProgress: 0 };
    if (phase === FORMATION_PHASES.SUMMARY) return { ...state, phase, lavaProgress: 1, finalImpactIndex: FINAL_IMPACT_COUNT, finalImpactProgress: 1 };
  }
  if (action.type === 'ADVANCE_PROGRESS') return advanceFormationProgress(state, action.amount);
  if (action.type === 'NEXT_STAGE') return advanceFormationStage(state);
  if (action.type !== 'ADVANCE') return state;

  const amount = Math.max(0, Number(action.amount) || 0);
  const step = state.reducedMotion ? 1 : amount;
  if (state.phase === FORMATION_PHASES.SMOOTH) {
    return {
      ...state,
      phase: FORMATION_PHASES.IMPACTS,
      impactProgress: state.reducedMotion ? 1 : 0,
    };
  }
  if (state.phase === FORMATION_PHASES.IMPACTS) {
    const progress = clamp(state.impactProgress + step);
    if (progress < 1) return { ...state, impactProgress: progress };
    if (state.impactIndex + 1 < IMPACT_COUNT) {
      return {
        ...state,
        impactIndex: state.impactIndex + 1,
        impactProgress: state.reducedMotion ? 1 : 0,
      };
    }
    return { ...state, phase: FORMATION_PHASES.VOLCANISM, impactIndex: IMPACT_COUNT, impactProgress: 1, lavaProgress: 0 };
  }
  if (state.phase === FORMATION_PHASES.VOLCANISM) {
    const lavaProgress = clamp(state.lavaProgress + step);
    if (lavaProgress < 1) return { ...state, lavaProgress };
    return { ...state, phase: FORMATION_PHASES.FINAL_IMPACTS, lavaProgress: 1, finalImpactIndex: 0, finalImpactProgress: 0 };
  }
  if (state.phase === FORMATION_PHASES.FINAL_IMPACTS) {
    const progress = clamp(state.finalImpactProgress + step);
    if (progress < 1) return { ...state, finalImpactProgress: progress };
    if (state.finalImpactIndex + 1 < FINAL_IMPACT_COUNT) {
      return { ...state, finalImpactIndex: state.finalImpactIndex + 1, finalImpactProgress: 0 };
    }
    return { ...state, phase: FORMATION_PHASES.SUMMARY, finalImpactIndex: FINAL_IMPACT_COUNT, finalImpactProgress: 1 };
  }
  return state;
}

export function getPhaseLabel(state) {
  switch (state.phase) {
    case FORMATION_PHASES.SMOOTH: return '처음의 달';
    case FORMATION_PHASES.IMPACTS: return `충돌 ${Math.min(state.impactIndex + 1, IMPACT_COUNT)} / ${IMPACT_COUNT}`;
    case FORMATION_PHASES.VOLCANISM: return '용암이 흐르는 때';
    case FORMATION_PHASES.FINAL_IMPACTS: return `뒤이은 충돌 ${Math.min(state.finalImpactIndex + 1, FINAL_IMPACT_COUNT)} / ${FINAL_IMPACT_COUNT}`;
    case FORMATION_PHASES.SUMMARY: return '현재의 달';
    default: return '';
  }
}

export function getPhaseProgress(state) {
  switch (state.phase) {
    case FORMATION_PHASES.SMOOTH: return 0;
    case FORMATION_PHASES.IMPACTS: return (state.impactIndex + state.impactProgress) / IMPACT_COUNT;
    case FORMATION_PHASES.VOLCANISM: return state.lavaProgress;
    case FORMATION_PHASES.FINAL_IMPACTS: return (state.finalImpactIndex + state.finalImpactProgress) / FINAL_IMPACT_COUNT;
    case FORMATION_PHASES.SUMMARY: return 1;
    default: return 0;
  }
}

export function isFormationComplete(state) {
  return state.phase === FORMATION_PHASES.SUMMARY;
}
