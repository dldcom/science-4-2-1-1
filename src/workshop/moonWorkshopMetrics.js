const AWARD_CATALOG = Object.freeze({
  cleanMoon: Object.freeze({
    id: 'clean-moon',
    label: '깔끔한 달 상',
    description: '아무것도 바꾸지 않은 달의 모습을 살펴보았어요.',
  }),
  lunarSea: Object.freeze({
    id: 'lunar-sea',
    label: '달의 바다 상',
    description: '용암이 식어 어두운 달의 바다를 만들었어요.',
  }),
  meteorParty: Object.freeze({
    id: 'meteor-party',
    label: '별똥별 파티 상',
    description: '크고 작은 운석이 여러 번 부딪혔어요.',
  }),
  bumpyMoon: Object.freeze({
    id: 'bumpy-moon',
    label: '울퉁불퉁 달 상',
    description: '달의 여러 표면 구역에 충돌 구덩이가 생겼어요.',
  }),
});

function getSurfaceZone(direction) {
  const [x = 0, y = 0] = direction || [];
  if (y > 0.34) return 'top';
  if (y < -0.34) return 'bottom';
  if (x > 0.34) return 'right';
  if (x < -0.34) return 'left';
  return 'center';
}

export function getAchievementSummary(craters = []) {
  const normalizedCraters = Array.isArray(craters) ? craters : [];
  const craterCount = normalizedCraters.length;
  const mareCount = normalizedCraters.filter((crater) => crater?.hasMare).length;
  const zones = new Set(normalizedCraters.map((crater) => getSurfaceZone(crater?.direction)));
  const awards = [];

  if (craterCount === 0 && mareCount === 0) awards.push(AWARD_CATALOG.cleanMoon);
  if (mareCount >= 3) awards.push(AWARD_CATALOG.lunarSea);
  if (craterCount >= 8) awards.push(AWARD_CATALOG.meteorParty);
  if (craterCount >= 3 && zones.size >= 3) awards.push(AWARD_CATALOG.bumpyMoon);

  return {
    metrics: { craterCount, mareCount, zoneCount: zones.size },
    awards,
  };
}

export { AWARD_CATALOG, getSurfaceZone };
