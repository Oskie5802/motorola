// === CrossGuard config: zones, scoring, vehicles, weather ===

export const ZONES = [
  {
    id: 'residential',
    name: 'DZIELNICA MIESZKALNA',
    desc: 'Spokojna okolica, mały ruch',
    gridSize: 4,
    blockSize: 28,
    vehicles: 6,
    pedestrians: 8,
    cameras: 2,
    weather: 'clear',
    timeOfDay: 'day',
    hazardRate: 0.05,
    vehicleSpeed: 0.18,
    redLightRunChance: 0.02,
    sirenChance: 0.05,
    requiredScore: 0,
    lesson: 'Podstawy BRD: zawsze korzystaj z przejść dla pieszych i sygnalizacji świetlnej. To Twój pierwszy krok do statusu Certified Safe Citizen.',
  },
  {
    id: 'school',
    name: 'STREFA SZKOLNA',
    desc: 'Okolice szkół, dużo pieszych',
    gridSize: 4,
    blockSize: 28,
    vehicles: 8,
    pedestrians: 14,
    cameras: 3,
    weather: 'clear',
    timeOfDay: 'morning',
    hazardRate: 0.08,
    vehicleSpeed: 0.14,
    redLightRunChance: 0.03,
    sirenChance: 0.08,
    requiredScore: 60,
    lesson: 'W strefach szkolnych obowiązuje obniżona prędkość. Uważaj na autobusy szkolne i grupy dzieci. System Avigilon monitoruje przekroczenia prędkości.',
  },
  {
    id: 'downtown',
    name: 'CENTRUM MIASTA',
    desc: 'Intensywny ruch, tramwaje',
    gridSize: 5,
    blockSize: 30,
    vehicles: 14,
    pedestrians: 18,
    cameras: 5,
    weather: 'rain',
    timeOfDay: 'day',
    hazardRate: 0.12,
    vehicleSpeed: 0.22,
    redLightRunChance: 0.06,
    sirenChance: 0.15,
    requiredScore: 140,
    lesson: 'W centrum: tramwaje mają pierwszeństwo, deszcz wydłuża drogę hamowania pojazdów. Zachowaj większy margines bezpieczeństwa przed przejściem.',
  },
  {
    id: 'industrial',
    name: 'DZIELNICA PRZEMYSŁOWA',
    desc: 'Ciężki transport, roboty drogowe',
    gridSize: 4,
    blockSize: 32,
    vehicles: 10,
    pedestrians: 5,
    cameras: 4,
    weather: 'fog',
    timeOfDay: 'night',
    hazardRate: 0.18,
    vehicleSpeed: 0.20,
    redLightRunChance: 0.10,
    sirenChance: 0.10,
    requiredScore: 240,
    lesson: 'Noc i mgła ograniczają widoczność. TIR-y mają długą drogę hamowania. LPR (License Plate Recognition) wykrywa pojazdy zagrażające bezpieczeństwu.',
  },
  {
    id: 'highway',
    name: 'AUTOSTRADA MIEJSKA',
    desc: 'Misja finałowa - ewakuacja',
    gridSize: 5,
    blockSize: 34,
    vehicles: 18,
    pedestrians: 12,
    cameras: 6,
    weather: 'rain',
    timeOfDay: 'night',
    hazardRate: 0.25,
    vehicleSpeed: 0.28,
    redLightRunChance: 0.12,
    sirenChance: 0.30,
    requiredScore: 360,
    lesson: 'Misja finałowa: koordynuj z Command Center, słuchaj radia APX i Assist AI. Pełny ekosystem Motorola Solutions chroni Cię na każdym kroku.',
  },
];

export const SCORE = {
  CROSS_GREEN: 10,
  USE_CROSSING: 5,
  REACT_EMERGENCY: 15,
  FOLLOW_ASSIST: 10,
  CROSS_RED: -20,
  JAYWALK: -15,
  PHONE_CROSS: -10,
  IGNORE_ASSIST: -10,
  HIT_BY_CAR: -50,
  REACH_GOAL: 50,
};

