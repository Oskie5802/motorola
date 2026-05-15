# CrossGuard - Symulator Pieszego

## Project Overview

CrossGuard is an educational 3D browser game created for the **Motorola Solutions Science Cup 2026**. The game teaches pedestrian safety through interactive gameplay in a smart city environment powered by Motorola Solutions Public Safety technologies.

**Language**: Polish  
**Technology Stack**: Three.js r170 + Vanilla JavaScript (ES modules)  
**Theme**: Pedestrian safety education in a smart city context

---

## Project Structure

```
motorola/
├── crossguard/
│   ├── index.html              # Main HTML with screens (menu, HUD, results, pause)
│   ├── styles.css              # Motorola-themed styling (Command Center aesthetic)
│   ├── src/
│   │   ├── main.js             # Bootstrap, menu system, game loop, progress persistence
│   │   ├── config.js           # Zone configs, scoring system, colors, radio events
│   │   ├── game.js             # Core game logic, scoring rules, dynamic events
│   │   ├── player.js           # Player character (Alex Nawigant) with Kenney FBX model
│   │   ├── city.js             # Procedural city generation (roads, crossings, buildings)
│   │   ├── traffic.js          # Vehicle AI, NPC pedestrians, emergency vehicles
│   │   ├── hud.js              # Mini-map, alerts, Assist AI panel, radio display
│   │   ├── environment.js      # Sky, lighting, day/night cycle, weather effects
│   │   ├── audio.js            # WebAudio synth (no external audio files)
│   │   └── modelLoader.js      # OBJ/FBX loaders for buildings and character
│   └── assets/
│       ├── OBJ format/         # Building models (14 buildings + 5 skyscrapers)
│       └── kenney_animated-characters-protagonists/  # Character FBX + animations
└── CrossGuard game design.pdf   # Game Design Document
```

---

## Core Systems

### 1. **Game Loop & State Management** (`main.js`)
- Bootstrap system with loading screen → menu → game → results flow
- Progress persistence via `localStorage` (unlocked zones, best scores, tutorial seen)
- Zone selection with score-based unlocking system
- Pause/resume functionality (Esc key)
- Cleanup and resource disposal between sessions

### 2. **City Generation** (`city.js`)
Procedural grid-based city layout:
- **Grid system**: Configurable grid size (4-5) and block size (28-34 units)
- **Roads**: Full grid with dashed lane markings, excluded at intersections
- **Sidewalks**: Frame around each block with curb edges
- **Crossings**: Zebra crossings at all 4 arms of each intersection
- **Traffic lights**: Synchronized pairs (NS/EW) with red/green/amber states
- **Buildings**: Low-poly procedural buildings OR loaded OBJ models
  - Simple mode: Box geometry with windows, cornices, roof details
  - Model mode: Loaded OBJ/MTL assets with collision boxes
- **Street furniture**: Trees, benches, building details
- **Avigilon cameras**: Mounted at intersection corners with status LEDs
- **Roadworks**: Obstacles in industrial/highway zones

### 3. **Player Character** (`player.js`)
- **Character**: Alex Nawigant (Kenney animated character FBX)
- **Animations**: Idle, run (with speed-based timeScale), jump
- **Controls**: WASD/Arrows (movement), Shift (run), Space (stop), Mouse (camera), Scroll (zoom)
- **Phone distraction**: Press P to toggle phone overlay (reduces speed)
- **Collision**: Building collision, vehicle collision detection
- **Camera**: Third-person orbit camera with pitch/yaw/distance controls

### 4. **Traffic System** (`traffic.js`)
- **Vehicle types**: Cars, buses, trucks, trams (downtown zone)
- **AI behavior**:
  - Follow road segments with lane offset
  - Stop at red lights (unless red-light runner)
  - Stop for player on crossing
  - Stop for vehicles ahead
  - Weather speed reduction (rain/fog)
