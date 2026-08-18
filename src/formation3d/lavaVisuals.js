export function getLavaVisualWeights({ arrival, basin, progress }) {
  const pathArrival = Math.max(0, Math.min(1, Number(arrival) || 0));
  const basinWeight = Math.max(0, Math.min(1, Number(basin) || 0));
  const lavaProgress = Math.max(0, Math.min(1, Number(progress) || 0));
  const active = basinWeight > 0 && Math.abs(pathArrival - lavaProgress) < 0.1
    ? basinWeight * (1 - Math.min(1, Math.abs(pathArrival - lavaProgress) / 0.1))
    : 0;
  const cooled = basinWeight * Math.max(0, Math.min(1, (lavaProgress - 0.55) / 0.35));
  return { active, cooled };
}
