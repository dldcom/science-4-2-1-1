import geometry from './formationGeometry.json';

export const INITIAL_CRATER_EVENTS = Object.freeze(geometry.initialImpacts);
export const FINAL_CRATER_EVENTS = Object.freeze(geometry.finalImpacts);
export const ALL_CRATER_EVENTS = Object.freeze([
  ...INITIAL_CRATER_EVENTS,
  ...FINAL_CRATER_EVENTS,
]);
export const BASIN_TARGET = Object.freeze(geometry.basinTarget);
export const LAVA_PATHS = Object.freeze(geometry.lavaPaths);
export const CRACK_PATHS = Object.freeze(geometry.crackPaths);

export function uvToDirection([u, v]) {
  const latitude = (v - 0.5) * Math.PI;
  const longitude = (0.5 - u) * Math.PI * 2;
  const cosLatitude = Math.cos(latitude);
  return [
    cosLatitude * Math.cos(longitude),
    Math.sin(latitude),
    cosLatitude * Math.sin(longitude),
  ];
}