- **Emergency vehicles**: White/red cars with siren bars, ignore traffic lights
- **NPC pedestrians**: Wander between sidewalk points with walking animation
- **Red-light runners**: Configurable chance per zone (2-12%)
- **LPR flagging**: License Plate Recognition system marks suspicious vehicles

### 5. **Game Logic** (`game.js`)
- **Scoring system**:
  - `+10` Cross on green light
  - `+5` Use crossing
  - `+15` React to emergency vehicle
  - `+10` Follow Assist AI advice
  - `-20` Cross on red light
  - `-15` Jaywalk (enter road outside crossing)
  - `-10` Phone while crossing
  - `-50` Hit by car
  - `+50` Reach goal
- **Grades**: A (Certified Safe Citizen) to F (BRD course required)
- **Assist AI**: Contextual advice generation with scoring for following/ignoring
- **Dynamic events**:
  - Red-light runner spawning
  - Emergency vehicle spawning
  - Traffic light failure (amber stuck)
  - LPR alerts
  - Roadworks spawning
- **Avigilon detection**: Cameras scan for red-light runners
- **Goal system**: Golden beacon marker with navigation arrow

### 6. **HUD System** (`hud.js`)
- **Top bar**: Mission text, distance to goal, timer, safety score
- **Mini-map**: Canvas2D rendering showing:
  - Player (blue dot with facing arrow)
  - Goal (gold triangle)
  - Vehicles (blue/red/cyan based on type/flags)
  - Cameras (purple dots)
  - Road grid
- **Assist AI panel**: Contextual safety advice with rotation tips
- **Radio panel**: APX P25 radio simulation (unlocked at 30 points)
  - Gameplay events (60%): Red-light runner, emergency, LPR alert, light failure
  - Flavor messages (40%): Patrol updates, dispatch comms
- **Alerts**: Toast notifications for scoring, events, warnings
- **Crossing prompt**: Shows pedestrian signal state when on crossing
- **Floating score numbers**: 3D-projected popups at player position

### 7. **Environment** (`environment.js`)
- **Sky**: Gradient canvas texture (day/morning/night variations)
- **Lighting**: Hemisphere ambient + directional sun with shadows
- **Fog**: Zone-dependent (none/rain/fog with different densities)
- **Weather effects**:
  - Rain: Particle system with falling drops
  - Snow: Drifting particles with sine wave motion
  - Stars: Night sky with moon
- **Day/night cycle**: Zone-configured (day/morning/night)

### 8. **Audio System** (`audio.js`)
Pure WebAudio synthesis (no external audio files):
- **SFX**: Good/bad/warn blips, Motorola chime, honk, siren
- **Ambient**: Low-frequency hum with periodic bird/horn sounds
- **Zone-specific**: Different hum frequency for industrial zones

### 9. **Configuration** (`config.js`)
- **Zones**: 5 progressive zones (residential → school → downtown → industrial → highway)
  - Each zone has: grid size, vehicle count, pedestrian count, camera count
  - Weather: clear/rain/fog
  - Time of day: day/morning/night
  - Difficulty: hazard rate, vehicle speed, red-light chance, siren chance
  - Required score to unlock
  - Educational lesson text
- **Scoring constants**: All point values
- **Grades**: 6 grade levels (A-F) with colors and labels
- **Palette**: Motorola brand colors (blue, cyan, green, amber, red)
- **Assist tips**: Rotating safety advice
- **Radio events**: Event-triggered radio messages with gameplay effects

---

## Game Flow

1. **Loading**: Shows loading screen, caches building/character models
2. **Menu**: Zone selection with lock/unlock based on total score
3. **Tutorial**: First-time tutorial overlay (saved in progress)
4. **Gameplay**:
   - Spawn player at random sidewalk point
   - Place goal marker at distant sidewalk point
   - Player navigates using crossings, avoiding vehicles
   - Score updated based on safe/unsafe behaviors
   - Dynamic events triggered periodically
   - Assist AI provides contextual advice
   - Radio broadcasts events (after unlock)
   - Time limit counts down (180s or 240s for highway)
