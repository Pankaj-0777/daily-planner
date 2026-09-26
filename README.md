# Daily Planner — Smart Schedule & Alarms

A circadian-aware daily planner with intelligent alarm integration. Built as a Progressive Web App (PWA) that installs on mobile and rings alarms even when the device sleeps.

## ✨ Features

### 🗓️ Smart Scheduling
- **Circadian Timeline** — Visual 24-hour schedule with color-coded blocks (Sleep, Work, Meals, Exercise, Personal)
- **Reactive Conflict Engine** — Auto-detects overlapping tasks and suggests resolutions
- **Free Slot Finder** — One-click analysis of available time windows
- **Wizard Setup** — Guided 4-step routine builder (Sleep → Anchors → Blocks → Review)

### 🔔 Alarm System (Mobile-First)
- **Auto-Prompt on Wake Time Change** — Adjust sleep schedule → instant alarm setup modal
- **High-Priority Task Alarms** — Fixed-time and P1 tasks trigger alarm prompt automatically
- **Flexible Recurrence** — 5 Weekdays (Mon–Fri), Everyday (7 days), Weekends, or Custom day selection
- **Dual Execution Engine**:
  - **In-App PWA Alarm** — Continuous Web Audio synthesis, haptic vibration, Screen Wake Lock, full-screen ringing overlay with Snooze (5 min) / Dismiss
  - **Native Android Clock Integration** — Dispatches `SET_ALARM` intent to register directly in device hardware clock app

### 📱 PWA Capabilities
- **Offline-First** — Service worker caches app shell; works without network
- **Installable** — Add to home screen on Android/iOS (standalone, no browser chrome)
- **Background Notifications** — Alarm alerts even when app is closed
- **Wake Lock** — Keeps screen on during active alarm ringing

### 🎨 Modern UI
- High-contrast dark theme optimized for scheduling workflows
- Bento-grid dashboard with ambient glow accents
- Smooth animations, responsive down to 320px
- Keyboard shortcuts (`N` new task, `T` today, `A` analyze, `E` export, `?` help)

---

## 🚀 Quick Start

### Local Development
```bash
# Clone and serve
cd daily-planner
python -m http.server 8000

# Open http://localhost:8000
# For mobile testing, tunnel with ngrok:
ngrok http 8000
```

### Install on Mobile
1. Open the HTTPS URL on your phone (GitHub Pages, Netlify, or ngrok)
2. Browser menu → **"Add to Home Screen"** / **"Install App"**
3. Launch from home screen → grant permissions:
   - 🔔 Notifications
   - 📳 Vibration
   - 🔆 Screen Wake Lock (when alarm rings)

---

## 📦 Deployment

### GitHub Pages (Free, HTTPS)
1. Push to a GitHub repository
2. Settings → Pages → Source: **Deploy from branch** → `main` / `/(root)`
3. Live at `https://<username>.github.io/<repo>/`

### Netlify / Vercel (Instant)
- Drag the project folder to [app.netlify.com/drop](https://app.netlify.com/drop) or import in Vercel
- Deploys in seconds with automatic HTTPS

### Any Static Host
- Upload all files to any static hosting (Firebase, Cloudflare Pages, Surge, etc.)
- **Requirement**: Must serve over HTTPS for PWA features to work

---

## 🏗️ Project Structure

```
daily-planner/
├── index.html          # App shell, modals, PWA meta
├── manifest.json       # PWA manifest (name, icons, shortcuts)
├── sw.js               # Service worker (offline, notifications)
├── css/
│   └── style.css       # Complete design system + alarm UI
├── js/
│   └── app.js          # Core engine: state, circadian calc, alarms, UI
└── icons/              # PWA icons (72–512px, maskable)
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New Task |
| `T` | Jump to Today |
| `A` | Analyze Free Slots |
| `E` | Export .ICS Calendar |
| `?` | Toggle Help Overlay |

---

## 🔧 Technical Highlights

### Circadian Engine
- Converts routine anchors (sleep, meals, work) into scored time blocks
- Energy-aware scoring: deep-work → morning, admin → afternoon, wind-down → evening
- Real-time conflict detection with auto-resolve suggestions

### AlarmEngine (`js/app.js`)
```javascript
// Core methods
AlarmEngine.checkAlarms()        // Runs every second in live clock
AlarmEngine.triggerAlarm(alarm)  // Starts audio + vibration + wake lock + overlay
AlarmEngine.dismissAlarm()       // Stops everything, releases wake lock
AlarmEngine.snoozeAlarm(5)       // Creates one-shot 5-min alarm
AlarmEngine.triggerNativeDeviceAlarm(alarm)  // Android SET_ALARM intent
```

### AudioEngine
Procedural Web Audio synthesizers (no audio files):
- `wake-chime` — Harmonic major triad, gentle attack
- `urgent` — Square wave + noise burst, high urgency
- `transition` — Dual-tone chime for block changes
- `gentle` — Pure sine, minimal startle

### Native Android Integration
```javascript
const intentUri = `intent:#Intent;
  action=android.intent.action.SET_ALARM;
  i.android.intent.extra.hour=${hour};
  i.android.intent.extra.minutes=${minute};
  S.android.intent.extra.message=${encodeURIComponent(title)};
  B.android.intent.extra.skip_ui=false;
end`;
```

---

## 🎯 Usage Flow

1. **Set Routines** — Define sleep/wake, meals, work anchors
2. **Add Tasks** — Priority (P1/P2/P3), rigidity (hard/soft), duration
3. **Auto-Alarm Prompts** — Wake time change or P1/hard task → modal appears
4. **Configure Alarm** — Pick recurrence, tone, vibration, native clock toggle
5. **Alarm Rings** — Full-screen overlay, Snooze/Dismiss, native clock also fires
6. **Manage Alarms** — Bento card shows active list with toggles, test, delete

---

## 📋 Browser Support

| Feature | Chrome Android | Safari iOS | Firefox Android | Edge Mobile |
|---------|----------------|------------|-----------------|-------------|
| PWA Install | ✅ | ✅ | ✅ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Web Notifications | ✅ | ✅ | ✅ | ✅ |
| Vibration API | ✅ | ❌ | ✅ | ✅ |
| Screen Wake Lock | ✅ | ❌ | ✅ | ✅ |
| Web Audio | ✅ | ✅ | ✅ | ✅ |
| Android Intent | ✅ | N/A | ✅ | ✅ |

> **iOS Note**: Native alarm intent not supported. In-app PWA alarm works fully with notifications + audio + overlay.

---

## 📄 License

MIT — Free for personal and commercial use.

---

## 🙏 Acknowledgments

- FontAwesome 6 for icons
- Google Fonts (Inter, Plus Jakarta Sans, JetBrains Mono)
- Web Audio API / Vibration API / Wake Lock API / Notifications API
- Android `SET_ALARM` intent specification

---

**Built for people who value their time.**  
Wake up on purpose. Schedule with intent.