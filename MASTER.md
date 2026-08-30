# KURO — Nothing-Inspired UI/UX Design System Specification (MASTER.md)

> **Canonical Source of Truth** for KURO's Nothing-inspired industrial anime architecture.
> Trained in Swiss typography, industrial design (Braun, Teenage Engineering), and modern interface craft.
> Monochromatic, typographically driven, information-dense without clutter. Dark (OLED) and light mode with equal rigor.

---

## 1. Design Philosophy

1. **Subtract, don't add.** Every element must earn its pixel. Default to removal.
2. **Structure is ornament.** Expose the grid, the data, and the hierarchy itself.
3. **Monochrome is the canvas.** OLED Pure Black (`#000000`) canvas. Color is an event, not a default.
4. **Nothing Iconic Red (`#D71921`) is an interrupt.** Used for "look HERE, NOW" events, recording/live dots, and primary triggers.
5. **Type does the heavy lifting.** Scale, weight, and spacing create hierarchy — Doto (dot-matrix hero), Space Grotesk (geometric sans body), Space Mono (technical uppercase labels/specs).
6. **Both modes are first-class.** Dark mode: OLED pure black. Light mode: warm technical off-white (`#F5F4F0`).
7. **Industrial warmth.** Technical and precise, mechanical honesty, physical switch vibes.

---

## 2. Design Tokens

### Color Palette

| Token Name | Dark Mode (OLED) | Light Mode (Warm) | Role / Usage |
|---|---|---|---|
| `--bg-canvas` | `#000000` | `#F5F4F0` | Base canvas background |
| `--bg-surface-1` | `#0c0c0c` | `#EBEAE5` | Base card and section surface |
| `--bg-surface-2` | `#151515` | `#DFDDD6` | Elevated controls and inputs |
| `--bg-surface-3` | `#202020` | `#D2D0C7` | Hover state and active tabs |
| `--text-display` | `#ffffff` | `#000000` | 100% Hero headlines and numbers |
| `--text-primary` | `#e2e2e2` | `#191919` | 90% Primary body and titles |
| `--text-secondary` | `#8e8e93` | `#68686C` | 60% Labels, metadata, subheadings |
| `--text-disabled` | `#505054` | `#9E9EA2` | 40% Disabled and fine print |
| `--border-hairline` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.15)` | 1px razor perimeter border |
| `--accent-red` | `#D71921` | `#D71921` | Nothing iconic red action interrupt |
| `--status-success` | `#00D26A` | `#00D26A` | Watched / valid state indicator |
| `--status-warning` | `#FFB800` | `#FFB800` | Score and alert indicator |

### Typography Scale

- **Display Hero**: `'Doto', 'Space Grotesk', sans-serif` — variable dot-matrix headlines and hero moments.
- **UI & Body**: `'Space Grotesk', sans-serif` — geometric sans-serif for content clarity.
- **Technical & Labels**: `'Space Mono', monospace` — ALL CAPS for metadata, specs, status chips, and controls.

### Radii Scale

- `radius-none`: `0px`
- `radius-sm`: `4px`
- `radius-md`: `8px`
- `radius-pill`: `999px`

---

## 3. Mobile First Responsiveness

- **Navigation**: Pinned 56px razor top header + mobile bottom navigation bar (`[ GALLERY ]`, `[ SEARCH ]`, `[ ARCHIVE ]`, `[ KEYS ]`).
- **Touch Optimization**: Minimum 44px tap targets, native touch momentum scrolling, double-tap seek (±10s), long press 2.0x speed.
- **Safe Area Insets**: Native support for notch and home indicator areas (`env(safe-area-inset-bottom)`).
