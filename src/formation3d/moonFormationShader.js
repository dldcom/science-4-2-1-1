export const moonVertexShader = /* glsl */ `
  uniform sampler2D uHeightMap;
  uniform sampler2D uEarlyCrustHeightMap;
  uniform sampler2D uBasinMask;
  uniform float uTerrainMix;
  uniform vec3 uCraterDirections[7];
  uniform float uCraterRadii[7];
  uniform float uCraterDepth[7];
  uniform float uCraterRimHeight[7];
  uniform float uCraterReveal[7];
  uniform float uImpactCompression[7];

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vLocalDirection;

  float craterRelief(vec3 direction) {
    float relief = 0.0;
    for (int i = 0; i < 7; i += 1) {
      float angle = acos(clamp(dot(direction, uCraterDirections[i]), -1.0, 1.0));
      float normalizedDistance = angle / max(uCraterRadii[i], 0.001);
      float bowl = 1.0 - smoothstep(0.0, 0.72, normalizedDistance);
      float rim = smoothstep(0.62, 0.92, normalizedDistance) * (1.0 - smoothstep(0.92, 1.14, normalizedDistance));
      float angularNoise = (
        sin(direction.x * 17.0 + direction.y * 9.0)
        + sin(direction.y * 23.0 - direction.z * 13.0)
        + sin(direction.z * 29.0 + direction.x * 7.0)
        + 3.0
      ) / 6.0;
      float rimVariation = 0.72 + angularNoise * 0.42;
      relief += uCraterReveal[i] * (-uCraterDepth[i] * bowl + uCraterRimHeight[i] * rim * rimVariation);
      float transientBowl = 1.0 - smoothstep(0.0, 0.56, normalizedDistance);
      float transientRim = smoothstep(0.42, 0.82, normalizedDistance) * (1.0 - smoothstep(0.82, 1.06, normalizedDistance));
      relief += uImpactCompression[i] * (
        -uCraterDepth[i] * 0.42 * transientBowl
        + uCraterRimHeight[i] * 0.28 * transientRim * rimVariation
      );
    }
    return relief;
  }

  void main() {
    vUv = uv;
    vLocalDirection = normalize(position);
    float detailedHeight = texture2D(uHeightMap, uv).r;
    float earlyHeight = texture2D(uEarlyCrustHeightMap, uv).r;
    float basin = texture2D(uBasinMask, uv).r;
    float height = mix(earlyHeight, detailedHeight, smoothstep(0.05, 0.9, uTerrainMix));
    float elevation = mix(0.006, 0.064, uTerrainMix) * (height - 0.5);
    float basinDepression = -0.018 * basin * smoothstep(0.2, 0.7, uTerrainMix);
    // Crater relief is driven by the impact reveal, not by detailed terrain
    // material. The first crater can therefore form while the early crust
    // remains visually smooth.
    float crater = craterRelief(vLocalDirection);
    vec3 displaced = position + normal * (elevation + basinDepression + crater);
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const moonFragmentShader = /* glsl */ `
  uniform sampler2D uColorMap;
  uniform sampler2D uEarlyCrustMap;
  uniform sampler2D uBasaltMap;
  uniform sampler2D uBasinMask;
  uniform sampler2D uCrackMask;
  uniform sampler2D uLavaArrivalMap;
  uniform sampler2D uCraterDecal;
  uniform float uTerrainMix;
  uniform float uLavaProgress;
  uniform float uFinalMix;
  uniform float uCrackReveal;
  uniform float uTime;
  uniform vec3 uCraterDirections[7];
  uniform float uCraterRadii[7];
  uniform float uCraterEjectaScale[7];
  uniform float uCraterReveal[7];
  uniform float uImpactCompression[7];
  uniform vec3 uImpactLightDirections[7];
  uniform float uImpactLightStrength[7];
  uniform float uImpactContactShadow[7];

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vLocalDirection;

  void craterSurface(vec3 direction, out float bowl, out float rim, out float transientReveal) {
    bowl = 0.0;
    rim = 0.0;
    transientReveal = 0.0;
    for (int i = 0; i < 7; i += 1) {
      float angle = acos(clamp(dot(direction, uCraterDirections[i]), -1.0, 1.0));
      float normalizedDistance = angle / max(uCraterRadii[i], 0.001);
      float reveal = uCraterReveal[i];
      bowl = max(bowl, reveal * (1.0 - smoothstep(0.0, 0.72, normalizedDistance)));
      float angularNoise = (
        sin(direction.x * 17.0 + direction.y * 9.0)
        + sin(direction.y * 23.0 - direction.z * 13.0)
        + sin(direction.z * 29.0 + direction.x * 7.0)
        + 3.0
      ) / 6.0;
      float rimVariation = 0.68 + angularNoise * 0.48;
      rim = max(rim, reveal * smoothstep(0.58, 0.9, normalizedDistance) * (1.0 - smoothstep(0.9, 1.16, normalizedDistance)) * rimVariation);
      transientReveal = max(transientReveal, max(uImpactLightStrength[i], uImpactCompression[i]));
    }
  }

  vec2 craterDecalUv(vec3 direction, vec3 craterDirection, float radius) {
    vec3 axis = abs(craterDirection.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(axis, craterDirection));
    vec3 bitangent = normalize(cross(craterDirection, tangent));
    vec3 tangentPart = direction - craterDirection * dot(direction, craterDirection);
    float scale = max(sin(radius), 0.001);
    vec2 local = vec2(dot(tangentPart, tangent), dot(tangentPart, bitangent)) / scale;
    return vec2(0.5) + local * 0.5;
  }

  void applyCraterDecals(vec3 direction, inout vec3 baseColor) {
    for (int i = 0; i < 7; i += 1) {
      float angle = acos(clamp(dot(direction, uCraterDirections[i]), -1.0, 1.0));
      float normalizedDistance = angle / max(uCraterRadii[i], 0.001);
      float ejectaReach = uCraterEjectaScale[i];
      if (normalizedDistance < ejectaReach) {
        vec2 decalUv = craterDecalUv(direction, uCraterDirections[i], uCraterRadii[i] * ejectaReach);
        vec4 decal = texture2D(uCraterDecal, decalUv);
        float edge = 1.0 - smoothstep(ejectaReach * 0.76, ejectaReach, normalizedDistance);
        float outsideBowl = smoothstep(0.82, 1.02, normalizedDistance);
        float ejectaFactor = clamp(decal.a * edge * outsideBowl * uCraterReveal[i] * 0.42, 0.0, 1.0);
        float ejectaTexture = dot(decal.rgb, vec3(0.299, 0.587, 0.114));
        vec3 ejectaColor = baseColor * mix(0.94, 1.08, ejectaTexture);
        baseColor = mix(baseColor, ejectaColor, ejectaFactor);
      }
    }
  }

  float impactSurfaceLight(vec3 direction) {
    float impactLight = 0.0;
    for (int i = 0; i < 7; i += 1) {
      float angularDistance = acos(clamp(dot(direction, uImpactLightDirections[i]), -1.0, 1.0));
      float radius = max(uCraterRadii[i], 0.001);
      float localFalloff = 1.0 - smoothstep(radius * 0.12, radius * 1.42, angularDistance);
      impactLight = max(impactLight, uImpactLightStrength[i] * localFalloff);
    }
    return impactLight;
  }

  float impactContactShadow(vec3 direction) {
    float shadow = 0.0;
    for (int i = 0; i < 7; i += 1) {
      float angularDistance = acos(clamp(dot(direction, uCraterDirections[i]), -1.0, 1.0));
      float radius = max(uCraterRadii[i], 0.001);
      float contactShadow = uImpactContactShadow[i]
        * (1.0 - smoothstep(radius * 0.08, radius * 0.54, angularDistance));
      shadow = max(shadow, contactShadow);
    }
    return shadow;
  }

  void main() {
    vec3 detailedColor = texture2D(uColorMap, vUv).rgb;
    vec3 earlyCrustColor = texture2D(uEarlyCrustMap, vUv).rgb;
    vec3 basaltColor = texture2D(uBasaltMap, vUv).rgb;
    float basin = texture2D(uBasinMask, vUv).r;
    float lavaArrival = texture2D(uLavaArrivalMap, vUv).r;
    float terrainMix = smoothstep(0.04, 0.92, uTerrainMix);
    vec3 baseColor = mix(earlyCrustColor, detailedColor, terrainMix);
    float lavaProgress = clamp(uLavaProgress, 0.0, 1.0);
    float lavaActive = step(0.001, lavaProgress);
    float arrivalDistance = abs(lavaArrival - lavaProgress);
    float lavaRegion = (1.0 - smoothstep(lavaProgress - 0.08, lavaProgress + 0.12, lavaArrival)) * basin * lavaActive;
    float lavaFront = (1.0 - smoothstep(0.0, 0.055, arrivalDistance)) * basin * lavaActive;
    float filledLava = basin * smoothstep(0.14, 0.68, lavaProgress) * lavaActive;
    vec3 lavaPoolColor = mix(vec3(0.92, 0.16, 0.025), basaltColor * 0.78, smoothstep(0.52, 0.92, lavaProgress));
    float basinFill = basin * smoothstep(0.7, 1.0, lavaProgress);
    float cooledRegion = max(basinFill * 0.92, lavaRegion * smoothstep(0.44, 0.82, lavaProgress));
    vec3 coolingColor = mix(vec3(0.9, 0.13, 0.018), basaltColor * 0.72, smoothstep(0.42, 0.86, lavaProgress));
    float glow = (0.72 + 0.28 * sin(uTime * 5.0 + vUv.x * 18.0 + vUv.y * 9.0)) * (1.0 - smoothstep(0.54, 0.9, lavaProgress));

    baseColor = mix(baseColor, basaltColor, cooledRegion * 0.78);
    baseColor = mix(baseColor, lavaPoolColor, filledLava * 0.52);
    baseColor = mix(baseColor, coolingColor, lavaRegion * 0.38);
    baseColor += vec3(1.0, 0.13, 0.018) * lavaFront * glow * 0.72;

    float crack = texture2D(uCrackMask, vUv).r * uCrackReveal;
    float crackArrival = texture2D(uLavaArrivalMap, vUv).r;
    float crackFront = 1.0 - smoothstep(0.0, 0.075, abs(crackArrival - lavaProgress));
    float crackGlow = crack * crackFront * lavaActive * (1.0 - smoothstep(0.22, 0.92, lavaProgress));
    float crackStrength = mix(0.10, 0.24, lavaActive);
    baseColor = mix(baseColor, baseColor * vec3(0.42, 0.45, 0.5), crack * crackStrength);
    baseColor += vec3(1.0, 0.12, 0.015) * crackGlow * (0.35 + 0.65 * sin(uTime * 4.0 + vUv.x * 24.0)) * 0.54;
    baseColor = mix(baseColor, detailedColor, clamp(uFinalMix, 0.0, 1.0));
    float settledMare = max(cooledRegion, basin * smoothstep(0.84, 1.0, lavaProgress));
    baseColor = mix(baseColor, basaltColor, settledMare * 0.68);

    applyCraterDecals(vLocalDirection, baseColor);

    float bowl;
    float rim;
    float transientReveal;
    craterSurface(vLocalDirection, bowl, rim, transientReveal);
    float compression = mix(0.13, 0.34, transientReveal);
    baseColor *= 1.0 - bowl * compression;
    baseColor += vec3(0.18, 0.17, 0.15) * rim * mix(0.20, 0.24, transientReveal);

    float impactLight = impactSurfaceLight(vLocalDirection);
    baseColor += vec3(1.0, 0.22, 0.045) * impactLight * 0.42;
    float contactShadow = impactContactShadow(vLocalDirection);
    baseColor *= 1.0 - contactShadow * 0.32;

    vec3 sunDirection = normalize(vec3(-0.52, 0.42, 0.88));
    float light = 0.42 + max(dot(normalize(vNormal), sunDirection), 0.0) * 0.74;
    float edge = pow(1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0), 2.2);
    baseColor *= light;
    baseColor += vec3(0.16, 0.2, 0.28) * edge * 0.13;

    gl_FragColor = vec4(baseColor, 1.0);
  }
