// Konfiguracja CrossGuard: strefy, punktacja, pogoda, vki

export const ZONES = [
  {
    id: 'residential',
    name: 'DZIELNICA MIESZKALNA',
    desc: 'Spokojna okolica, mały ruch',
    vehicles: 50,
    pedestrians: 16,
    cameras: 2,
    weather: 'clear',
    timeOfDay: 'day',
    hazardRate: 0.05,
    vehicleSpeed: 0.6,
    redLightRunChance: 0.02,
    sirenChance: 0.05,
    requiredScore: 200,
    lesson: 'Podstawy BRD: zawsze korzystaj z przejść dla pieszych i sygnalizacji świetlnej. To Twój pierwszy krok do statusu Certified Safe Citizen.',

    // Deterministyczny layout osiedla: 3x3 bloki, spokojny uklad z malym parkiem
    layout: {
      xWidths: [32, 38, 32],
      zWidths: [30, 42, 30],
      signals: [[1,1], [2,2]],
      blocks: {
        '2,0': 'park',
      },
    },
  },
  {
    id: 'school',
    name: 'STREFA SZKOLNA',
    desc: 'Okolice szkół, dużo pieszych',
    vehicles: 8,
    pedestrians: 14,
    cameras: 3,
    weather: 'clear',
    timeOfDay: 'night',
    hazardRate: 0.08,
    vehicleSpeed: 0.14,
    redLightRunChance: 0.03,
    sirenChance: 0.08,
    requiredScore: 60,
    lesson: 'W strefach szkolnych obowiązuje obniżona prędkość. Uważaj na autobusy szkolne i grupy dzieci. System Avigilon monitoruje przekroczenia prędkości.',

    // Strefa szkolna: 3x3, centralny plac (boisko/skwer szkolny), 3 sygnalizacje
    layout: {
      xWidths: [28, 44, 28],
      zWidths: [30, 40, 30],
      signals: [[1,1], [2,1], [1,2]],
      blocks: {
        '1,1': 'plaza',
      },
    },
  },
  {
    id: 'downtown',
    name: 'CENTRUM MIASTA',
    desc: 'Intensywny ruch, tramwaje',
    vehicles: 40,
    pedestrians: 50,
    cameras: 5,
    weather: 'rain',
    timeOfDay: 'day',
    hazardRate: 0.12,
    vehicleSpeed: 0.22,
    redLightRunChance: 0.06,
    sirenChance: 0.15,
    requiredScore: 140,
    lesson: 'W centrum: tramwaje mają pierwszeństwo, deszcz wydłuża drogę hamowania pojazdów. Zachowaj większy margines bezpieczeństwa przed przejściem.',

    // Centrum: 4x4, rynek w srodku, park na uboczu, 5 sygnalizacji w ukladzie krzyzowym
    layout: {
      xWidths: [26, 32, 32, 26],
      zWidths: [26, 32, 32, 26],
      signals: [[1,2], [2,1], [2,2], [2,3], [3,2]],
      blocks: {
        '1,1': 'plaza',
        '2,2': 'park',
      },
    },
  },
  {
    id: 'industrial',
    name: 'DZIELNICA PRZEMYSŁOWA',
    desc: 'Ciężki transport, roboty drogowe',
    vehicles: 20,
    pedestrians: 16,
    cameras: 4,
    weather: 'fog',
    timeOfDay: 'day',
    hazardRate: 0.18,
    vehicleSpeed: 0.20,
    redLightRunChance: 0.10,
    sirenChance: 0.10,
    requiredScore: 240,
    lesson: 'Noc i mgła ograniczają widoczność. TIR-y mają długą drogę hamowania. LPR (License Plate Recognition) wykrywa pojazdy zagrażające bezpieczeństwu.',

    // Przemyslowka: 3x3, duze bloki, minimalna sygnalizacja, puste dzialki
    layout: {
      xWidths: [40, 44, 40],
      zWidths: [38, 48, 38],
      signals: [[1,1], [2,2]],
      blocks: {
        '0,2': 'empty',
        '2,0': 'empty',
      },
    },
  },
  {
    id: 'highway',
    name: 'AUTOSTRADA MIEJSKA',
    desc: 'Misja finałowa - ewakuacja',
    vehicles: 40,
    pedestrians: 28,
    cameras: 6,
    weather: 'rain',
    timeOfDay: 'day',
    hazardRate: 0.25,
    vehicleSpeed: 0.28,
    redLightRunChance: 0.12,
    sirenChance: 0.30,
    requiredScore: 360,
    lesson: 'Misja finałowa: koordynuj z Command Center i Assist AI. Pełny ekosystem Motorola Solutions chroni Cię na każdym kroku.',

    // Finalna misja: 4x4, wiecej sygnalizacji, park i plac rozrzucone
    layout: {
      xWidths: [28, 34, 34, 28],
      zWidths: [28, 34, 34, 28],
      signals: [[1,1], [1,3], [2,2], [3,1], [3,3]],
      blocks: {
        '1,1': 'park',
        '2,0': 'plaza',
      },
    },
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
  STOP_VIOLATION: -15,
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

// Paleta kolorow motoroli dla materialow
export const PALETTE = {
  blue:   0x003DA5,
  cyan:   0x00A3E0,
  green:  0x00b074,
  amber:  0xffb800,
  red:    0xe63946,
  road:   0x1a1e26,
  curb:   0xb8bcc8,
  sidewalk: 0x4a4e58,
  grass:  0x2a2530,  // dark ground
  sky:    0x87ceeb,
  nightSky: 0x060a18,
  building: [0x2a3048, 0x353d5a, 0x404868, 0x2e3650, 0x252a42, 0x383f5c],
  vehicle: [0xb53030, 0x2266c2, 0xf0c44a, 0x33b56a, 0x444444, 0xcccccc, 0x884cc8],
    // Kolory neonow
  neon: [0x00ffaa, 0xff00ff, 0x00aaff, 0xff6600, 0xaa00ff, 0x00ffff, 0xff0066],
};

// Rotacyjne podpowiedzi asystenta
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
