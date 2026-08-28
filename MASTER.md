# AniStream — Design System Specification (MASTER.md)

> **Canonical Source of Truth** for AniStream's anti-AI-slop visual universe.
> Built on the **Otaku Cinema / Midnight Obsidian & Vermilion Crimson** design theses.

---

## 1. Visual & Interaction Theses

### Visual Thesis
> An abyssal obsidian-black interface (`#0a0a0c`) built on raw dark charcoal surfaces (`#141419`), high-contrast display typography with tight negative tracking, a single vermilion-crimson action accent (`#e11d48`), edge-to-edge cinematic poster artwork with deep surface drop shadows, and zero decorative gradients or soft AI-slop glows.

### Interaction Thesis
> Fast, cinematic precision transitions (150–250ms `cubic-bezier(0.16, 1, 0.3, 1)`), tactile hover scale on poster frames (`scale(1.02)`), smooth backdrop image cross-fades, instant keyboard navigation (`Space`, `F`, `ArrowKeys`), forbidden patterns: zero elastic bounce, zero decorative floating shapes, zero heavy blur shimmers.

---

## 2. Design Tokens

### Color Palette

| Token Name | Hex / Value | Role / Usage |
|---|---|---|
| `--color-canvas-obsidian` | `#0a0a0c` | Abyssal background canvas (pure dark) |
| `--color-surface-1` | `#141419` | Primary card & section surface |
| `--color-surface-2` | `#1c1c24` | Elevated control surface & input background |
| `--color-surface-3` | `#262632` | Hover state surface & modal backdrop |
| `--color-crimson` | `#e11d48` | Single Action Accent (Vermilion Crimson) |
| `--color-crimson-hover` | `#f43f5e` | Hover state for crimson actions |
| `--color-crimson-alpha` | `rgba(225, 29, 72, 0.18)` | Soft active background & selection tint |
| `--color-text-main` | `#f4f4f5` | High-contrast body & headline text |
| `--color-text-muted` | `#a1a1aa` | Muted metadata, subcopy, and labels |
| `--color-text-dim` | `#71717a` | Captions, disabled states, and fine print |
| `--color-hairline` | `rgba(255, 255, 255, 0.08)` | 1px clean razor border |
| `--color-hairline-crimson` | `rgba(225, 29, 72, 0.4)` | Focused/active border glow |
| `--color-success` | `#22c55e` | Watched status indicator |

### Typography Scale (Font Stack: `Inter, -apple-system, sans-serif`)

| Token Name | Size | Weight | Line Height | Tracking | Usage |
|---|---|---|---|---|---|
| `hero-display` | 48px | 800 | 1.08 | `-0.025em` | Featured Billboard title |
| `display-lg` | 36px | 800 | 1.12 | `-0.02em` | Section headers & detail title |
| `display-md` | 24px | 700 | 1.25 | `-0.015em` | Card titles, sub-section headers |
| `tagline` | 18px | 600 | 1.30 | `-0.01em` | Category titles, metadata titles |
| `body-strong` | 15px | 600 | 1.40 | `-0.01em` | Bold body, button labels |
| `body` | 15px | 400 | 1.60 | `0` | Paragraphs, descriptions, specs |
| `caption` | 13px | 500 | 1.40 | `0` | Metadata badges, episode tags |
| `fine-print` | 11px | 600 | 1.00 | `0.05em` | Upper-case badges, keyboard hints |

### Spacing System (Base 8px)
- `spacing-xxs`: 4px
- `spacing-xs`: 8px
- `spacing-sm`: 12px
- `spacing-md`: 16px
- `spacing-lg`: 24px
- `spacing-xl`: 32px
- `spacing-xxl`: 48px
- `spacing-section`: 64px

### Radii Scale
- `radius-none`: 0px
- `radius-sm`: 6px
- `radius-md`: 10px
- `radius-lg`: 16px
- `radius-pill`: 9999px
- `radius-circle`: 50%

### Elevation & Shadows
- `shadow-poster`: `0 16px 40px rgba(0, 0, 0, 0.8)` (Applied strictly to poster artwork resting on canvas)
- `shadow-crimson`: `0 4px 20px rgba(225, 29, 72, 0.4)` (Applied to primary crimson CTA buttons)
- `shadow-dropdown`: `0 20px 50px rgba(0, 0, 0, 0.9)` (Applied to search suggestions dropdown)

### Motion Tokens
- `duration-fast`: `150ms`
- `duration-normal`: `220ms`
- `easing-cinematic`: `cubic-bezier(0.16, 1, 0.3, 1)`

---

## 3. Core Component Architecture

1. **Top Global Header (`.nav-bar`)**:
   - Pinned `60px` dark bar (`#0a0a0c` at 90% opacity + `backdrop-filter: blur(16px)`).
   - Brand logo with crimson badge (`▶ AniStream`).
   - Clean search input with instant suggestion autocomplete popover.

2. **Featured Billboard (`.billboard-hero`)**:
   - Full-bleed 16:9 hero section with high-res backdrop banner image.
   - Dark gradient vignette (`linear-gradient(0deg, #0a0a0c 0%, rgba(10,10,12,0.6) 60%, transparent 100%)`).
   - Title, score badge (`★ 8.5`), genres, synopsis, and vermilion `▶ Watch Episode 1` button.

3. **Continue Watching Row (`.landscape-grid`)**:
   - 16:9 Landscape cards with thumbnail + green play overlay button + crimson progress fill bar + episode badge.

4. **Recently Added & Recommendations Grid (`.poster-grid`)**:
   - 2:3 Portrait cards with `16px` radius, score badge overlay, title, studio info, and `scale(1.02)` hover animation.

5. **Anime Detail View (`.detail-view`)**:
   - Hero backdrop banner with gradient fade.
   - 2-Column Metadata Cards Grid: Media Details (Genres, Studio, Format, Status, Year) & Stream Specs (1080p H264, Audio AAC, Subtitles).
   - Cast & Crew Section: Circular avatars (`90px`, 50% radius) with character name and role.
   - Episodes grid with watched state badges.

6. **Cinema Video Player (`.player-view`)**:
   - Edge-to-edge pure obsidian viewport with HLS.js player, episode switcher, quality pills, and keyboard shortcuts (`Space`, `F`, `←`, `→`, `N`, `P`).
