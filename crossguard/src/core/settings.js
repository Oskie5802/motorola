// Zarządzanie ustawieniami i optymalizacjami graficznymi (LOD)
const SETTINGS_KEY = 'crossguard_graphics_settings_v1';

// Wykrycie telefonu/tabletu (dotyk jako główny wskaźnik). Na takim sprzęcie
// startujemy z lżejszym profilem i mniejszym zasięgiem renderowania, żeby gra
// płynnie chodziła "na wszystkim".
export const isMobile = (() => {
  try {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return coarse && touch;
  } catch { return false; }
})();

const DEFAULT_SETTINGS = {
  quality: 'high', // 'low', 'medium', 'high'
  shadows: true,
  lod: true,
  particles: true,
  pixelRatioLimit: 2.0,
  chunkLimit: 200 // Domyślna odległość renderowania chunków w metrach
};

// Profil startowy dla telefonu: średnia jakość, krótszy zasięg, mniej pikseli.
const MOBILE_DEFAULT_SETTINGS = {
  quality: 'medium',
  shadows: false,
  lod: true,
  particles: false,
  pixelRatioLimit: 1.5,
  chunkLimit: 110
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
    // Brak zapisanych ustawień - pierwszy raz. Na telefonie dajemy lżejszy profil.
    return isMobile ? { ...MOBILE_DEFAULT_SETTINGS } : { ...DEFAULT_SETTINGS };
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
      this.current.chunkLimit = 120;
    } else if (level === 'medium') {
      this.current.shadows = true;
      this.current.lod = true;
      this.current.particles = true;
      this.current.pixelRatioLimit = 1.5;
      this.current.chunkLimit = 200;
    } else if (level === 'high') {
      this.current.shadows = true;
      this.current.lod = true;
      this.current.particles = true;
      this.current.pixelRatioLimit = 2.0;
      this.current.chunkLimit = 300;
    }
    this.save();
  }
}

export const settings = new SettingsManager();
