import { describe, expect, it } from 'vitest';
import { moonFragmentShader } from './moonFormationShader.js';

describe('crater surface rendering', () => {
  it('keeps ejecta as a subtle radial texture instead of a dark decal halo', () => {
    expect(moonFragmentShader).toContain('float ejectaFactor');
    expect(moonFragmentShader).toContain('vec3 ejectaColor');
    expect(moonFragmentShader).not.toContain('baseColor = mix(baseColor, decal.rgb, amount)');
  });

  it('uses a restrained transient compression contrast while the crater reads as terrain', () => {
    expect(moonFragmentShader).toContain('float compression = mix(0.13, 0.34, transientReveal);');
    expect(moonFragmentShader).toContain('bowl * compression');
    expect(moonFragmentShader).toContain('rimVariation');
    expect(moonFragmentShader).toContain('rim * mix(0.20, 0.24, transientReveal)');
  });

  it('adds temporary compression contrast while the basin is opening', () => {
    expect(moonFragmentShader).toContain('out float transientReveal');
    expect(moonFragmentShader).toContain('uniform float uImpactCompression[7];');
    expect(moonFragmentShader).toContain('max(uImpactLightStrength[i], uImpactCompression[i])');
    expect(moonFragmentShader).toContain('float compression = mix(0.13, 0.34, transientReveal);');
  });

  it('keeps cooled mare visible when the final detailed lunar surface is revealed', () => {
    expect(moonFragmentShader).toContain('float settledMare = max(cooledRegion, basin * smoothstep(0.84, 1.0, lavaProgress));');
    expect(moonFragmentShader).toContain('baseColor = mix(baseColor, basaltColor, settledMare * 0.68);');
  });

  it('makes the lava fill read as a broad basin change before cooling', () => {
    expect(moonFragmentShader).toContain('float filledLava');
    expect(moonFragmentShader).toContain('vec3 lavaPoolColor');
    expect(moonFragmentShader).toContain('baseColor = mix(baseColor, lavaPoolColor');
  });

  it('keeps fractures subtle before and during the lava reveal', () => {
    expect(moonFragmentShader).toContain('float crackStrength = mix(0.10, 0.24, lavaActive);');
    expect(moonFragmentShader).toContain('float crackFront = 1.0 - smoothstep(0.0, 0.075, abs(crackArrival - lavaProgress));');
    expect(moonFragmentShader).not.toContain('crack * 0.52');
  });

  it('separates the first crater relief from the detailed terrain material', () => {
    expect(moonFragmentShader).toContain('float crackStrength = mix(0.10, 0.24, lavaActive);');
  });

  it('adds a restrained local warm reflection for the active impact only', () => {
    expect(moonFragmentShader).toContain('uImpactLightDirections');
    expect(moonFragmentShader).toContain('uImpactLightStrength');
    expect(moonFragmentShader).toContain('impactLight');
  });

  it('uses a narrow transient contact shadow in the surface shader instead of a flat decal', () => {
    expect(moonFragmentShader).toContain('uniform float uImpactContactShadow[7];');
    expect(moonFragmentShader).toContain('float impactContactShadow(vec3 direction)');
    expect(moonFragmentShader).toContain('contactShadow * 0.32');
    expect(moonFragmentShader).not.toContain('uImpactContactShadow[i] * decal');
  });
});