`;

export function createMoonUniforms({ color, earlyCrust, basalt, height, earlyCrustHeight, basinMask, crackMask, lavaArrival, craterDecal, craterDirections, craterRadii, craterDepth, craterRimHeight, craterEjectaScale }) {
  return {
    uColorMap: { value: color },
    uEarlyCrustMap: { value: earlyCrust },
    uBasaltMap: { value: basalt },
    uHeightMap: { value: height },
    uEarlyCrustHeightMap: { value: earlyCrustHeight },
    uBasinMask: { value: basinMask },
    uCrackMask: { value: crackMask },
    uLavaArrivalMap: { value: lavaArrival },
    uCraterDecal: { value: craterDecal },
    uTerrainMix: { value: 0 },
    uLavaProgress: { value: 0 },
    uFinalMix: { value: 0 },
    uCrackReveal: { value: 0 },
    uTime: { value: 0 },
    uCraterDirections: { value: craterDirections },
    uCraterRadii: { value: craterRadii },
    uCraterDepth: { value: craterDepth },
    uCraterRimHeight: { value: craterRimHeight },
    uCraterEjectaScale: { value: craterEjectaScale },
    uCraterReveal: { value: [0, 0, 0, 0, 0, 0, 0] },
    uImpactLightDirections: { value: craterDirections },
    uImpactLightStrength: { value: [0, 0, 0, 0, 0, 0, 0] },
    uImpactContactShadow: { value: [0, 0, 0, 0, 0, 0, 0] },
    uImpactCompression: { value: [0, 0, 0, 0, 0, 0, 0] },
  };
}