5. **Completion**:
   - Success: Reach goal within time limit
   - Timeout: Time runs out
   - Results screen shows grade, stats, lesson
   - Progress saved (best score per zone)
   - Next zone unlocked if score threshold met

---

## Key Features

### Motorola Solutions Integration
- **Command Center HUD**: Styled after Motorola command interfaces
- **Avigilon Cameras**: Physical objects + mini-map markers, detect violations
- **APX P25 Radio**: Dispatch channel with gameplay-relevant events
- **LPR System**: License Plate Recognition flags suspicious vehicles
- **Assist AI**: AI-powered safety advice system

### Educational Elements
- **5 progressive zones**: Teaching increasingly complex scenarios
- **Safety scoring**: Reinforces good behaviors, penalizes bad ones
- **Grade system**: A-F grades with "Certified Safe Citizen" achievement
- **Contextual lessons**: Zone-specific educational messages
- **Dynamic hazards**: Red-light runners, emergency vehicles, signal failures

### Technical Highlights
- **No build step**: Pure ES modules with importmap (Three.js from CDN)
- **Procedural generation**: Infinite city layouts from zone parameters
- **Performance**: Object pooling, efficient collision detection, shadow optimization
- **Fallback systems**: Character model fallback to simple geometry if FBX fails
- **Responsive design**: Mobile-friendly HUD scaling

---

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D or Arrows | Movement |
| Shift | Run |
| Space | Stop |
| Mouse (LMB+drag) | Rotate camera |
| Scroll wheel | Zoom camera |
| P | Toggle phone distraction |
| R | Toggle radio (after unlock) |
| Esc | Pause |

---

## Development Notes

### Running the Game
Requires local server (browsers block ES modules from `file://`):
```bash
cd crossguard
python3 -m http.server 8080
# Open: http://localhost:8080
```

### Asset Loading
- Building models: OBJ + MTL from `assets/OBJ format/`
- Character model: Kenney FBX with separate animation files
- Fallback: Simple geometry if models fail to load
- Progress bar shown during initial model load

### Performance Optimizations
- Shadow map size: 2048x2048
- Pixel ratio capped at 2x
- Power preference: high-performance
- Geometry/material disposal on session end
- Efficient collision checks (AABB)

### Known Limitations
- No build step (intentional for quick deployment)
- WebAudio only (no external audio files)
- Character animation retargeting relies on matching bone names
- Model loading is synchronous during initial load

---

## File Dependencies

```
main.js
├── config.js
├── city.js
│   └── config.js
├── player.js
├── traffic.js
│   └── config.js
├── hud.js
│   └── config.js
├── audio.js
├── environment.js
│   └── config.js
├── game.js
│   └── config.js
└── modelLoader.js
```

---

## External Dependencies

- **Three.js r170**: Loaded via CDN (unpkg.com)
- **Three.js addons**:
  - `RoomEnvironment` (environment map)
  - `OBJLoader` (building models)
  - `MTLLoader` (building materials)
  - `FBXLoader` (character model)
  - `SkeletonUtils` (character cloning)

No npm packages or build tools required.

---

## Polish Language Context

All game text, UI, and educational content is in Polish:
- Zone names (DZIELNICA MIESZKALNA, STREFA SZKOLNA, etc.)
- UI labels (MISJA, CZAS, SAFETY SCORE)
- Assist AI messages
- Radio communications
- Grade labels (CERTIFIED SAFE CITIZEN, KURS BRD WYMAGANY)

---

## Future Enhancement Possibilities

- Additional zones beyond the current 5
- More vehicle types (motorcycles, bicycles)
- Pedestrian crossing buttons
- More complex weather (snow, thunderstorm)
- Multiplayer or leaderboard integration
- Achievement system beyond grades
- Voice-over for educational content
- More detailed character customization