export const GRADES = [
  { min: 200, letter: 'A', color: '#00b074', label: 'CERTIFIED SAFE CITIZEN' },
  { min: 140, letter: 'B', color: '#5fc56e', label: 'BARDZO DOBRY PIESZY' },
  { min: 80,  letter: 'C', color: '#00A3E0', label: 'DOBRY PIESZY' },
  { min: 30,  letter: 'D', color: '#ffb800', label: 'POPRAW SIĘ' },
  { min: -50, letter: 'E', color: '#ff7a45', label: 'NIEBEZPIECZNE NAWYKI' },
  { min: -9999, letter: 'F', color: '#e63946', label: 'KURS BRD WYMAGANY' },
];

export function gradeFor(score) {
  for (const g of GRADES) if (score >= g.min) return g;
  return GRADES[GRADES.length - 1];
}

// Motorola palette for materials
export const PALETTE = {
  blue:   0x003DA5,
  cyan:   0x00A3E0,
  green:  0x00b074,
  amber:  0xffb800,
  red:    0xe63946,
  road:   0x2b2f38,
  curb:   0x6a7280,
  sidewalk: 0xb0b4bc,
  grass:  0xB5654A,  // terracotta brick (chodnik)
  sky:    0x87ceeb,
  nightSky: 0x0a1838,
  building: [0x6b7d99, 0x8aa0bf, 0xa9bbd3, 0x7e90a8, 0x5d6c85, 0x9bb0cc],
  vehicle: [0xb53030, 0x2266c2, 0xf0c44a, 0x33b56a, 0x444444, 0xcccccc, 0x884cc8],
};

// Localized assist tips (rotate)
export const ASSIST_TIPS = [
  'Pamiętaj - zawsze korzystaj z przejść dla pieszych.',
  'Zatrzymaj się przy krawężniku przed wejściem na pasy.',
  'Spójrz w lewo, prawo, jeszcze raz w lewo.',
  'Czerwone światło? Czekaj. Bezpieczeństwo jest ważniejsze niż czas.',
  'Słyszysz syrenę? Ustąp pierwszeństwa pojazdom uprzywilejowanym.',
  'Avigilon wykrył pojazd łamiący przepisy - zachowaj ostrożność.',
  'LPR zidentyfikował pojazd na alert - bądź czujny.',
  'Pamiętaj o widoczności - nie używaj telefonu podczas przechodzenia.',
];

// Radio messages that trigger real gameplay events
// Format: { text, event } where event is a function called on GameLogic
export const RADIO_EVENTS = [
  {
    text: 'Dyspozytor: zgłoszenie kolizji - pojazd ignoruje światło!',
    event: (game) => {
      const v = game.traffic.vehicles.find(v => !v.runsRed && !v.isEmergency);
      if (v) v.runsRed = true;
      game.audio.warn();
    },
  },
  {
    text: 'Karetka w trasie - pojazd uprzywilejowany na trasie!',
    event: (game) => {
      game.traffic._spawnEmergency();
      game.audio.siren();
    },
  },
  {
    text: 'LPR: skradziony pojazd namierzony w Twoim sektorze!',
    event: (game) => {
      game.hud.incLPR();
      const v = game.traffic.vehicles.find(v => !v.runsRed && !v.isEmergency);
      if (v) v.runsRed = true;
    },
  },
  {
    text: 'Drogówka: awaria sygnalizacji - ostrożność na przejściach!',
    event: (game) => {
      const tl = game.city.trafficLights[Math.floor(Math.random() * game.city.trafficLights.length)];
      tl.state = 'amber'; tl.timer = 0;
      game.city._applyLightVisual([tl]);
    },
  },
  {
    text: 'Centrum: Avigilon wykrył zagrożenie - zachowaj czujność!',
    event: (game) => {
      game.audio.warn();
    },
  },
];

// Fallback flavor messages (no gameplay effect)
export const RADIO_FLAVOR = [
  'Patrol 3: kontrola prędkości, pojazdy zwalniają.',
  'Straż 2: zabezpieczamy miejsce zdarzenia.',
  'Dyspozytor: wszystkie jednostki - zachować pełną gotowość.',
];
