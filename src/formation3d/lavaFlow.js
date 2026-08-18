import * as THREE from 'three';
import { LAVA_PATHS, uvToDirection } from './craterEvents.js';

export function getLavaFront(progress, pathIndex, pathCount = LAVA_PATHS.length) {
  const normalized = Math.max(0, Math.min(1, Number(progress) || 0));
  const path = typeof pathIndex === 'object' ? pathIndex : LAVA_PATHS[pathIndex];
  if (path?.flowStart !== undefined && path?.flowEnd !== undefined) {
    const span = Math.max(0.001, path.flowEnd - path.flowStart);
    return Math.max(0, Math.min(1, (normalized - path.flowStart) / span));
  }
  if (path?.role === 'main-flow') {
    return Math.max(0, Math.min(1, normalized / 0.7));
  }
  if (path?.role === 'branch') {
    const branches = LAVA_PATHS.filter((candidate) => candidate.role === 'branch');
    const branchIndex = Math.max(0, branches.indexOf(path));
    const start = 0.34 + branchIndex * 0.18;
    const end = start + 0.44;
    return Math.max(0, Math.min(1, (normalized - start) / (end - start)));
  }
  const stagger = pathCount > 1 ? pathIndex / pathCount * 0.22 : 0;
  return Math.max(0, Math.min(1, (normalized - stagger) / (1 - stagger)));
}

function createSphericalPath(points, radius) {
  const vectors = points.map((uv) => new THREE.Vector3(...uvToDirection(uv)).normalize());
  const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.18);
  const curvePoints = curve.getPoints(Math.max(18, vectors.length * 12));
  return curvePoints.map((point) => point.normalize().multiplyScalar(radius));
}

export function createLavaFlowLine(path, radius = 1.026) {
  const points = createSphericalPath(path.points, radius);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xff7a38,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geometry, material);
  line.userData.totalPoints = points.length;
  line.userData.pathId = path.id;
  line.userData.role = path.role || 'legacy-flow';
  return line;
}
