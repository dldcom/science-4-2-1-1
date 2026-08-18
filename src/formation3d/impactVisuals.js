export function getImpactEffectOpacity({ active, reveal }) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  if (!active) return {
    ring: 0,
    shockwave: 0,
    dust: 0,
    plume: 0,
    core: 0,
    meteor: 0,
    dustBurst: 0,
    contactShadow: 0,
    trail: 0,
  };

  const contact = smoothstep(0.46, 0.56, progress);
  const contactFade = 1 - smoothstep(0.68, 0.84, progress);
  const burst = contact * contactFade;
  const trailFade = 1 - smoothstep(0.38, 0.54, progress);
  const flashIn = smoothstep(0.49, 0.54, progress);
  const flashOut = 1 - smoothstep(0.55, 0.67, progress);
  const residualFlash = smoothstep(0.74, 0.82, progress) * (1 - smoothstep(0.9, 0.98, progress)) * 0.05;
  const bodyFade = 1 - smoothstep(0.77, 0.82, progress);
  const dustBurst = getDustBurstProgress(progress) * 0.78;
  const residualTrail = smoothstep(0.78, 0.86, progress) * (1 - smoothstep(0.94, 1.0, progress)) * 0.025;
  const residualDust = smoothstep(0.76, 0.84, progress) * (1 - smoothstep(0.94, 1.0, progress)) * 0.18;
  const residualPlume = smoothstep(0.78, 0.86, progress) * (1 - smoothstep(0.95, 1.0, progress)) * 0.1;
  const contactShadow = Math.max(
    burst * 0.36,
    smoothstep(0.56, 0.72, progress) * (1 - smoothstep(0.84, 0.98, progress)) * 0.24,
  );
  return {
    ring: burst * 0.07,
    shockwave: burst * 0.2,
    dust: Math.max(burst * 0.58, residualDust),
    plume: Math.max(burst * 0.5, residualPlume),
    core: Math.max(flashIn * flashOut * 0.24, residualFlash),
    meteor: bodyFade * 0.96,
    dustBurst,
    contactShadow,
    trail: Math.max(0.48 * trailFade, residualTrail),
  };
}

export function getIncomingImpactIndices(activeIndex, totalCount, maxIncoming = 2) {
  const start = Math.max(0, Math.floor(Number(activeIndex) || 0) + 1);
  const end = Math.min(Number(totalCount) || 0, start + Math.max(0, Math.floor(Number(maxIncoming) || 0)));
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
}

export function getImpactEffectMotion({ active, reveal }) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  if (!active) {
    return {
      trailLength: 0,
      plumeSpread: 0,
      surfaceLight: 0,
    };
  }

  const contact = Math.max(0, Math.min(1, (progress - 0.46) / 0.22));
  const contactFade = Math.max(0, 1 - Math.max(0, Math.min(1, (progress - 0.82) / 0.18)));
  const surfaceLightIn = smoothstep(0.5, 0.56, progress);
  const surfaceLightOut = 1 - smoothstep(0.62, 0.74, progress);
  return {
    trailLength: Math.max(0, 1 - Math.max(0, Math.min(1, (progress - 0.36) / 0.5))),
    plumeSpread: contact * contactFade,
    surfaceLight: surfaceLightIn * surfaceLightOut,
  };
}

// Collision motion is separate from opacity. The rock travels quickly until
// it reaches the surface, pauses for a short contact beat, then sinks into the
// surface while compressing along the impact normal.
export function getImpactCollisionMotion(reveal, meteorRadius = 0.06, impactDepth = 0.06) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  const radius = Math.max(0.01, Number(meteorRadius) || 0.06);
  const depth = Math.max(0.02, Math.min(0.12, Number(impactDepth) || 0.06));
  const startDistance = 2.45;
  const contactDistance = 1 + radius * 1.04;
  const contactStopDistance = contactDistance - radius * 0.06;
  // Once the bowl opens, the meteor center follows the newly excavated
  // surface instead of stopping above the original sphere radius. This lets
  // the lunar mesh occlude its lower half naturally.
  const embeddedDistance = 1 - depth * 0.72 + radius * 0.12;
  const approachEnd = 0.46;
  const contactEnd = 0.53;
  const compressionEnd = 0.67;
  const excavationEnd = 0.82;

  if (progress < approachEnd) {
    const t = progress / approachEnd;
    const approachCurve = t * 0.82 + smoothstep(0.12, 1, t) * 0.18;
    return {
      phase: 'approach',
      centerDistance: startDistance + (contactDistance - startDistance) * approachCurve,
      speed: 1 - t * 0.08,
      pathOffset: 1 - smoothstep(0.04, 1, t),
      contactPulse: 0,
      burial: 0,
      squash: 0,
      compression: 0,
    };
  }

  if (progress < contactEnd) {
    const t = (progress - approachEnd) / (contactEnd - approachEnd);
    const stop = smoothstep(0, 1, t);
    return {
      phase: 'contact',
      centerDistance: contactDistance + (contactStopDistance - contactDistance) * stop,
      speed: 0.18 * (1 - stop),
      pathOffset: 0,
      contactPulse: Math.sin(Math.PI * t),
      burial: 0.06 * stop,
      squash: 0.08 * stop,
      compression: 0.28 * stop,
    };
  }

  if (progress < compressionEnd) {
    const t = smoothstep(0, 1, (progress - contactEnd) / (compressionEnd - contactEnd));
    return {
      phase: 'compression',
      centerDistance: contactStopDistance + (embeddedDistance - contactStopDistance) * t * 0.62,
      speed: 0.16 * (1 - t),
      pathOffset: 0,
      contactPulse: 1 - t,
      burial: 0.06 + 0.38 * t,
      squash: 0.08 + 0.46 * t,
      compression: 0.28 + 0.72 * t,
    };
  }

  if (progress < excavationEnd) {
    const t = smoothstep(0, 1, (progress - compressionEnd) / (excavationEnd - compressionEnd));
    return {
      phase: 'excavation',
      centerDistance: contactStopDistance + (embeddedDistance - contactStopDistance) * (0.62 + 0.38 * t),
      speed: 0.08 * (1 - t),
      pathOffset: 0,
      contactPulse: 0,
      burial: 0.44 + 0.56 * t,
      squash: 0.54 - 0.1 * t,
      compression: 1 - 0.28 * t,
    };
  }

  return {
    phase: 'settle',
    centerDistance: embeddedDistance,
    speed: 0,
    pathOffset: 0,
    contactPulse: 0,
    burial: 1,
    squash: 0.44,
    compression: 0.72,
  };
}

