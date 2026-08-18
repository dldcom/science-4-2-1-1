import * as THREE from 'three';
import { FORMATION_ASSETS } from './assetManifest.js';
import { FINAL_CRATER_EVENTS, INITIAL_CRATER_EVENTS, LAVA_PATHS, uvToDirection } from './craterEvents.js';
import { FORMATION_PHASES } from './formationTimeline.js';
import { createLavaFlowLine, getLavaFront } from './lavaFlow.js';
import {
  getImpactEffectMotion,
  getImpactEffectOpacity,
  getImpactTerrainReveal,
  getDustBurstMotion,
  getDustVolumeMotion,
  getImpactCollisionMotion,
  getIncomingImpactIndices,
  DUST_VOLUME_LAYER_CONFIG,
  DUST_VOLUME_SHADER_CONFIG,
} from './impactVisuals.js';
import { getTerrainMixForState } from './formationVisuals.js';
import { createMoonUniforms, moonFragmentShader, moonVertexShader } from './moonFormationShader.js';

const TAU = Math.PI * 2;
const MOBILE_SEGMENTS = { width: 64, height: 48 };
const DESKTOP_SEGMENTS = { width: 96, height: 64 };

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const easeOut = (value) => 1 - ((1 - clamp(value)) ** 3);

function makeDirection(uv) {
  const [x, y, z] = uvToDirection(uv);
  return new THREE.Vector3(x, y, z).normalize();
}

function createStarfield() {
  const positions = [];
  let seed = 4720;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let index = 0; index < 180; index += 1) {
    const radius = 3.8 + random() * 2.4;
    const theta = random() * TAU;
    const y = (random() - 0.5) * 4.6;
    const horizontal = Math.sqrt(Math.max(0, radius * radius - y * y));
    positions.push(Math.cos(theta) * horizontal, y, Math.sin(theta) * horizontal);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xbed8ff,
    size: 0.018,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
  });
  return new THREE.Points(geometry, material);
}

