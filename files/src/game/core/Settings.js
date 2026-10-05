export const DEFAULT_SETTINGS = {
  quality: 'high',
  volume: 0.4,
  sensitivity: 1,
  invertY: false,
  fov: 70,
  cameraShake: 0.6,
};
export function normalizeSettings(raw = {}) {
  const number = (key, min, max) =>
    Number.isFinite(raw?.[key]) ? Math.min(max, Math.max(min, raw[key])) : DEFAULT_SETTINGS[key];
  return {
    quality: ['low', 'high'].includes(raw?.quality) ? raw.quality : 'high',
    volume: number('volume', 0, 1),
    sensitivity: number('sensitivity', 0.2, 3),
    fov: number('fov', 50, 100),
    cameraShake: number('cameraShake', 0, 1),
    invertY: raw?.invertY === true,
  };
}
export function loadSettings(slug) {
  try {
    return normalizeSettings(JSON.parse(localStorage.getItem(`voxel.${slug}.settings.v1`)));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(slug, data) {
  try {
    localStorage.setItem(`voxel.${slug}.settings.v1`, JSON.stringify(normalizeSettings(data)));
    return true;
  } catch {
    return false;
  }
}