function smoothstep(edge0, edge1, value) {
  const range = Math.max(edge1 - edge0, 0.0001);
  const t = Math.max(0, Math.min(1, (value - edge0) / range));
  return t * t * (3 - 2 * t);
}

// The crater is an energy footprint, not a stamp with the meteor's outline.
// Keep it absent during flight, let a shallow depression appear at contact,
// then open the broad bowl/rim over the same beat in which the meteor buries.
export function getImpactTerrainReveal(reveal) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  return smoothstep(0.52, 0.82, progress);
}

// A visible impact needs a short "embedded" beat. The body is occluded by
// the lunar surface as this value rises, instead of disappearing at contact.
export function getMeteorBurialProgress(reveal) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  return smoothstep(0.46, 0.82, progress);
}

// A short regolith burst replaces repeated fragment arcs. It starts as the
// body disappears, pops upward briefly, then spreads flat and settles.
export function getDustBurstProgress(reveal) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  const impactBurst = smoothstep(0.5, 0.57, progress) * (1 - smoothstep(0.66, 0.8, progress));
  const residualCloud = smoothstep(0.72, 0.8, progress)
    * (1 - smoothstep(0.8, 0.995, progress))
    * 0.42;
  return Math.max(impactBurst, residualCloud);
}

// Dust moves irregularly: a small upward pop peaks first, while its horizontal
// spread keeps increasing as the grains fall back onto the surface.
export function getDustBurstMotion(reveal) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  const spread = smoothstep(0.5, 0.96, progress);
  const liftIn = smoothstep(0.5, 0.62, progress);
  const liftOut = 1 - smoothstep(0.62, 0.92, progress);
  return {
    spread,
    lift: liftIn * liftOut,
  };
}

// The volumetric dust has its own shallow normal offset. It briefly rises
// above the surface at contact, spreads along the tangent plane, then settles
// back into the crater before the event disappears.
export function getDustVolumeMotion(reveal) {
  const progress = Math.max(0, Math.min(1, Number(reveal) || 0));
  const launch = smoothstep(0.48, 0.56, progress);
  const settle = 1 - smoothstep(0.72, 0.92, progress);
  const cover = launch * settle;
  const spread = Math.max(smoothstep(0.46, 0.66, progress), cover * 0.82);
  const rise = smoothstep(0.5, 0.61, progress) * (1 - smoothstep(0.68, 0.92, progress));
  const surfaceSpread = smoothstep(0.56, 0.94, progress);
  const normalOffset = 0.012 + cover * 0.022 + rise * 0.012;
  const opacity = getDustBurstProgress(progress);
  return {
    spread,
    normalOffset,
    opacity,
    cover,
    rise,
    surfaceSpread,
    meteorVisibility: 1 - cover * 0.96,
  };
}

// Use several low-density, differently placed lobes. A single closed sphere
// reads as a shell; separated lobes read as loose regolith lifted from the
// contact point and then spread across the surface.
export const DUST_VOLUME_LAYER_CONFIG = Object.freeze([
  Object.freeze({
    tangent: 0.00,
    bitangent: 0.02,
    lift: 0.32,
    width: 0.72,
    height: 2.15,
    depth: 0.62,
    opacity: 0.78,
    sizeMultiplier: 0.92,
    riseMultiplier: 1.18,
    phase: 0.35,
  }),
  Object.freeze({
    tangent: -0.48,
    bitangent: 0.05,
    lift: 0.055,
    width: 1.18,
    height: 0.78,
    depth: 0.62,
    opacity: 0.46,
    sizeMultiplier: 0.9,
    riseMultiplier: 0.72,
    phase: 1.4,
  }),
  Object.freeze({
    tangent: 0.56,
    bitangent: -0.04,
    lift: 0.045,
    width: 1.36,
    height: 0.62,
    depth: 0.54,
    opacity: 0.42,
    sizeMultiplier: 0.88,
    riseMultiplier: 0.58,
    phase: 2.35,
  }),
  Object.freeze({
    tangent: 0.12,
    bitangent: 0.34,
    lift: 0.09,
    width: 0.92,
    height: 1.08,
    depth: 0.58,
    opacity: 0.34,
    sizeMultiplier: 0.82,
    riseMultiplier: 0.86,
    phase: 3.2,
  }),
]);

export const DUST_VOLUME_SHADER_CONFIG = Object.freeze({
  color: 0x7f858b,
  densityScale: 1.38,
  edgeWidth: 0.54,
  opacityBoost: 1.58,
});

