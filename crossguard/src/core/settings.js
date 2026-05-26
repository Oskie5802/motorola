// Zarządzanie ustawieniami i optymalizacjami graficznymi (LOD)
const SETTINGS_KEY = 'crossguard_graphics_settings_v1';

const DEFAULT_SETTINGS = {
  quality: 'high', // 'low', 'medium', 'high'
  shadows: true,
  lod: true,
  particles: true,
  pixelRatioLimit: 2.0
};

class SettingsManager {
  constructor() {
    this.current = this.load();
  }

  load() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load graphics settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.current));
    } catch (e) {
      console.warn('Failed to save graphics settings:', e);
    }
  }

  setQuality(level) {
    this.current.quality = level;
    if (level === 'low') {
      this.current.shadows = false;
      this.current.lod = false;
      this.current.particles = false;
      this.current.pixelRatioLimit = 1.0;
    } else if (level === 'medium') {
      this.current.shadows = true;
      this.current.lod = true;
      this.current.particles = true;
      this.current.pixelRatioLimit = 1.5;
    } else if (level === 'high') {
      this.current.shadows = true;
      this.current.lod = true;
      this.current.particles = true;
      this.current.pixelRatioLimit = 2.0;
    }
    this.save();
  }
}

export const settings = new SettingsManager();
