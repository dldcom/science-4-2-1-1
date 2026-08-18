import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FORMATION_ASSETS } from './assetManifest.js';
import {
  createDustPuffGeometry,
  createMeteorGeometry,
  METEOR_SHAPE_CONFIG,
} from './MoonFormationScene.js';
import {
  getImpactEffectMotion,
  getImpactEffectOpacity,
  getImpactTerrainReveal,
  getMeteorBurialProgress,
  getDustBurstProgress,
  getDustBurstMotion,
  getDustVolumeMotion,
  getImpactCollisionMotion,
  getIncomingImpactIndices,
  DUST_VOLUME_LAYER_CONFIG,
  DUST_VOLUME_SHADER_CONFIG,
} from './impactVisuals.js';

const moonSceneSource = readFileSync(new URL('./MoonFormationScene.js', import.meta.url), 'utf8');

describe('impact visual timing', () => {
  it('keeps two later meteors visible as incoming companions', () => {
    expect(getIncomingImpactIndices(0, 4)).toEqual([1, 2]);
    expect(getIncomingImpactIndices(2, 4)).toEqual([3]);
    expect(getIncomingImpactIndices(3, 4)).toEqual([]);
  });

  it('fades the transient ring and dust after the impact', () => {
    const settled = getImpactEffectOpacity({ active: false, reveal: 1 });
    expect(settled.ring).toBe(0);
    expect(settled.dust).toBe(0);
    expect(settled.core).toBe(0);
  });

  it('keeps the meteor and trail dominant during flight', () => {
    const flight = getImpactEffectOpacity({ active: true, reveal: 0.3 });
    expect(flight.meteor).toBeGreaterThan(0.9);
    expect(flight.trail).toBeGreaterThan(0.3);
    expect(flight.core).toBe(0);
  });

  it('peaks with a restrained surface response at contact', () => {
    const contact = getImpactEffectOpacity({ active: true, reveal: 0.58 });
    expect(contact.ring).toBeGreaterThan(0.05);
    expect(contact.ring).toBeLessThan(0.1);
    expect(contact.shockwave).toBeGreaterThan(0.1);
    expect(contact.shockwave).toBeLessThan(0.25);
    expect(contact.dust).toBeGreaterThan(0.5);
    expect(contact.plume).toBeGreaterThan(0.4);
    expect(contact.core).toBeGreaterThan(0.15);
    expect(contact.core).toBeLessThan(0.3);
    expect(contact.contactShadow).toBeGreaterThan(0.1);
  });

  it('fades every transient layer after the event settles', () => {
    const settled = getImpactEffectOpacity({ active: false, reveal: 1 });
    expect(settled.shockwave).toBe(0);
    expect(settled.plume).toBe(0);
    expect(settled.meteor).toBe(0);
    expect(settled.trail).toBe(0);
  });

  it('shortens the meteor wake and expands the contact plume over time', () => {
    const flight = getImpactEffectMotion({ active: true, reveal: 0.3 });
    const contact = getImpactEffectMotion({ active: true, reveal: 0.72 });
    const burial = getImpactEffectMotion({ active: true, reveal: 0.77 });
    expect(flight.trailLength).toBeGreaterThan(contact.trailLength);
    expect(contact.plumeSpread).toBeGreaterThan(flight.plumeSpread);
    expect(contact.surfaceLight).toBeGreaterThan(0);
    expect(burial.surfaceLight).toBeLessThan(contact.surfaceLight);
  });

  it('removes the long meteor wake before the surface dust peak', () => {
    const contact = getImpactEffectOpacity({ active: true, reveal: 0.72 });
    expect(contact.trail).toBeLessThan(0.12);
  });

  it('lets the flash fall before the meteor finishes burying', () => {
    const contact = getImpactEffectOpacity({ active: true, reveal: 0.58 });
    const burial = getImpactEffectOpacity({ active: true, reveal: 0.77 });
    expect(contact.core).toBeGreaterThan(0.15);
    expect(burial.core).toBeLessThan(0.2);
    expect(burial.meteor).toBeGreaterThan(0.8);
  });

  it('hides the meteor behind the regolith plume before late settling', () => {
    const plumePeak = getImpactEffectOpacity({ active: true, reveal: 0.6 });
    const lateBurial = getImpactEffectOpacity({ active: true, reveal: 0.84 });
    expect(plumePeak.meteor).toBeGreaterThan(0.8);
    expect(lateBurial.meteor).toBe(0);
  });

  it('opens the basin progressively instead of revealing the full crater at first contact', () => {
    const approach = getImpactTerrainReveal(0.3);
    const contact = getImpactTerrainReveal(0.58);
    const late = getImpactTerrainReveal(0.82);
    expect(approach).toBe(0);
    expect(contact).toBeGreaterThan(0);
    expect(contact).toBeLessThan(0.5);
    expect(late).toBeGreaterThan(0.8);
  });

  it('keeps the meteor partially embedded during the crater-opening beat', () => {
    expect(getMeteorBurialProgress(0.58)).toBeGreaterThan(0);
    expect(getMeteorBurialProgress(0.58)).toBeLessThan(0.5);
    expect(getMeteorBurialProgress(0.82)).toBeGreaterThan(0.85);
    expect(getMeteorBurialProgress(0.94)).toBe(1);
  });

  it('bursts surface dust after the meteor body disappears and clears it at settlement', () => {
    expect(getDustBurstProgress(0.46)).toBe(0);
    expect(getDustBurstProgress(0.58)).toBeGreaterThan(0.7);
    expect(getDustBurstProgress(0.74)).toBeGreaterThan(0);
    expect(getDustBurstProgress(0.86)).toBeGreaterThan(0);
    expect(getDustBurstProgress(0.9)).toBeGreaterThan(0);
    expect(getDustBurstProgress(0.99)).toBeGreaterThan(0);
    expect(getDustBurstProgress(1)).toBe(0);
  });

  it('keeps a short residual dust burst after the meteor body is gone', () => {
    const settling = getImpactEffectOpacity({ active: true, reveal: 0.88 });
    const lateSettling = getImpactEffectOpacity({ active: true, reveal: 0.96 });
    expect(settling.meteor).toBeLessThan(0.1);
    expect(settling.dustBurst).toBeGreaterThan(0);
    expect(settling.trail).toBeGreaterThan(0);
    expect(settling.core).toBeGreaterThan(0);
    expect(settling.dust).toBeGreaterThan(0);
    expect(lateSettling.dustBurst).toBeGreaterThan(0);
    expect(lateSettling.dust).toBeGreaterThan(0);
    expect(getImpactEffectOpacity({ active: true, reveal: 1 }).dustBurst).toBe(0);
  });

  it('lets the residual plume settle instead of holding a full circular shell', () => {
    expect(getDustBurstProgress(0.84)).toBeGreaterThan(getDustBurstProgress(0.9));
    expect(getDustBurstProgress(0.9)).toBeGreaterThan(getDustBurstProgress(0.99));
  });

  it('makes the dust burst pop upward briefly before spreading flat', () => {
    const launch = getDustBurstMotion(0.52);
    const peak = getDustBurstMotion(0.62);
    const settle = getDustBurstMotion(0.97);
    expect(launch.spread).toBeGreaterThan(0);
    expect(peak.spread).toBeGreaterThan(launch.spread);
    expect(peak.lift).toBeGreaterThan(launch.lift);
    expect(settle.lift).toBeLessThan(peak.lift);
    expect(settle.spread).toBeGreaterThan(peak.spread);
  });

  it('keeps the volumetric regolith briefly above the surface before it settles', () => {
    const contact = getDustVolumeMotion(0.58);
    const residual = getDustVolumeMotion(0.88);
    const settled = getDustVolumeMotion(1);
    expect(contact.normalOffset).toBeGreaterThan(0.03);
    expect(contact.spread).toBeGreaterThan(0.5);
    expect(contact.cover).toBeGreaterThan(0.8);
    expect(contact.meteorVisibility).toBeLessThan(0.4);
    expect(contact.rise).toBeGreaterThan(residual.rise);
    expect(contact.rise).toBeGreaterThan(0.45);
    expect(residual.normalOffset).toBeLessThan(contact.normalOffset);
    expect(residual.spread).toBeGreaterThan(0.6);
    expect(residual.surfaceSpread).toBeGreaterThan(contact.surfaceSpread);
    expect(settled.opacity).toBe(0);
    expect(settled.rise).toBe(0);
  });

  it('uses asymmetric open plume lobes instead of one closed dust shell', () => {
    expect(DUST_VOLUME_LAYER_CONFIG.length).toBeGreaterThanOrEqual(3);
    expect(new Set(DUST_VOLUME_LAYER_CONFIG.map((layer) => layer.tangent)).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...DUST_VOLUME_LAYER_CONFIG.map((layer) => layer.lift))).toBeGreaterThan(0.1);
    expect(Math.min(...DUST_VOLUME_LAYER_CONFIG.map((layer) => layer.lift))).toBeLessThan(0.1);
    expect(DUST_VOLUME_SHADER_CONFIG.densityScale).toBeGreaterThanOrEqual(1.2);
    expect(DUST_VOLUME_SHADER_CONFIG.edgeWidth).toBeLessThanOrEqual(0.58);
  });

  it('keeps the meteor outside the surface during approach, then embeds it after a hard contact stop', () => {
    const flight = getImpactCollisionMotion(0.3, 0.06);
    const contact = getImpactCollisionMotion(0.48, 0.06);
    const compression = getImpactCollisionMotion(0.58, 0.06);
    const excavation = getImpactCollisionMotion(0.74, 0.06);
    expect(flight.phase).toBe('approach');
    expect(flight.centerDistance).toBeGreaterThan(1.06);
    expect(flight.speed).toBeGreaterThan(contact.speed);
    expect(contact.phase).toBe('contact');
    expect(contact.contactPulse).toBeGreaterThan(0);
    expect(compression.phase).toBe('compression');
    expect(compression.centerDistance).toBeLessThan(contact.centerDistance);
    expect(compression.squash).toBeGreaterThan(0);
    expect(compression.compression).toBeGreaterThan(0);
    expect(excavation.phase).toBe('excavation');
    expect(excavation.burial).toBeGreaterThan(0.5);
    expect(excavation.centerDistance).toBeLessThan(compression.centerDistance);
    expect(getImpactCollisionMotion(0.82, 0.06).centerDistance).toBeLessThan(1);
  });

  it('removes all transient geometry after settling', () => {
    const settled = getImpactEffectMotion({ active: false, reveal: 1 });
    expect(settled.trailLength).toBe(0);
    expect(settled.plumeSpread).toBe(0);
    expect(settled.surfaceLight).toBe(0);
  });

  it('provides separate meteor surface maps for rock relief and roughness', () => {
    expect(FORMATION_ASSETS.meteorNormal).toContain('moon-meteor-normal-256.webp');
    expect(FORMATION_ASSETS.meteorRoughness).toContain('moon-meteor-roughness-256.webp');
  });

  it('uses smooth irregular dust volumes instead of a faceted rock primitive', () => {
    const geometry = createDustPuffGeometry(1.7);
    expect(geometry.attributes.position.count).toBeGreaterThan(100);
    expect(geometry.attributes.normal.count).toBe(geometry.attributes.position.count);
    expect(geometry.attributes.uv.count).toBe(geometry.attributes.position.count);
    expect(DUST_VOLUME_LAYER_CONFIG.length).toBeGreaterThanOrEqual(3);
    expect(DUST_VOLUME_LAYER_CONFIG[0].opacity).toBeGreaterThan(0.5);
    expect(DUST_VOLUME_LAYER_CONFIG[0].height).toBeGreaterThan(1.8);
    expect(DUST_VOLUME_LAYER_CONFIG[0].sizeMultiplier).toBeGreaterThan(0.75);
    expect(DUST_VOLUME_SHADER_CONFIG.densityScale).toBeGreaterThanOrEqual(1.2);
    expect(DUST_VOLUME_SHADER_CONFIG.edgeWidth).toBeLessThanOrEqual(0.58);
    expect(DUST_VOLUME_SHADER_CONFIG.color).toBe(0x7f858b);
    expect(moonSceneSource).toContain('side: THREE.FrontSide');
    expect(moonSceneSource).toContain('float rayEnd = -rayB + root;');
    expect(moonSceneSource).toContain('float cloudBoundary =');
    expect(moonSceneSource).toContain('float shapeNoise = cloudNoise');
    expect(moonSceneSource).toContain('float pocketMask = smoothstep');
    expect(moonSceneSource).toContain('this.dustSurfaceOffset');
    expect(moonSceneSource).toContain('uCameraLocalPosition');
    expect(moonSceneSource).toContain('for (int step = 0; step < 18; step += 1)');
    expect(moonSceneSource).toContain('float sampleAlpha =');
    expect(moonSceneSource).toContain('vec4 textureSample = texture2D(uDustTexture, vec2(0.5));');
    expect(moonSceneSource).toContain('float textureAlpha = texture2D(uDustTexture, densityUv).a');
    expect(moonSceneSource).toContain('uCameraLocalPosition.value.copy');
    expect(moonSceneSource).toContain('this.scene.updateMatrixWorld(true);');
    expect(moonSceneSource).toContain('layer.updateMatrixWorld(true);');
    expect(moonSceneSource.indexOf('layer.updateMatrixWorld(true);')).toBeLessThan(
      moonSceneSource.indexOf('uCameraLocalPosition.value.copy(cameraLocalPosition);'),
    );
    expect(moonSceneSource).not.toContain('alphaMap: dustTexture');
    geometry.dispose();
  });

  it('keeps the lifted plume legible against the low-contrast lunar surface', () => {
    expect(DUST_VOLUME_SHADER_CONFIG.densityScale).toBeGreaterThanOrEqual(1.2);
    expect(DUST_VOLUME_SHADER_CONFIG.edgeWidth).toBeLessThanOrEqual(0.58);
    expect(DUST_VOLUME_LAYER_CONFIG[0].opacity).toBeGreaterThanOrEqual(0.7);
    expect(DUST_VOLUME_SHADER_CONFIG.color).not.toBe(0x9a8774);
    expect(DUST_VOLUME_SHADER_CONFIG.opacityBoost).toBeGreaterThanOrEqual(1.55);
  });

  it('uses a rounded boulder silhouette instead of a granola-like faceted meteor', () => {
    const geometry = createMeteorGeometry(1);
    const position = geometry.attributes.position;
    const radii = [];
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      radii.push(Math.hypot(position.getX(vertex), position.getY(vertex), position.getZ(vertex)));
    }
    const minRadius = Math.min(...radii);
    const maxRadius = Math.max(...radii);
    expect(maxRadius / minRadius).toBeLessThan(1.12);
    expect(METEOR_SHAPE_CONFIG.radialVariation).toBeLessThanOrEqual(0.06);
    expect(METEOR_SHAPE_CONFIG.scale.x).toBeLessThanOrEqual(1.1);
    expect(METEOR_SHAPE_CONFIG.scale.y).toBeGreaterThanOrEqual(0.9);
    expect(METEOR_SHAPE_CONFIG.normalScale).toBeLessThanOrEqual(0.08);
    expect(moonSceneSource).toContain('new THREE.SphereGeometry(radius, 32, 20)');
    expect(moonSceneSource).not.toContain('map: meteorTexture');
    geometry.dispose();
  });

  it('does not add flat dust cards on top of the volumetric regolith cloud', () => {
    expect(moonSceneSource).not.toContain('createDustPlume');
    expect(moonSceneSource).not.toContain('createDustBurstCloud');
    expect(moonSceneSource).not.toContain('event.radius * 1.12, dustTexture');
    expect(moonSceneSource).not.toContain('event.radius * 1.18, dustTexture');
  });
});
