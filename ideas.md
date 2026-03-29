# Church Executive Dashboard — Design Brainstorm

## Context
Executive-level reporting dashboard for a multi-site church pastor. Must convey complex data (attendance, giving, next steps, volunteers) across 13 years and 3 campuses. The user values brevity, clarity, and actionable insights. This is a data-heavy tool, not a marketing site.

---

<response>
## Idea 1: "Editorial Data Narrative"

<text>
**Design Movement**: Swiss International / Editorial Design — inspired by Bloomberg Terminal meets The Economist data pages.

**Core Principles**:
1. Information density without clutter — every pixel earns its place
2. Typographic hierarchy drives scanning — numbers are the hero, not decoration
3. Monochromatic restraint with strategic color accents for alerts and trends
4. Data tells a story through spatial relationships, not just charts

**Color Philosophy**: A near-black slate (#0F172A) background with warm off-white (#F8FAFC) text. Accent palette uses a muted teal (#0D9488) for positive trends, amber (#D97706) for caution, and rose (#E11D48) for alerts. The dark ground reduces eye strain during extended analysis sessions and makes data "pop."

**Layout Paradigm**: Newspaper-style column grid with a persistent left sidebar for navigation. Content area uses a masonry-like arrangement of metric cards at varying sizes — large "headline" KPIs at top, supporting detail below. No equal-sized card grids.

**Signature Elements**:
- Oversized metric numbers (48-72px) with micro-labels beneath
- Thin horizontal sparklines embedded inline with text
- Subtle dot-grid background texture on cards

**Interaction Philosophy**: Hover reveals contextual comparisons (YoY change, campus breakdown). Click-to-drill from summary to detail. Filters are persistent in sidebar, not modal overlays.

**Animation**: Counters animate on load (number roll-up). Charts draw progressively. Card transitions use subtle scale + opacity. No bounce or spring — everything is linear/ease-out.

**Typography System**: DM Sans for headings (geometric, modern), JetBrains Mono for data numbers (monospaced for alignment), system sans-serif for body text.
</text>
<probability>0.08</probability>
</response>

---

<response>
## Idea 2: "Warm Pastoral Command Center"

<text>
**Design Movement**: Soft Brutalism meets Warm Minimalism — think Linear.app crossed with a high-end church brand.

**Core Principles**:
1. Warmth through color — not cold corporate blue, but earthy tones that feel pastoral
2. Generous breathing room — data needs space to be understood
3. Progressive disclosure — summary first, detail on demand
4. Campus identity through subtle color coding

**Color Philosophy**: Warm stone background (#FAFAF8) with deep forest text (#1A1F16). Primary accent is a rich sage green (#4A7C59) representing growth. Canton = warm terracotta (#C2703E), Jasper = mountain blue (#4A6FA5), Online = soft violet (#7C6DAF). These campus colors appear as left-border accents on cards, not overwhelming fills.

**Layout Paradigm**: Top navigation with tabbed sections (Overview, Attendance, Giving, Next Steps, Health). Each section uses a two-column layout: left 2/3 for primary charts, right 1/3 for contextual KPI sidebar. Full-width trend charts span both columns when needed.

**Signature Elements**:
- Rounded "pill" stat badges with subtle inner shadows
- Campus comparison shown as layered area charts with transparency
- Assimilation funnel rendered as a vertical stepped diagram, not a traditional funnel

**Interaction Philosophy**: Tab-based navigation keeps context. Date range picker is always visible in header. Campus toggle is a segmented control (All / Canton / Jasper / Online). Tooltips show exact values on chart hover.

**Animation**: Smooth tab transitions with content fade. Charts use staggered bar/line animations. KPI cards have a gentle entrance slide-up on section change.

**Typography System**: Outfit for headings (friendly geometric), Instrument Sans for body/labels, tabular-nums for all data values.
</text>
<probability>0.07</probability>
</response>

---

<response>
## Idea 3: "Precision Dashboard — Dark Ops"

<text>
**Design Movement**: Military/Aviation HUD aesthetic — think mission control meets Figma's dark mode. Inspired by Vercel's dashboard and Raycast.

**Core Principles**:
1. Zero decoration — every element is functional
2. Extreme contrast for scanability — bright data on dark canvas
3. Grid-locked precision — 8px grid, no exceptions
4. Status-driven coloring — green/amber/red for health indicators

**Color Philosophy**: True dark (#09090B) with subtle zinc card surfaces (#18181B). Text is zinc-100 (#F4F4F5). Charts use a neon-adjacent palette: electric blue (#3B82F6) for attendance, emerald (#10B981) for giving, amber (#F59E0B) for next steps, violet (#8B5CF6) for serving. These are vivid but not garish.

**Layout Paradigm**: Full-bleed sidebar navigation with icon + label. Main content uses a strict 12-column grid. Top row: 4 KPI cards. Below: 2-column chart pairs. Bottom: full-width data tables. No rounded corners larger than 8px.

**Signature Elements**:
- Glowing border accents on focused/active cards (1px with box-shadow glow)
- Mini trend arrows (▲▼) with percentage next to every KPI
- Horizontal rule separators with gradient fade

**Interaction Philosophy**: Keyboard-navigable. Sidebar collapses to icons on smaller screens. Charts have crosshair cursor with synchronized tooltips across related charts. Filter state reflected in URL for bookmarking.

**Animation**: Minimal — 150ms transitions only. Chart data points fade in sequentially. No decorative motion. Focus rings pulse subtly.

**Typography System**: Geist Sans for everything (clean, modern), with Geist Mono for numerical data. Single font family keeps it utilitarian.
</text>
<probability>0.06</probability>
</response>
