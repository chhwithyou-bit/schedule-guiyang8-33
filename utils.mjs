export const COMMUNITY_LEVEL_THRESHOLDS = [0, 10, 25, 45, 70, 100, 140, 190, 250, 325, 415, 520, 640, 780, 940, 1120, 1325, 1555, 1810, 2090];

export function getCommunityLevelFromXp(xpValue) {
  const xp = Math.max(0, Number(xpValue || 0));
  for (let i = COMMUNITY_LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
    if (xp >= COMMUNITY_LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}
