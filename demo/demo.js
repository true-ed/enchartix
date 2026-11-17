import "../styles.css";


if (typeof window.activeDocument === "undefined") {
	window.activeDocument = document;
}
if (typeof window.activeWindow === "undefined") {
	window.activeWindow = window;
}
if (typeof window.createEl === "undefined") {
	window.createEl = (tag) => document.createElement(tag);
}
if (!HTMLElement.prototype.createDiv) {
	HTMLElement.prototype.createDiv = function (opts = {}) {
		const el = document.createElement("div");
		if (opts.cls) el.className = Array.isArray(opts.cls) ? opts.cls.join(" ") : opts.cls;
		if (opts.text) el.textContent = opts.text;
		this.appendChild(el);
		return el;
	};
}
if (!HTMLElement.prototype.createEl) {
	HTMLElement.prototype.createEl = function (tag, opts = {}) {
		const el = document.createElement(tag);
		if (opts.cls) el.className = Array.isArray(opts.cls) ? opts.cls.join(" ") : opts.cls;
		if (opts.text) el.textContent = opts.text;
		this.appendChild(el);
		return el;
	};
}
if (typeof window.createEl === "undefined") {
	window.createEl = (tag, opts = {}) => document.body.createEl(tag, opts);
}
if (!HTMLElement.prototype.setCssProps) {
	HTMLElement.prototype.setCssProps = function (props) {
		for (const [key, val] of Object.entries(props)) {
			this.style.setProperty(key, val);
		}
	};
}

import { EnchartixGraph } from "../src/core/EnchartixGraph.ts";


const generate180DaysEvolution = () => {
	const entries = [{ values: [], date: "Start" }];
	const startDate = new Date(2026, 0, 1);

	for (let day = 1; day <= 180; day++) {
		const curDate = new Date(startDate);
		curDate.setDate(startDate.getDate() + day - 1);
		const dStr = curDate.toISOString().slice(0, 10).replace(/-/g, ".");

		let minV, maxV, phaseName;
		if (day <= 60) {
			const t = day / 60;
			minV = -10 + t * 5;
			maxV = 20 + t * 10;
			phaseName = "Phase 1: Seed & Volatility (-10..20)";
		} else if (day <= 120) {
			const t = (day - 60) / 60;
			minV = 5 + t * 10;
			maxV = 45 + t * 35;
			phaseName = "Phase 2: Traction & Growth (5..80)";
		} else {
			const t = (day - 120) / 60;
			minV = 20 + t * 15;
			maxV = 85 + t * 55;
			phaseName = "Phase 3: Scale-Up & Expansion (20..140)";
		}

		const wave = Math.sin(day * 0.18) * 0.5 + 0.5;
		const pulse = Math.cos(day * 0.45) * 0.3 + 0.5;

		const v1 = Math.round(minV + (maxV - minV) * (0.25 + 0.5 * wave));
		const v2 = Math.round(minV + (maxV - minV) * (0.4 + 0.55 * pulse));
		const v3 = Math.round(
			minV + (maxV - minV) * (0.15 + 0.75 * (Math.sin(day * 0.31 + 1) * 0.5 + 0.5)),
		);

		entries.push({
			values: [v1, v2, v3],
			date: `${dStr} (Day ${day})`,
			note: `${phaseName} — Smoothly recorded intraday checkpoints for Day ${day}.`,
			file: `Journal/${dStr}.md`,
		});
	}
	return entries;
};