function createImpactSprite(direction, radius, texture, color, opacity, scale = 1, blending = THREE.NormalBlending, depthTest = true) {
  const geometry = new THREE.PlaneGeometry(radius * 2 * scale, radius * 2 * scale);
  const material = new THREE.MeshBasicMaterial({
    color,
    map: texture,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest,
    blending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(direction).multiplyScalar(1.018);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  return mesh;
}

function createMeteorTrail(direction, event, texture, index) {
  const trail = new THREE.Group();
  const axis = direction.clone().normalize();
  const view = Math.abs(axis.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3().crossVectors(view, axis).normalize();
  const normal = new THREE.Vector3().crossVectors(axis, side).normalize();
  const orientation = new THREE.Matrix4().makeBasis(side, axis, normal);
  const layers = [
    { width: 0.12 + event.size * 0.025, length: 0.34 + event.size * 0.09, offset: 0.18, opacity: 0.42 },
    { width: 0.18 + event.size * 0.03, length: 0.28 + event.size * 0.07, offset: 0.1, opacity: 0.2 },
    { width: 0.22 + event.size * 0.035, length: 0.22 + event.size * 0.06, offset: 0.04, opacity: 0.11 },
  ];
  layers.forEach((layer, layerIndex) => {
    const material = new THREE.MeshBasicMaterial({
      color: layerIndex === 0 ? 0xc99770 : layerIndex === 1 ? 0x9a7864 : 0x77675c,
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(layer.width, layer.length), material);
    mesh.position.copy(axis).multiplyScalar(layer.offset);
    mesh.quaternion.setFromRotationMatrix(orientation);
    mesh.rotation.z += index * 0.27 + layerIndex * 0.55;
    mesh.userData.opacityScale = layer.opacity;
    mesh.userData.baseLength = layer.length;
    trail.add(mesh);
  });
  trail.userData.axis = axis;
  return trail;
}

function setTrailOpacity(trail, opacity, lengthScale = 1) {
  trail.children.forEach((layer) => {
    if (layer.material) {
      layer.material.opacity = opacity * (layer.userData.opacityScale || 1);
      layer.scale.y = lengthScale;
    }
  });
}

export const METEOR_SHAPE_CONFIG = Object.freeze({
  radialVariation: 0.028,
  scale: Object.freeze({ x: 1.04, y: 0.99, z: 1.0 }),
  normalScale: 0.055,
});

export function createMeteorGeometry(radius = 1) {
  const geometry = new THREE.SphereGeometry(radius, 32, 20);
  const position = geometry.attributes.position;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(position, vertex);
    const direction = point.clone().normalize();
    const broadShape = Math.sin(direction.x * 3.5 + direction.y * 2.1 + direction.z * 1.7);
    const secondaryShape = Math.sin(direction.y * 5.1 - direction.z * 2.7 + direction.x * 1.4);
    const radial = 1 + METEOR_SHAPE_CONFIG.radialVariation * (broadShape * 0.68 + secondaryShape * 0.32);
    point.copy(direction).multiplyScalar(radius * radial);
    point.x *= METEOR_SHAPE_CONFIG.scale.x;
    point.y *= METEOR_SHAPE_CONFIG.scale.y;
    point.z *= METEOR_SHAPE_CONFIG.scale.z;
    position.setXYZ(vertex, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createMeteorMesh(event, meteorTexture, meteorNormalTexture, meteorRoughnessTexture) {
  const impactorScale = event.impactorScale ?? 1;
  const radius = (0.035 + event.size * 0.025) * impactorScale;
  const geometry = createMeteorGeometry(radius);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8d8780,
    normalMap: meteorNormalTexture,
    normalScale: new THREE.Vector2(METEOR_SHAPE_CONFIG.normalScale, METEOR_SHAPE_CONFIG.normalScale),
    roughnessMap: meteorRoughnessTexture,
    roughness: 0.96,
    metalness: 0.01,
    emissive: 0x000000,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0,
  });
  return new THREE.Mesh(geometry, material);
}

export function createDustPuffGeometry(radius = 1) {
  const geometry = new THREE.SphereGeometry(radius, 32, 24);
  const position = geometry.attributes.position;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(position, vertex);
    const direction = point.clone().normalize();
    const lobe = 1
      + Math.sin(direction.x * 5.7 + direction.y * 2.4) * 0.1
      + Math.sin(direction.y * 7.1 - direction.z * 3.8) * 0.075
      + Math.sin(direction.z * 8.3 + direction.x * 4.6) * 0.055;
    point.multiplyScalar(lobe);
    point.x *= 1.06;
    point.y *= 0.86;
    point.z *= 0.92;
    position.setXYZ(vertex, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createDustCloudMaterial({ color, texture, opacity = 0, seed = 0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uDustTexture: { value: texture },
      uOpacity: { value: opacity },
      uSeed: { value: seed },
      uTime: { value: 0 },
      uCameraLocalPosition: { value: new THREE.Vector3(0, 0, 3) },
      uDensityScale: { value: DUST_VOLUME_SHADER_CONFIG.densityScale },
      uEdgeWidth: { value: DUST_VOLUME_SHADER_CONFIG.edgeWidth },
    },
    vertexShader: `
      varying vec3 vLocalPosition;

      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform sampler2D uDustTexture;
      uniform float uOpacity;
      uniform float uSeed;
      uniform float uTime;
      uniform vec3 uCameraLocalPosition;
      uniform float uDensityScale;
      uniform float uEdgeWidth;

      varying vec3 vLocalPosition;

      float cloudNoise(vec3 point) {
        vec3 drift = vec3(uTime * 0.08, -uTime * 0.035, uTime * 0.05);
        vec3 p = point * 1.65 + drift + vec3(uSeed);
        float broad = 0.5 + 0.5 * sin(dot(p, vec3(1.7, 2.3, 1.1)));
        float medium = 0.5 + 0.5 * sin(dot(p * 1.9, vec3(-1.2, 1.8, 2.6)) + 1.7);
        float small = 0.5 + 0.5 * sin(dot(p * 3.1, vec3(2.4, -1.6, 1.9)) - 0.8);
        return clamp(broad * 0.5 + medium * 0.34 + small * 0.16, 0.0, 1.0);
      }

      void main() {
        vec3 rayOrigin = uCameraLocalPosition;
        vec3 rayDirection = normalize(vLocalPosition - rayOrigin);
        float rayB = dot(rayOrigin, rayDirection);
        float rayC = dot(rayOrigin, rayOrigin) - 1.0;
        float discriminant = rayB * rayB - rayC;
        if (discriminant <= 0.0) discard;

        float root = sqrt(discriminant);
        float rayStart = max(0.0, -rayB - root);
        float rayEnd = -rayB + root;
        if (rayEnd <= rayStart) discard;

        vec4 textureSample = texture2D(uDustTexture, vec2(0.5));
        vec3 dustColor = mix(uColor, textureSample.rgb, 0.08);
        vec3 accumulatedColor = vec3(0.0);
        float accumulatedAlpha = 0.0;
        float rayStep = (rayEnd - rayStart) / 18.0;

        for (int step = 0; step < 18; step += 1) {
          float distanceAlongRay = rayStart + (float(step) + 0.5) * rayStep;
          vec3 samplePosition = rayOrigin + rayDirection * distanceAlongRay;
          float radialFalloff = 1.0 - length(samplePosition);
          float shapeNoise = cloudNoise(samplePosition);
          float cloudBoundary = radialFalloff + (shapeNoise - 0.5) * 0.22;
          float envelope = smoothstep(0.0, uEdgeWidth, cloudBoundary);
          float noise = cloudNoise(samplePosition + vec3(0.17, -0.11, 0.23));
          vec2 densityUv = samplePosition.xy * 0.5 + 0.5;
          float textureAlpha = texture2D(uDustTexture, densityUv).a;
          float pocketMask = smoothstep(0.34, 0.7, noise);
          float sampleDensity = envelope * pocketMask * mix(0.22, 0.72, textureAlpha);
          float sampleAlpha = 1.0 - exp(-sampleDensity * rayStep * uDensityScale * uOpacity);
          float remaining = 1.0 - accumulatedAlpha;
          accumulatedColor += remaining * dustColor * sampleAlpha;
          accumulatedAlpha += remaining * sampleAlpha;
          if (accumulatedAlpha > 0.985) break;
        }

        if (accumulatedAlpha < 0.006) discard;
        vec3 outputColor = accumulatedColor / accumulatedAlpha;
        gl_FragColor = vec4(outputColor, accumulatedAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });
}

function setDustCloudOpacity(layer, opacity) {
  if (layer.material?.uniforms?.uOpacity) layer.material.uniforms.uOpacity.value = opacity;
  if (layer.material) layer.material.opacity = opacity;
}

function createDustVolume(direction, event, dustTexture, tangent, bitangent, index, surfaceOffset = 1.022) {
  const volume = new THREE.Group();
  volume.position.copy(direction).multiplyScalar(surfaceOffset);
  volume.userData.direction = direction.clone();
  volume.userData.tangent = tangent.clone();
  volume.userData.bitangent = bitangent.clone();
  const orientation = new THREE.Matrix4().makeBasis(tangent, bitangent, direction);
  const layers = DUST_VOLUME_LAYER_CONFIG;
  layers.forEach((layer, layerIndex) => {
    const material = createDustCloudMaterial({
      color: DUST_VOLUME_SHADER_CONFIG.color,
      texture: dustTexture,
      seed: index * 0.73 + layerIndex * 1.17,
    });
    const blob = new THREE.Mesh(createDustPuffGeometry(1), material);
    blob.quaternion.setFromRotationMatrix(orientation);
    blob.position.copy(tangent).multiplyScalar(layer.tangent * event.radius)
      .add(bitangent.clone().multiplyScalar(layer.bitangent * event.radius))
      .add(direction.clone().multiplyScalar(layer.lift * event.radius));
    const size = event.radius * 0.82 * layer.sizeMultiplier;
    blob.scale.set(size * layer.width, size * layer.height, size * layer.depth);
    blob.userData.opacityScale = layer.opacity;
    blob.userData.phase = layer.phase;
    blob.userData.basePosition = blob.position.clone();
    blob.userData.baseScale = blob.scale.clone();
    blob.userData.baseRotation = index * 0.33 + layerIndex * 0.87;
    blob.rotation.z = blob.userData.baseRotation;
    blob.renderOrder = 12;
    volume.add(blob);
  });
  return volume;
}

function createImpactEffect(event, index, color = 0xffa65e, meteorTexture = null, meteorNormalTexture = null, meteorRoughnessTexture = null, meteorTrailTexture = null, shockwaveTexture = null, flashTexture = null, dustTexture = null, dustSurfaceOffset = 1.022) {
  const direction = makeDirection(event.uv);
  const group = new THREE.Group();
  group.visible = false;
  group.userData.direction = direction;
  group.userData.meteorRadius = (0.035 + event.size * 0.025) * (event.impactorScale ?? 1);
  group.userData.index = index;
  group.userData.event = event;

  const ring = createImpactSprite(direction, event.radius, shockwaveTexture, 0xb79470, 0, 1.08, THREE.NormalBlending);
  ring.scale.setScalar(0.01);
  ring.rotation.z = index * 0.83;
  group.add(ring);
  group.userData.ring = ring;

  const core = createImpactSprite(direction, event.radius * 0.78, flashTexture, 0xffb04a, 0, 0.94, THREE.AdditiveBlending);
  group.add(core);
  group.userData.core = core;

  const meteor = createMeteorMesh(event, meteorTexture, meteorNormalTexture, meteorRoughnessTexture);
  meteor.userData.impactQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  meteor.userData.spinAxis = direction.clone();
  group.add(meteor);
  group.userData.meteor = meteor;
  const trail = createMeteorTrail(direction, event, meteorTrailTexture, index);
  group.add(trail);
  group.userData.trail = trail;

  const tangent = new THREE.Vector3(0, 1, 0);
  if (Math.abs(direction.dot(tangent)) > 0.88) tangent.set(1, 0, 0);
  tangent.cross(direction).normalize();
  const bitangent = direction.clone().cross(tangent).normalize();
  group.userData.tangent = tangent.clone();
  group.userData.bitangent = bitangent.clone();
  const dust = createDustVolume(direction, event, dustTexture, tangent, bitangent, index, dustSurfaceOffset);
  dust.renderOrder = 12;
  group.add(dust);
  group.userData.dust = dust;

  return group;
}

function loadTexture(loader, url, { color = false, clamp = false } = {}) {
  return new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 2;
      resolve(texture);
    }, undefined, reject);
  });
}

export class MoonFormationScene {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.disposed = false;
    this.state = {
      phase: FORMATION_PHASES.SMOOTH,
      impactIndex: 0,
      impactProgress: 0,
      lavaProgress: 0,
      finalImpactIndex: 0,
      finalImpactProgress: 0,
    };
    this.reducedMotion = Boolean(options.reducedMotion);
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x061126);
    this.renderer = null;
    this.camera = null;
    this.moon = null;
    this.moonMaterial = null;
    this.moonUniforms = null;
    this.moonGroup = new THREE.Group();
    this.impactEffects = [];
    this.finalImpactEffects = [];
    this.lavaFlows = [];
    this.pointerState = { id: null, x: 0, y: 0 };
    this.dragRotation = { x: 0, y: 0 };
    this.dustCameraWorldPosition = new THREE.Vector3();
    this.dustSurfaceOffset = 1.022;
    this.resizeObserver = null;
    this.raf = 0;
    if (import.meta.env?.DEV && typeof window !== 'undefined' && window.__MOON_FORMATION_DEBUG__) {
      window.__moonFormationScene = this;
    }
    this.ready = this.initialize();
  }

  async initialize() {
    this.setupRenderer();
    this.setupScene();
    const loader = new THREE.TextureLoader();
    const [color, earlyCrust, basalt, height, earlyCrustHeight, basinMask, crackMask, lavaArrival, craterDecal, meteor, meteorNormal, meteorRoughness, meteorTrail, impactShockwave, impactFlash, impactDust] = await Promise.all([
      loadTexture(loader, FORMATION_ASSETS.color, { color: true }),
      loadTexture(loader, FORMATION_ASSETS.earlyCrust, { color: true }),
      loadTexture(loader, FORMATION_ASSETS.basalt, { color: true }),
      loadTexture(loader, FORMATION_ASSETS.height),
      loadTexture(loader, FORMATION_ASSETS.earlyCrustHeight),
      loadTexture(loader, FORMATION_ASSETS.basinMask),
      loadTexture(loader, FORMATION_ASSETS.crackMask),
      loadTexture(loader, FORMATION_ASSETS.lavaArrival),
      loadTexture(loader, FORMATION_ASSETS.craterDecal, { color: true, clamp: true }),
      loadTexture(loader, FORMATION_ASSETS.meteor, { color: true }),
      loadTexture(loader, FORMATION_ASSETS.meteorNormal),
      loadTexture(loader, FORMATION_ASSETS.meteorRoughness),
      loadTexture(loader, FORMATION_ASSETS.meteorTrail, { color: true, clamp: true }),
      loadTexture(loader, FORMATION_ASSETS.impactShockwave, { color: true, clamp: true }),
      loadTexture(loader, FORMATION_ASSETS.impactFlash, { color: true, clamp: true }),
      loadTexture(loader, FORMATION_ASSETS.impactDust, { color: true, clamp: true }),
    ]);
    if (this.disposed) return this;

    const craterEvents = [...INITIAL_CRATER_EVENTS, ...FINAL_CRATER_EVENTS];
    const craterDirections = craterEvents.map((event) => makeDirection(event.uv));
    const craterRadii = craterEvents.map((event) => event.radius);
    const craterDepth = craterEvents.map((event) => event.depth);
    const craterRimHeight = craterEvents.map((event) => event.rimHeight);
    const craterEjectaScale = craterEvents.map((event) => event.ejectaScale);
    this.moonUniforms = createMoonUniforms({
      color,
      earlyCrust,
      basalt,
      height,
      earlyCrustHeight,
      basinMask,
      crackMask,
      lavaArrival,
      craterDecal,
      craterDirections,
      craterRadii,
      craterDepth,
      craterRimHeight,
      craterEjectaScale,
    });
    this.moonMaterial = new THREE.ShaderMaterial({
      uniforms: this.moonUniforms,
      vertexShader: moonVertexShader,
      fragmentShader: moonFragmentShader,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });

    const isMobile = this.options.isMobile ?? (typeof window !== 'undefined' && window.innerWidth <= 760);
    const segments = isMobile ? MOBILE_SEGMENTS : DESKTOP_SEGMENTS;
    const geometry = new THREE.SphereGeometry(1, segments.width, segments.height);
    this.moon = new THREE.Mesh(geometry, this.moonMaterial);
    this.moonGroup.add(this.moon);
    this.scene.add(this.moonGroup);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.035, Math.max(24, Math.floor(segments.width / 2)), Math.max(16, Math.floor(segments.height / 2))),
      new THREE.MeshBasicMaterial({ color: 0x87b8ff, transparent: true, opacity: 0.055, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.moonGroup.add(atmosphere);
    this.atmosphere = atmosphere;

    this.impactEffects = INITIAL_CRATER_EVENTS.map((event, index) => createImpactEffect(event, index, 0xffa65e, meteor, meteorNormal, meteorRoughness, meteorTrail, impactShockwave, impactFlash, impactDust, this.dustSurfaceOffset));
    this.finalImpactEffects = FINAL_CRATER_EVENTS.map((event, index) => createImpactEffect(event, index + INITIAL_CRATER_EVENTS.length, 0xffc77b, meteor, meteorNormal, meteorRoughness, meteorTrail, impactShockwave, impactFlash, impactDust, this.dustSurfaceOffset));
    this.impactEffects.forEach((effect) => this.moonGroup.add(effect));
    this.finalImpactEffects.forEach((effect) => this.moonGroup.add(effect));
    this.lavaFlows = LAVA_PATHS.map((path) => createLavaFlowLine(path));
    this.lavaFlows.forEach((flow) => this.moonGroup.add(flow));

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.setState(this.state);
    this.startAnimation();
    this.options.onReady?.();
    return this;
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const isMobile = this.options.isMobile ?? (typeof window !== 'undefined' && window.innerWidth <= 760);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '달 표면 형성 과정 3D 시뮬레이션');
    this.renderer.domElement.dataset.formationCanvas = 'true';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.zIndex = '0';
    this.renderer.domElement.style.pointerEvents = 'auto';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);
    this.pointerDownHandler = (event) => {
      this.pointerState = { id: event.pointerId, x: event.clientX, y: event.clientY };
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
      this.renderer.domElement.style.cursor = 'grabbing';
    };
    this.pointerMoveHandler = (event) => {
      if (this.pointerState.id !== event.pointerId) return;
      const dx = event.clientX - this.pointerState.x;
      const dy = event.clientY - this.pointerState.y;
      this.pointerState.x = event.clientX;
      this.pointerState.y = event.clientY;
      this.dragRotation.y = THREE.MathUtils.clamp(this.dragRotation.y + dx * 0.006, -0.9, 0.9);
      this.dragRotation.x = THREE.MathUtils.clamp(this.dragRotation.x + dy * 0.004, -0.35, 0.35);
    };
    this.pointerUpHandler = (event) => {
      if (this.pointerState.id !== event.pointerId) return;
      this.pointerState.id = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      this.renderer.domElement.style.cursor = 'grab';
    };
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDownHandler);
    this.renderer.domElement.addEventListener('pointermove', this.pointerMoveHandler);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUpHandler);
    this.renderer.domElement.addEventListener('pointercancel', this.pointerUpHandler);
    this.renderer.domElement.style.cursor = 'grab';
  }

  setupScene() {
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
    this.camera.position.set(0, 0.03, 3.65);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);
    this.scene.add(createStarfield());
    this.scene.add(new THREE.HemisphereLight(0x8d9ab8, 0x2b1b12, 1.35));
    const meteorKeyLight = new THREE.DirectionalLight(0xffd7bd, 2.15);
    meteorKeyLight.position.set(-2.7, 1.8, 4.4);
    meteorKeyLight.target.position.set(0, 0, 0);
    this.scene.add(meteorKeyLight, meteorKeyLight.target);
    const meteorFillLight = new THREE.PointLight(0x8f6c56, 0.42, 7, 2);
    meteorFillLight.position.set(1.4, -0.8, 2.8);
    this.scene.add(meteorFillLight);
    this.scene.add(this.moonGroup);
  }

  startAnimation() {
    const render = () => {
      if (this.disposed) return;
      this.update(this.clock.getElapsedTime());
      this.renderer.render(this.scene, this.camera);
      this.raf = window.requestAnimationFrame(render);
    };
    this.raf = window.requestAnimationFrame(render);
  }

  resize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setState(state) {
    this.state = { ...this.state, ...state };
    if (!this.moonUniforms) return;
    const { phase } = this.state;
    const terrainMix = getTerrainMixForState(this.state);
    this.moonUniforms.uTerrainMix.value = terrainMix;
    this.moonUniforms.uLavaProgress.value = phase === FORMATION_PHASES.SMOOTH || phase === FORMATION_PHASES.IMPACTS ? 0 : phase === FORMATION_PHASES.VOLCANISM ? this.state.lavaProgress : 1;
    this.moonUniforms.uFinalMix.value = phase === FORMATION_PHASES.SUMMARY ? 1 : phase === FORMATION_PHASES.FINAL_IMPACTS ? clamp((this.state.finalImpactIndex + this.state.finalImpactProgress) / 5) * 0.66 : 0;
    // Cracks are an aftermath of the basin impact. Hiding them during the
    // incoming meteor prevents a straight mask line from competing with the
    // transient dust and flash; they appear with the later magma reveal.
    this.moonUniforms.uCrackReveal.value = phase === FORMATION_PHASES.SMOOTH || phase === FORMATION_PHASES.IMPACTS ? 0 : 1;
    const reveal = this.moonUniforms.uCraterReveal.value;
    reveal.fill(0);
    this.impactEffects.forEach((effect, index) => {
      if (phase === FORMATION_PHASES.IMPACTS) {
        reveal[index] = index < this.state.impactIndex
          ? 1
          : index === this.state.impactIndex ? getImpactTerrainReveal(this.state.impactProgress) : 0;
      }
      if (phase === FORMATION_PHASES.VOLCANISM || phase === FORMATION_PHASES.FINAL_IMPACTS || phase === FORMATION_PHASES.SUMMARY) reveal[index] = 1;
    });
    this.finalImpactEffects.forEach((effect, index) => {
      const uniformIndex = INITIAL_CRATER_EVENTS.length + index;
      if (phase === FORMATION_PHASES.FINAL_IMPACTS) {
        reveal[uniformIndex] = index < this.state.finalImpactIndex
          ? 1
          : index === this.state.finalImpactIndex ? getImpactTerrainReveal(this.state.finalImpactProgress) : 0;
      }
      if (phase === FORMATION_PHASES.SUMMARY) reveal[uniformIndex] = 1;
    });
    this.updateEffects(0);
    this.updateLavaFlows(0);
  }

  updateLavaFlows(time = 0) {
    const phase = this.state.phase;
    const progress = phase === FORMATION_PHASES.VOLCANISM
      ? this.state.lavaProgress
      : phase === FORMATION_PHASES.FINAL_IMPACTS || phase === FORMATION_PHASES.SUMMARY ? 1 : 0;
    this.lavaFlows.forEach((flow, index) => {
      const front = getLavaFront(progress, LAVA_PATHS[index], this.lavaFlows.length);
      const visiblePoints = Math.max(0, Math.floor(flow.userData.totalPoints * front));
      flow.geometry.setDrawRange(0, visiblePoints);
      const baseOpacity = flow.userData.role === 'branch' ? 0.42 : 0.66;
      flow.material.opacity = front > 0 ? (phase === FORMATION_PHASES.VOLCANISM ? baseOpacity + Math.sin(time * 4 + index) * 0.06 : 0.14) : 0;
      flow.material.color.set(phase === FORMATION_PHASES.VOLCANISM ? 0xff6a2f : 0x4f555a);
    });
  }

  updateEffects(time) {
    const phase = this.state.phase;
    const activeInitial = phase === FORMATION_PHASES.IMPACTS;
    const activeFinal = phase === FORMATION_PHASES.FINAL_IMPACTS;
    const impactLightStrength = this.moonUniforms?.uImpactLightStrength?.value;
    const impactContactShadow = this.moonUniforms?.uImpactContactShadow?.value;
    const impactCompression = this.moonUniforms?.uImpactCompression?.value;
    impactLightStrength?.fill(0);
    impactContactShadow?.fill(0);
    impactCompression?.fill(0);
    const updateGroup = (group, index, progress, active, uniformIndex) => {
      const ring = group.userData.ring;
      const core = group.userData.core;
      const meteor = group.userData.meteor;
      const trail = group.userData.trail;
      const dust = group.userData.dust;
      const reveal = active ? progress : (phase === FORMATION_PHASES.VOLCANISM || phase === FORMATION_PHASES.FINAL_IMPACTS || phase === FORMATION_PHASES.SUMMARY ? 1 : 0);
      group.visible = active ? reveal > 0.001 : false;
      if (!group.visible) {
        ring.material.opacity = 0;
        core.material.opacity = 0;
        dust.children.forEach((layer) => { setDustCloudOpacity(layer, 0); });
        meteor.material.opacity = 0;
        setTrailOpacity(trail, 0);
        return;
      }
      const eased = easeOut(reveal);
      const visualOpacity = getImpactEffectOpacity({ active, reveal });
      const motion = getImpactEffectMotion({ active, reveal });
      const collision = getImpactCollisionMotion(reveal, group.userData.meteorRadius, group.userData.event.depth);
      const terrainReveal = getImpactTerrainReveal(reveal);
      const dustBurstMotion = getDustBurstMotion(reveal);
      const dustVolumeMotion = getDustVolumeMotion(reveal);
      ring.scale.setScalar(0.2 + eased * 0.82);
      ring.material.opacity = visualOpacity.shockwave * 0.34;
      core.material.opacity = visualOpacity.core * 0.72;
      core.scale.setScalar(0.28 + eased * 0.92);
      dust.children.forEach((layer) => {
        const dustOpacity = Math.min(
          1,
          Math.max(visualOpacity.dust, visualOpacity.dustBurst * 0.72)
            * (0.82 + dustVolumeMotion.cover * 0.42),
        );
        const layerOpacity = Math.min(
          1,
          dustOpacity * (layer.userData.opacityScale || 1) * DUST_VOLUME_SHADER_CONFIG.opacityBoost,
        );
        setDustCloudOpacity(layer, layerOpacity);
        if (layer.material?.uniforms?.uTime) layer.material.uniforms.uTime.value = time;
        const basePosition = layer.userData.basePosition || new THREE.Vector3();
        const tangentOffset = basePosition.dot(group.userData.tangent);
        const bitangentOffset = basePosition.dot(group.userData.bitangent);
        const normalOffset = basePosition.dot(group.userData.direction);
        const spread = Math.max(motion.plumeSpread * 0.82, dustVolumeMotion.spread * 0.72);
        const lift = dustBurstMotion.lift;
        const surfaceSpread = dustVolumeMotion.surfaceSpread;
        const rise = dustVolumeMotion.rise * (layer.userData.riseMultiplier || 1);
        layer.position.copy(group.userData.tangent).multiplyScalar(
          tangentOffset * (0.68 + spread * 1.24 + surfaceSpread * 0.62),
        )
          .add(group.userData.bitangent.clone().multiplyScalar(
            bitangentOffset * (0.72 + spread * 1.02 + surfaceSpread * 0.54),
          ))
          .add(group.userData.direction.clone().multiplyScalar(
            normalOffset * (0.38 + spread * 0.2)
              + dustVolumeMotion.normalOffset
              + rise * 0.08
              + lift * 0.02,
          ));
        const settleScale = 0.68 + spread * 0.3 + surfaceSpread * 0.42;
        const coverScale = 1 + dustVolumeMotion.cover * 0.72;
        layer.scale.set(
          layer.userData.baseScale.x * settleScale * (1 + spread * 0.08) * coverScale,
          layer.userData.baseScale.y * (0.62 + spread * 0.2 + rise * 0.28 + lift * 0.1) * (1 + dustVolumeMotion.cover * 0.46),
          layer.userData.baseScale.z * (0.58 + spread * 0.14 + surfaceSpread * 0.24) * (1 + dustVolumeMotion.cover * 0.62),
        );
        layer.updateMatrixWorld(true);
        if (layer.material?.uniforms?.uCameraLocalPosition && this.camera) {
          const cameraLocalPosition = this.camera.getWorldPosition(this.dustCameraWorldPosition.clone());
          layer.worldToLocal(cameraLocalPosition);
          layer.material.uniforms.uCameraLocalPosition.value.copy(cameraLocalPosition);
        }
        layer.rotation.z = (layer.userData.baseRotation || layer.rotation.z)
          + Math.sin(time * 1.8 + (layer.userData.phase || 0) + index) * lift * 0.11;
      });

      if (active) {
        meteor.position.copy(group.userData.direction).multiplyScalar(collision.centerDistance);
        meteor.quaternion.copy(meteor.userData.impactQuaternion);
        meteor.rotateOnAxis(meteor.userData.spinAxis, index * 0.16 + reveal * (0.32 + collision.speed * 0.48));
        meteor.scale.set(
          1 + collision.squash * 0.1,
          1 + collision.squash * 0.08,
          1 - collision.squash * 0.34,
        );
        meteor.material.opacity = visualOpacity.meteor * dustVolumeMotion.meteorVisibility;
        setTrailOpacity(trail, visualOpacity.trail * (0.32 + collision.speed * 0.68), 0.38 + motion.trailLength * 1.62);
        trail.position.copy(meteor.position).add(group.userData.direction.clone().multiplyScalar(0.1));
        if (impactLightStrength) impactLightStrength[uniformIndex] = getImpactEffectMotion({ active, reveal }).surfaceLight * 0.55;
        if (impactContactShadow) impactContactShadow[uniformIndex] = visualOpacity.contactShadow;
        if (impactCompression) impactCompression[uniformIndex] = collision.compression * 0.76;
      } else {
        meteor.material.opacity = 0;
        setTrailOpacity(trail, 0);
      }
      dust.rotation.z = time * 0.2 + index;
      group.userData.terrainReveal = active ? terrainReveal : (phase === FORMATION_PHASES.IMPACTS ? 0 : 1);
    };
    const incomingInitial = activeInitial
      ? getIncomingImpactIndices(this.state.impactIndex, this.impactEffects.length)
      : [];
    const incomingFinal = activeFinal
      ? getIncomingImpactIndices(this.state.finalImpactIndex, this.finalImpactEffects.length)
      : [];
    this.impactEffects.forEach((group, index) => {
      const isCurrent = index === this.state.impactIndex;
      const incomingOffset = incomingInitial.indexOf(index);
      const isIncoming = incomingOffset !== -1;
      const progress = isCurrent ? this.state.impactProgress : isIncoming ? 0.12 - incomingOffset * 0.04 : 1;
      updateGroup(group, index, progress, activeInitial && (isCurrent || isIncoming), index);
    });
    this.finalImpactEffects.forEach((group, index) => {
      const isCurrent = index === this.state.finalImpactIndex;
      const incomingOffset = incomingFinal.indexOf(index);
      const isIncoming = incomingOffset !== -1;
      const progress = isCurrent ? this.state.finalImpactProgress : isIncoming ? 0.12 - incomingOffset * 0.04 : 1;
      updateGroup(group, index, progress, activeFinal && (isCurrent || isIncoming), INITIAL_CRATER_EVENTS.length + index);
    });
  }

  update(time) {
    const autoY = this.reducedMotion ? 0 : Math.sin(time * 0.08) * 0.12 + time * 0.018;
    const autoX = this.reducedMotion ? 0 : Math.sin(time * 0.11) * 0.025;
    this.moonGroup.rotation.y = autoY + this.dragRotation.y;
    this.moonGroup.rotation.x = autoX + this.dragRotation.x;
    this.scene.updateMatrixWorld(true);
    if (this.moonUniforms) this.moonUniforms.uTime.value = time;
    this.updateEffects(time);
    this.updateLavaFlows(time);
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  dispose() {
    this.disposed = true;
    if (import.meta.env?.DEV && typeof window !== 'undefined' && window.__moonFormationScene === this) {
      delete window.__moonFormationScene;
    }
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('pointerdown', this.pointerDownHandler);
      this.renderer.domElement.removeEventListener('pointermove', this.pointerMoveHandler);
      this.renderer.domElement.removeEventListener('pointerup', this.pointerUpHandler);
      this.renderer.domElement.removeEventListener('pointercancel', this.pointerUpHandler);
    }
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value?.isTexture) value.dispose();
          });
          material.dispose();
        });
      }
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer?.domElement?.remove();
    this.renderer = null;
  }
}

export default MoonFormationScene;
