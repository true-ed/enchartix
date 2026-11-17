# Enchartix 3D

> Interactive, data-agnostic 3D time-series visualization engine for Obsidian.

Enchartix renders multi-series numerical logs into an orthographic 3D/2D environment. It combines macro cumulative progression (side elevation) with intraday micro-sequences (top-down projection) inside a single WebGL2 viewport.

## Key Capabilities

* **Dual-Projection Architecture:** Inspect macro cumulative trends in 3D perspective (`XY`) and switch to 2D top-down mode (`XZ`) to analyze individual intraday sequences.
* **Focus+Context Dock Magnification:** Hovering over compressed segments (even across 180–365+ days) dynamically expands the active day around the cursor while smoothly morphing its curve from an organic wave into sharp linear facets.
* **Adaptive Nice-Number Grid Shader:** Automatically computes per-day positive and negative grid scales (`1, 2, 2.5, 5, 10 × 10^n`) with screen-space 1px lines (`fwidth`), 5-unit major dividers, and an exact zero baseline.
* **3D Value Pills & Vault Navigation:** Displays camera-facing 3D value badges anchored to each vertex on hover, supports up to 256-character note previews (`note`), and opens the source Obsidian note on click (`file`).
* **OKLCH Color Harmony & Theme Sync:** Generates balanced background, grid, and multi-series palettes from a single hex accent color and syncs automatically with Obsidian dark/light themes.

---

## Showcase

<h3 align="center">Dark Theme Integration</h3>
<p align="center">
  <img src="screenshots/Знімок екрана 2026-02-22 о 20.58.23_transparent.png" width="48%">
  <img src="screenshots/Знімок екрана 2026-02-22 о 20.58.35_transparent.png" width="48%">
</p>
<p align="center">
  <img src="screenshots/Знімок екрана 2026-02-22 о 20.58.46_transparent.png" width="48%">
  <img src="screenshots/Знімок екрана 2026-02-22 о 20.59.01_transparent.png" width="48%">
</p>

<h3 align="center">Light Theme Integration</h3>
<p align="center">
  <img src="screenshots/Знімок екрана 2026-02-22 о 20.59.35_transparent.png" width="48%">
  <img src="screenshots/Знімок екрана 2026-02-22 о 20.59.51_transparent.png" width="48%">
</p>
<p align="center">
  <img src="screenshots/Знімок екрана 2026-02-22 о 21.00.05_transparent.png" width="48%">
  <img src="screenshots/Знімок екрана 2026-02-22 о 21.00.25_transparent.png" width="48%">
</p>

---

## Quick Start (Copy-Paste Playground)

Requires the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin with **Enable JavaScript Queries** turned on. Paste the block below into any note to test immediately without external notes:

```javascript
```dataviewjs
if (window.EnchartixGraph) {
    if (this.container._enchartixInstance) {
        this.container._enchartixInstance.destroy();
    }

    const sampleData = [
        {
            name: "Net Cashflow ($ USD)",
            entries: [
                { values: [], date: "Start" },
                { values: [320, 180, -90, 450], date: "2026.02.01", note: "Initial payout and infrastructure deduction." },
                { values: [10, 20, 5, 141], date: "2026.02.09", note: "Evening conversion spike after release." },
                { values: [450, 1200, -320, 1937], date: "2026.02.19", note: "Peak daily settlement (auto-scales to 2000 ceiling)." },
                { values: [800, 650, -150, 920], date: "2026.02.24", note: "Recurring retention baseline." }
            ]
        },
        {
            name: "Deep Work (Minutes)",
            entries: [
                { values: [], date: "Start" },
                { values: [45, 60, 30], date: "2026.02.01" },
                { values: [90, 45, 60], date: "2026.02.09" },
                { values: [120, 90, 60, 90], date: "2026.02.19" },
                { values: [90, 110, 75], date: "2026.02.24" }
            ]
        }
    ];

    this.container._enchartixInstance = new window.EnchartixGraph(this.container, sampleData, {
        themeColor: "#7d33ff",
        tooltipMode: "pinned"
    });
} else {
    dv.paragraph("Enchartix engine not loaded.");
}
```
```

---

## Vault Workflow (DataviewJS + Frontmatter)

### 1. Note Properties (Frontmatter)

```yaml
---
target_tag: "#metrics"
tracking_params:
  - Revenue
  - DeepWork
theme_color: "#7d33ff"
---
```

### 2. DataviewJS Query

```javascript
```dataviewjs
const note = dv.current();
const targetTag = note.target_tag || "#metrics";
const metrics = Array.isArray(note.tracking_params) ? note.tracking_params : [note.tracking_params];
const themeColor = note.theme_color || "#7d33ff";

const pages = dv.pages(targetTag).sort(p => p.file.ctime.ts);
const seriesData = metrics.map(metric => {
    const entries = [{ values: [], date: "Start" }];

    pages.forEach(p => {
        const val = p[metric];
        if (val === undefined || val === null) return;

        const values = Array.isArray(val) ? val.map(Number) : [Number(val)];
        entries.push({
            values,
            date: p.file.name,
            note: p.note || p.summary || "",
            file: p.file.path
        });
    });

    return { name: metric, entries };
});

if (window.EnchartixGraph) {
    if (this.container._enchartixInstance) {
        this.container._enchartixInstance.destroy();
    }

    this.container._enchartixInstance = new window.EnchartixGraph(this.container, seriesData, {
        themeColor,
        tooltipMode: "pinned"
    });
}
```
```

## Controls & Interactions

* **Rotate:** Left Click + Drag
* **Pan:** Right Click + Drag
* **Zoom:** Scroll Wheel / Pinch
* **Inspect Segment:** Hover over any day to expand its micro-graph, view 3D vertex values, and inspect the scale grid.
* **Open Source Note:** Click an active day segment (when `file` is provided) to open the corresponding note in Obsidian.
* **Info HUD Mode:** Toggle between `Pinned Top` (scrollable HUD in the top-right corner) and `Floating` cursor tooltip.
* **Auto-Reset:** Camera returns to the default perspective after 60 seconds of complete inactivity.