const mockDarkData = [
	{
		name: "Net Cashflow ($ USD — Pos & Neg)",
		entries: [
			{ values: [], date: "Start" },
			{
				values: [320, 180, -90, 450],
				date: "2026.02.01",
				note: "Initial stripe payout + server infrastructure deduction.",
				file: "Finance/2026-02-01.md",
			},
			{
				values: [500, -240, 820],
				date: "2026.02.05",
				note: "Annual enterprise license closed after demo call.",
				file: "Finance/2026-02-05.md",
			},
			{
				values: [10, 20, 5, 141],
				date: "2026.02.09",
				note: "ProductHunt launch day! Organic traffic spiked in the evening.",
				file: "Finance/2026-02-09.md",
			},
			{
				values: [600, -350, 1200, 400],
				date: "2026.02.14",
				note: "Cloud GPU scaling cost offset by new B2B subscriptions.",
				file: "Finance/2026-02-14.md",
			},
			{
				values: [450, 1200, -320, 1937],
				date: "2026.02.19",
				note: "All-time high daily settlement (1937 peak -> 2000 grid ceiling).",
				file: "Finance/2026-02-19.md",
			},
			{
				values: [800, 650, -150, 920],
				date: "2026.02.24",
				note: "Steady recurring revenue retention.",
				file: "Finance/2026-02-24.md",
			},
		],
	},
	{
		name: "180-Day Evolution (Dock Stress Test)",
		entries: generate180DaysEvolution(),
	},
];

const mockLightData = [
	{
		name: "Deep Work & Architecture (Minutes)",
		entries: [
			{ values: [], date: "Start" },
			{ values: [45, 60, 30], date: "2026.02.01 Mon", note: "Designed shader pipeline." },
			{ values: [90, 45, 60], date: "2026.02.04 Thu", note: "Implemented OKLCH color harmony." },
			{ values: [60, 90, 120, 45], date: "2026.02.08 Sun", note: "Built Hermite spline morphing." },
			{ values: [120, 90, 60, 90], date: "2026.02.14 Sat", note: "Optimized WebGL2 MSAA target." },
			{ values: [90, 110, 75], date: "2026.02.20 Fri", note: "Prepared Obsidian release." },
		],
	},
	{
		name: "Knowledge Base Notes Linked",
		entries: [
			{ values: [], date: "Start" },
			{ values: [12, 18], date: "2026.02.02 Tue" },
			{ values: [25, 15, 30], date: "2026.02.06 Sat" },
			{ values: [10, 20, 5, 65], date: "2026.02.12 Fri" },
			{ values: [40, 35, 50], date: "2026.02.19 Thu" },
		],
	},
];

const graphLabels = {
	viewToggle2D: "2D Top-Down Micro View",
	viewToggle3D: "3D Macro Perspective",
	tooltipNoteTotal: "Day Net",
	tooltipEntries: "Sequence:",
	tooltipCumulative: "Cumulative Total",
	tooltipGridScale: "Grid Scale:",
};


const darkContainer = document.getElementById("graph-container");
let fitGraph;

if (darkContainer) {
	fitGraph = new EnchartixGraph(darkContainer, mockDarkData, {
		themeColor: "#7d33ff",
		isDark: true,
		labels: graphLabels,
	});

	document.getElementById("fit-color")?.addEventListener("input", (e) => {
		fitGraph.updateThemeColor(e.target.value);
	});
}


const lightGate = document.getElementById("light-graph-gate");
const revealLightBtn = document.getElementById("reveal-light-btn");
const engContainer = document.getElementById("eng-graph-container");
let engGraph;

revealLightBtn?.addEventListener("click", () => {
	lightGate?.classList.add("hidden");
	engContainer?.classList.remove("hidden");

	if (engContainer && !engGraph) {
		engGraph = new EnchartixGraph(engContainer, mockLightData, {
			themeColor: "#00b894",
			isDark: false,
			labels: graphLabels,
		});

		document.getElementById("eng-color")?.addEventListener("input", (e) => {
			engGraph.updateThemeColor(e.target.value);
		});
	}
});

document.addEventListener("keydown", (e) => {
	if (e.key.toLowerCase() === "s" && e.target.tagName !== "INPUT") {
		if (fitGraph) {
			fitGraph.downloadScreenshot("enchartix-dark-3d.png");
		}
		if (engGraph) {
			setTimeout(() => {
				engGraph.downloadScreenshot("enchartix-light-3d.png");
			}, 300);
		}
	}
});