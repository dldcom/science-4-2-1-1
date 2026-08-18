import { FORMATION_PHASES } from './formationTimeline.js';

// Keep the early-crust material stable while a meteor is in flight. Later
// terrain detail is revealed only after an impact settles.
export function getTerrainMixForState(state) {
  switch (state.phase) {
    case FORMATION_PHASES.SMOOTH:
      return 0;
    case FORMATION_PHASES.IMPACTS: {
      // Do not change the initial crust while the first meteor is still in
      // flight. The next impact state is entered only after it has settled.
      return Number(state.impactIndex) > 0 ? 0.28 : 0;
    }
    case FORMATION_PHASES.VOLCANISM:
      return 0.58;
    case FORMATION_PHASES.FINAL_IMPACTS:
      return 0.78;
    case FORMATION_PHASES.SUMMARY:
      return 1;
    default:
      return 0;
  }
}
