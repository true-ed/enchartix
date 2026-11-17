import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import {
	DataElementUserData,
	DataMesh,
	DayScaleInfo,
	EnchartixLabels,
	EnchartixOptions,
	EnchartixSeriesInput,
	ExerciseStats,
	HitboxMesh,
	HitboxUserData,
	ParsedSeries,
	TransitionState,
} from "../types";
import { generateAccentPalette, generateThemeColors } from "../utils/colorHarmony";
import {
	HORIZONTAL_GRID_FRAGMENT_SHADER,
	HORIZONTAL_GRID_VERTEX_SHADER,
	VERTICAL_GRID_FRAGMENT_SHADER,
	VERTICAL_GRID_VERTEX_SHADER,
} from "../shaders/gridShaders";

const defaultLabels: EnchartixLabels = {
	viewToggle2D: "2D Flat View",
	viewToggle3D: "3D Perspective",
	tooltipNoteTotal: "Entry Total",
	tooltipDailyTotal: "Entry Total",
	tooltipEntries: "Values:",
	tooltipCumulative: "Cumulative:",
	tooltipGridScale: "Grid Scale:",
};

interface HorizontalGridUniforms {
	[uniform: string]: THREE.IUniform;
	color: THREE.IUniform<THREE.Color>;
	focusPoint: THREE.IUniform<THREE.Vector2>;
	fadeRadius: THREE.IUniform<number>;
	opacityMulti: THREE.IUniform<number>;
}

interface VerticalGridUniforms {
	[uniform: string]: THREE.IUniform;
	fillProgress: THREE.IUniform<number>;
	targetFill: THREE.IUniform<number>;
	gridScaleX: THREE.IUniform<number>;
	cellsPos: THREE.IUniform<number>;
	cellsNeg: THREE.IUniform<number>;
	zeroLineV: THREE.IUniform<number>;
	topPadV: THREE.IUniform<number>;
	bottomPadV: THREE.IUniform<number>;
	accentColor: THREE.IUniform<THREE.Color>;
}

function computeNiceAxis(maxAbsValue: number, targetMaxCells: number): {
	step: number;
	cells: number;
	ceil: number;
} {
	if (maxAbsValue <= 0) {
		return { step: 1, cells: targetMaxCells, ceil: targetMaxCells };
	}
	const rawStep = maxAbsValue / targetMaxCells;
	const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
	const residual = rawStep / mag;

	let niceFactor = 1;
	if (residual > 5) niceFactor = 10;
	else if (residual > 2.5) niceFactor = 5;
	else if (residual > 2) niceFactor = 2.5;
	else if (residual > 1) niceFactor = 2;
	else niceFactor = 1;

	const step = niceFactor * mag;
	const cells = Math.max(1, Math.ceil(maxAbsValue / step));
	return { step, cells, ceil: cells * step };
}

/**
 * Computes independent Nice Scales for positive and negative values in a day
 * so both sides always fit their respective zones cleanly while keeping 0 strictly between the two anchor nodes.
 */
function computeNiceDayScale(values: number[]): DayScaleInfo {
	if (values.length === 0) {
		return {
			step: 1,
			maxCeil: 10,
			minFloor: 0,
			totalSpan: 10,
			cellsPos: 10,
			cellsNeg: 0,
			totalCells: 10,
			zeroRatio: 0,
		};
	}

	const maxVal = Math.max(0, ...values);
	const minVal = Math.min(0, ...values);

	const posAxis = computeNiceAxis(maxVal, 15);
	const negAxis = minVal < 0 ? computeNiceAxis(Math.abs(minVal), 8) : { step: posAxis.step, cells: 0, ceil: 0 };

	const cellsPos = maxVal > 0 ? posAxis.cells : 10;
	const maxCeil = maxVal > 0 ? posAxis.ceil : 10;
	const cellsNeg = minVal < 0 ? negAxis.cells : 0;
	const minFloor = -negAxis.ceil;
	const totalCells = Math.max(1, cellsPos + cellsNeg);

	return {
		step: posAxis.step,
		maxCeil,
		minFloor,
		totalSpan: maxCeil + Math.abs(minFloor),
		cellsPos,
		cellsNeg,
		totalCells,
		zeroRatio: cellsNeg / totalCells,
	};
}

function hermite(p0: number, p1: number, m0: number, m1: number, t: number): number {
	const t2 = t * t;
	const t3 = t2 * t;
	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;
	return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
}

export class EnchartixGraph {
	private container: HTMLElement;
	private data: EnchartixSeriesInput[];
	private themeColor: string;
	private labels: EnchartixLabels;
	private currentIsDark: boolean;

	private hitboxes: HitboxMesh[] = [];
	private parsedSeries: ParsedSeries[] = [];
	private pointSpritesBySeries: (THREE.Sprite | null)[][] = [];
	private is2DMode = false;
    private isTooltipPinned = true;
    private pinTooltipBtn!: HTMLButtonElement;
	private hoveredSegment: HitboxMesh | null = null;
	private isTopDownView = false;
	private isVisible = true;
	private inactivityTimer: number | null = null;
	private animationFrameID: number | null = null;

	private readonly BOX_HEIGHT = 120;
	private readonly MIN_EXPANDED_DAY_WIDTH = 64;
	private readonly INACTIVITY_DELAY_MS = 60000; // 1 full minute of zero interaction
	private currentBoxWidth = 260;
	private currentBoxDepth: number;

	// macOS Dock Magnification weights + Smooth-to-Sharp Focus Morph per series & day
	private hoveredDayBySeries: Map<number, number> = new Map();
	private dayWeightsBySeries: number[][] = [];
	private dayFocusMorphBySeries: number[][] = [];
	private dirtySeries: Set<number> = new Set();
	private isDockAnimating = false;
	private sharedSphereGeo = new THREE.SphereGeometry(1, 12, 12);

	private transition: TransitionState;

	// DOM Elements
	private chartWrapper!: HTMLDivElement;
	private uiOverlay!: HTMLDivElement;
	private toggleBtn!: HTMLButtonElement;
	private tooltip!: HTMLDivElement;
	private ttTitle!: HTMLDivElement;
	private ttDataContainer!: HTMLDivElement;

	// Three.js Core
	private clientW = 100;
	private clientH = 100;
	private viewSize = 100;
	private maxDim = 50;
	private scene!: THREE.Scene;
	private graphGroup!: THREE.Group;
	private renderer!: THREE.WebGLRenderer;
	private camera!: THREE.OrthographicCamera;
	private controls!: OrbitControls;
	private bloomPass!: UnrealBloomPass;
	private composer!: EffectComposer;
	private graphCenter = new THREE.Vector3();
	private pos3D = new THREE.Vector3();
	private pos2D = new THREE.Vector3();

	private gridMaterial!: THREE.ShaderMaterial;
	private gridUniforms!: HorizontalGridUniforms;
	private vGridMat!: THREE.ShaderMaterial;
	private vGridUniforms!: VerticalGridUniforms;
	private verticalGrid!: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

	private raycaster = new THREE.Raycaster();
	private mouse = new THREE.Vector2();

	// Observers
	private intersectionObserver?: IntersectionObserver;
	private resizeObserver?: ResizeObserver;
	private themeObserver?: MutationObserver;

	constructor(
		container: HTMLElement,
		data: EnchartixSeriesInput[],
		options: EnchartixOptions = {},
	) {
		this.container = container;
		this.data = data;
		this.themeColor = options.themeColor ?? "#7d33ff";
        this.isTooltipPinned = (options.tooltipMode ?? "pinned") === "pinned";

		const mergedLabels: EnchartixLabels = {
			...defaultLabels,
			...(options.labels ?? {}),
		};
		if (options.labels?.tooltipDailyTotal && !options.labels?.tooltipNoteTotal) {
			mergedLabels.tooltipNoteTotal = options.labels.tooltipDailyTotal;
		}
		this.labels = mergedLabels;

		const doc = activeDocument;
		this.currentIsDark =
			options.isDark !== undefined
				? options.isDark
				: doc.body.classList.contains("theme-dark") ||
					doc.documentElement.classList.contains("theme-dark");

		this.currentBoxDepth = Math.max(1, this.data.length) * 125;

		this.transition = {
			active: false,
			startTime: 0,
			duration: 900,
			startPos: new THREE.Vector3(),
			endPos: new THREE.Vector3(),
			startTarget: new THREE.Vector3(),
			endTarget: new THREE.Vector3(),
			startQuat: new THREE.Quaternion(),
			endQuat: new THREE.Quaternion(),
			startWidth: this.currentBoxWidth,
			endWidth: this.currentBoxWidth,
			startDepth: this.currentBoxDepth,
			endDepth: this.currentBoxDepth,
		};

		this.animate = this.animate.bind(this);

		this.initDOM();
		this.initThreeJS();
		this.setupObservers();
	}

	private initDOM(): void {
		this.chartWrapper = this.container.createDiv({ cls: "enchartix-wrapper" });
		this.uiOverlay = this.chartWrapper.createDiv({ cls: "enchartix-ui-overlay" });

		this.toggleBtn = this.uiOverlay.createEl("button", {
			cls: "enchartix-toggle-btn",
			text: this.labels.viewToggle2D,
		});
		this.toggleBtn.addEventListener("click", () => this.toggleViewMode());

        this.pinTooltipBtn = this.uiOverlay.createEl("button", {
			cls: "enchartix-toggle-btn",
			text: this.isTooltipPinned
				? (this.labels.tooltipModePinned ?? "📌 Info: Pinned Top")
				: (this.labels.tooltipModeFloating ?? "💬 Info: Floating"),
		});
		this.pinTooltipBtn.addEventListener("click", () => {
			this.isTooltipPinned = !this.isTooltipPinned;
			this.pinTooltipBtn.textContent = this.isTooltipPinned
				? (this.labels.tooltipModePinned ?? "📌 Info: Pinned Top")
				: (this.labels.tooltipModeFloating ?? "💬 Info: Floating");
			this.tooltip.classList.toggle("is-pinned", this.isTooltipPinned);
			if (this.isTooltipPinned) {
				this.tooltip.setCssProps({ top: "16px", right: "16px", left: "auto" });
			}
		});

		this.tooltip = this.chartWrapper.createDiv({ cls: "enchartix-tooltip" });

        this.tooltip.classList.toggle("is-pinned", this.isTooltipPinned);

		this.ttTitle = this.tooltip.createDiv({ cls: "enchartix-tooltip-title" });
		this.ttTitle.id = "tt-title";
		this.ttTitle.setCssProps({
			color: this.themeColor,
			"border-bottom-color": `${this.themeColor}44`,
		});

		this.ttDataContainer = this.tooltip.createDiv({ cls: "enchartix-tooltip-data" });
		this.ttDataContainer.id = "tt-data";

		this.updateDOMTheme(this.currentIsDark);
	}

	private updateDOMTheme(isDark: boolean): void {
		const { bgStr } = generateThemeColors(this.themeColor, isDark);
		const shadowAlpha = isDark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.15)";

		this.chartWrapper.setCssProps({
			"background-color": bgStr,
			"box-shadow": `inset 0 10px 30px ${shadowAlpha}, inset 0 0 20px ${this.themeColor}33`,
		});

		this.toggleBtn.setCssProps({
			background: isDark ? `${this.themeColor}22` : `${this.themeColor}15`,
			border: `1px solid ${this.themeColor}`,
			color: isDark ? this.themeColor : "#222",
		});

        this.pinTooltipBtn.setCssProps({
			background: isDark ? `${this.themeColor}22` : `${this.themeColor}15`,
			border: `1px solid ${this.themeColor}`,
			color: isDark ? this.themeColor : "#222",
		});

		this.tooltip.setCssProps({
			background: isDark ? "rgba(10, 10, 20, 0.88)" : "rgba(255, 255, 255, 0.92)",
			color: isDark ? "#fff" : "#222",
			"box-shadow": isDark
				? "0 4px 15px rgba(0, 0, 0, 0.5)"
				: "0 4px 15px rgba(0, 0, 0, 0.1)",
		});
	}

	private initThreeJS(): void {
		this.clientW = Math.max(this.chartWrapper.clientWidth, 100);
		this.clientH = Math.max(this.chartWrapper.clientHeight, 100);

		this.scene = new THREE.Scene();
		this.graphGroup = new THREE.Group();
		this.scene.add(this.graphGroup);

		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			powerPreference: "high-performance",
		});
		this.renderer.setPixelRatio(Math.min(activeWindow.devicePixelRatio || 1, 2));
		this.renderer.setSize(this.clientW, this.clientH);
		this.chartWrapper.appendChild(this.renderer.domElement);

		this.buildDataStructure();

		const graphBox = new THREE.Box3().setFromObject(this.graphGroup);
		this.graphCenter = graphBox.getCenter(new THREE.Vector3());
		const graphSize = graphBox.getSize(new THREE.Vector3());
		this.maxDim = Math.max(graphSize.x, graphSize.y, graphSize.z, 50);

		this.buildGrids();

		this.viewSize = this.maxDim * 1.25;
		const aspect = this.clientW / this.clientH;

		this.camera = new THREE.OrthographicCamera(
			(this.viewSize * aspect) / -2,
			(this.viewSize * aspect) / 2,
			this.viewSize / 2,
			this.viewSize / -2,
			-this.maxDim * 4,
			this.maxDim * 4,
		);

		this.pos3D = new THREE.Vector3(
			this.graphCenter.x - this.maxDim * 0.48,
			this.graphCenter.y + this.maxDim * 0.42,
			this.graphCenter.z + this.maxDim * 0.82,
		);
		this.pos2D = new THREE.Vector3(
			this.graphCenter.x,
			this.graphCenter.y + this.maxDim * 1.2,
			this.graphCenter.z + 0.01,
		);

		this.camera.position.copy(this.pos3D);
		this.camera.zoom = 1.0;
		this.camera.updateProjectionMatrix();

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.05;
		this.controls.target.copy(this.graphCenter);
		this.controls.minZoom = 0.3;
		this.controls.maxZoom = 5.0;
		this.controls.mouseButtons = {
			LEFT: THREE.MOUSE.ROTATE,
			MIDDLE: THREE.MOUSE.DOLLY,
			RIGHT: THREE.MOUSE.PAN,
		};
		this.controls.touches = {
			ONE: THREE.TOUCH.ROTATE,
			TWO: THREE.TOUCH.DOLLY_PAN,
		};

		const renderPass = new RenderPass(this.scene, this.camera);
		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2(this.clientW, this.clientH),
			1.4,
			0.4,
			0.1,
		);
		const renderTarget = new THREE.WebGLRenderTarget(this.clientW, this.clientH, {
			samples: 4,
			type: THREE.HalfFloatType,
		});
		this.composer = new EffectComposer(this.renderer, renderTarget);
		this.composer.addPass(renderPass);
		this.composer.addPass(this.bloomPass);

		this.updateThreeTheme(this.currentIsDark);
		this.setupInteractions();

		this.animate();
	}

	/**
	 * Creates a crisp 3D billboard text sprite anchored at its bottom-right corner (1, 0)
	 * so it always faces the camera while pivoting around the exact graph vertex!
	 */
	private createValueSprite(val: number, accentHex: string): THREE.Sprite {
		const canvas = createEl("canvas");
		canvas.width = 256;
		canvas.height = 96;
		const ctx = canvas.getContext("2d");

		if (ctx) {
			const text = val > 0 ? `+${val}` : String(val);
			ctx.font = "bold 64px system-ui, -apple-system, sans-serif";
			const metrics = ctx.measureText(text);
			const textW = metrics.width;

			const padX = 16;
			const boxW = Math.min(248, textW + padX * 2);
			const boxH = 62;
			const boxX = 248 - boxW;
			const boxY = 86 - boxH;

			// Dark glass pill background for ultra-crisp contrast
			ctx.fillStyle = "rgba(10, 10, 20, 0.82)";
			ctx.strokeStyle = val < 0 ? "#ff6b81" : accentHex;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.roundRect(boxX, boxY, boxW, boxH, 12);
			ctx.fill();
			ctx.stroke();

			ctx.textAlign = "right";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#ffffff";
			ctx.fillText(text, 248 - padX, boxY + boxH / 2 + 2);
		}

		const texture = new THREE.CanvasTexture(canvas);
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;

		const material = new THREE.SpriteMaterial({
			map: texture,
			transparent: true,
			opacity: 0.0,
			depthTest: false,
			depthWrite: false,
		});

		const sprite = new THREE.Sprite(material);
		// Bottom-right corner anchor: pivots right around the 3D vertex!
		sprite.center.set(1.0, 0.0);
		sprite.scale.set(24, 9, 1);
		sprite.renderOrder = 999;
		this.graphGroup.add(sprite);
		return sprite;
	}

	private buildDataStructure(): void {
		const accentPalette = generateAccentPalette(this.themeColor, this.data.length);

		const exerciseStats: ExerciseStats[] = this.data.map((series) => {
			let maxCumulative = 0.0001;
			let minCumulative = 0;
			let currentCumulative = 0;
			let globalMaxPosSet = 0.0001;
			let globalMaxNegSet = 0.0001;
			const maxDays = Math.max(1, series.entries.length - 1);

			series.entries.forEach((d, i) => {
				if (i === 0) return;
				const vals = d.values ?? d.sets ?? [];
				vals.forEach((setVal) => {
					currentCumulative += setVal;
					maxCumulative = Math.max(maxCumulative, currentCumulative);
					minCumulative = Math.min(minCumulative, currentCumulative);
					if (setVal >= 0) {
						globalMaxPosSet = Math.max(globalMaxPosSet, setVal);
					} else {
						globalMaxNegSet = Math.max(globalMaxNegSet, Math.abs(setVal));
					}
				});
			});

			return {
				maxCumulative,
				minCumulative,
				maxDays,
				globalMaxPosSet,
				globalMaxNegSet,
			};
		});

		this.parsedSeries = [];
		this.pointSpritesBySeries = [];
		this.dayWeightsBySeries = [];
		this.dayFocusMorphBySeries = [];

		this.data.forEach((series, exIndex) => {
			const stats = exerciseStats[exIndex];
			const accentStr = accentPalette[exIndex] ?? this.themeColor;
			const accentNum = new THREE.Color(accentStr).getHex();

			const numDays = Math.max(1, series.entries.length - 1);
			this.dayWeightsBySeries.push(new Array(numDays).fill(1.0) as number[]);
			this.dayFocusMorphBySeries.push(new Array(numDays).fill(0.0) as number[]);

			const seriesSprites: (THREE.Sprite | null)[] = [];

			const seriesObj: ParsedSeries = {
				name: series.name,
				colorNum: accentNum,
				colorStr: accentStr,
				stats: stats,
				pointsData: [],
				daysData: [],
				meshes: { spheres: [], tube: null, hitboxes: [] },
			};

			let cumulative = 0;
			let globalPtIdx = 0;

			// Initial origin node (Day 0) on baseline
			seriesObj.pointsData.push({
				dayIndex: 0,
				frac: 0,
				cumulative: 0,
				setVal: 0,
				globalNormZ: 0,
				localNormZ: 0,
				isNode: true,
			});
			seriesObj.meshes.spheres.push(
				this.createPointMesh(accentNum, 1.5, series.name),
			);
			seriesSprites.push(null);
			globalPtIdx++;

			series.entries.forEach((d, dayIndex) => {
				if (dayIndex === 0) return;

				const rawSets = d.values ?? d.sets ?? [];
				const numSets = rawSets.length;
				const scaleInfo = computeNiceDayScale(rawSets);
				const dayPointsIdx: number[] = [globalPtIdx - 1];

				if (numSets > 0) {
					rawSets.forEach((setVal, index) => {
						cumulative += setVal;
						const frac =
							numSets === 1
								? 0.5
								: 0.16 + (index / (numSets - 1)) * 0.68;

						const globalNormZ =
							setVal >= 0
								? setVal / stats.globalMaxPosSet
								: -(Math.abs(setVal) / stats.globalMaxNegSet);

						const localNormZ =
							setVal >= 0
								? scaleInfo.maxCeil > 0
									? setVal / scaleInfo.maxCeil
									: 0
								: scaleInfo.minFloor < 0
									? setVal / Math.abs(scaleInfo.minFloor)
									: 0;

						seriesObj.pointsData.push({
							dayIndex,
							frac,
							cumulative,
							setVal,
							globalNormZ,
							localNormZ,
							isNode: false,
						});
						seriesObj.meshes.spheres.push(
							this.createPointMesh(accentNum, 0.9, series.name),
						);
						seriesSprites.push(null);

						dayPointsIdx.push(globalPtIdx);
						globalPtIdx++;
					});

					// Closing anchor node at the end of the day on the baseline (0)
					seriesObj.pointsData.push({
						dayIndex,
						frac: 1.0,
						cumulative,
						setVal: 0,
						globalNormZ: 0,
						localNormZ: 0,
						isNode: true,
					});
					seriesObj.meshes.spheres.push(
						this.createPointMesh(accentNum, 1.5, series.name),
					);
					seriesSprites.push(null);
					dayPointsIdx.push(globalPtIdx);
					globalPtIdx++;
				}

				if (dayPointsIdx.length > 1) {
					const hitboxMesh: HitboxMesh = new THREE.Mesh(
						new THREE.BoxGeometry(1, 1, 1),
						new THREE.MeshBasicMaterial({
							color: 0xffffff,
							vertexColors: true,
							transparent: true,
							opacity: 0.0,
							depthWrite: false,
							side: THREE.DoubleSide,
							blending: THREE.NormalBlending,
						}),
					);
					const rawNote = (d.note ?? d.notes ?? "").trim();
					const truncatedNote =
						rawNote.length > 256 ? `${rawNote.slice(0, 256)}…` : rawNote;

					const userData: HitboxUserData = {
						exercise: series.name,
						seriesIndex: exIndex,
						dayIndex: dayIndex,
						date: d.date,
						sets: rawSets,
						dayTotal: rawSets.reduce((a, b) => a + b, 0),
						total: cumulative,
						color: accentStr,
						scaleInfo,
						note: truncatedNote || undefined,
						file: d.file,
					};

					hitboxMesh.userData = userData;
					this.graphGroup.add(hitboxMesh);
					this.hitboxes.push(hitboxMesh);

					seriesObj.daysData.push({
						dayIndex,
						mesh: hitboxMesh,
						pointIndices: dayPointsIdx,
						scaleInfo,
					});
				}
			});

			if (seriesObj.pointsData.length > 1) {
				const tube: DataMesh = new THREE.Mesh(
					new THREE.BufferGeometry(),
					new THREE.MeshBasicMaterial({
						vertexColors: true,
						transparent: true,
						opacity: 0.9,
					}),
				);
				const tubeUserData: DataElementUserData = {
					exercise: series.name,
					isDataElement: true,
					baseOpacity: 0.9,
					targetOpacity: 0.9,
				};
				tube.userData = tubeUserData;
				this.graphGroup.add(tube);
				seriesObj.meshes.tube = tube;
			}

			this.parsedSeries.push(seriesObj);
			this.pointSpritesBySeries.push(seriesSprites);
		});

		this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
	}

	private createPointMesh(color: number, size: number, exName: string): DataMesh {
		const material = new THREE.MeshBasicMaterial({
			color: color,
			transparent: true,
			opacity: 1.0,
		});
		const mesh: DataMesh = new THREE.Mesh(this.sharedSphereGeo, material);
		mesh.scale.set(size, size, size);
		const userData: DataElementUserData & { baseRadius?: number } = {
			exercise: exName,
			isDataElement: true,
			baseOpacity: 1.0,
			targetOpacity: 1.0,
			baseRadius: size,
		};
		mesh.userData = userData;
		this.graphGroup.add(mesh);
		return mesh;
	}

	private buildHybridMorphTubeGeometry(
		controlPts: THREE.Vector3[],
		pointDayIndices: number[],
		dayFocusMorphs: number[],
		radius: number,
		colorTopHex: number,
	): THREE.BufferGeometry {
		const n = controlPts.length;
		const mY: number[] = new Array(n).fill(0) as number[];
		const mZ: number[] = new Array(n).fill(0) as number[];

		for (let i = 0; i < n; i++) {
			const prev = controlPts[Math.max(0, i - 1)]!;
			const curr = controlPts[i]!;
			const next = controlPts[Math.min(n - 1, i + 1)]!;

			mY[i] = (next.y - prev.y) * 0.5;

			const isExtremum = (curr.z - prev.z) * (next.z - curr.z) <= 0;
			mZ[i] = isExtremum ? 0 : (next.z - prev.z) * 0.38;
		}

		const sampledPoints: THREE.Vector3[] = [];
		// Adaptive subdivisions: keep total vertex count fast even with 365+ days!
		const baseSubdiv = n > 150 ? 3 : n > 60 ? 5 : 8;

		for (let i = 0; i < n - 1; i++) {
			const p0 = controlPts[i]!;
			const p1 = controlPts[i + 1]!;
			const dayIdx = pointDayIndices[i + 1] ?? 1;
			const sharpMorph = dayFocusMorphs[Math.max(0, dayIdx - 1)] ?? 0.0;

			// If segment is pure straight line (sharpMorph > 0.98) and Y is nearly linear, 2 steps are enough!
			const localSubdiv = sharpMorph > 0.98 ? 2 : baseSubdiv;
			const steps = i === n - 2 ? localSubdiv : localSubdiv - 1;

			for (let s = 0; s <= steps; s++) {
				const t = s / localSubdiv;
				const x = p0.x + (p1.x - p0.x) * t;
				const y = hermite(p0.y, p1.y, mY[i]!, mY[i + 1]!, t);

				const zSmooth = hermite(p0.z, p1.z, mZ[i]!, mZ[i + 1]!, t);
				const zSharp = p0.z + (p1.z - p0.z) * t;
				const z = zSmooth + (zSharp - zSmooth) * sharpMorph;

				sampledPoints.push(new THREE.Vector3(x, y, z));
			}
		}

		const dedupedPoints: THREE.Vector3[] = [];
		for (let i = 0; i < sampledPoints.length; i++) {
			const pt = sampledPoints[i]!;
			const prev = dedupedPoints[dedupedPoints.length - 1];
			if (!prev || prev.distanceToSquared(pt) > 0.0001) {
				dedupedPoints.push(pt);
			}
		}

		const smoothJointCurve = new THREE.CatmullRomCurve3(
			dedupedPoints,
			false,
			"centripetal",
			0.02,
		);

		const radialSegs = n > 150 ? 8 : 10;
		const tubeGeo = new THREE.TubeGeometry(
			smoothJointCurve,
			Math.max(dedupedPoints.length, 64),
			radius,
			radialSegs,
			false,
		);

		const posAttribute = tubeGeo.attributes.position;
		const count = posAttribute.count;
		const colorsArr = new Float32Array(count * 3);
		const bgColor =
			this.scene && this.scene.background instanceof THREE.Color
				? this.scene.background
				: new THREE.Color(0x000000);
		const colorBottom = bgColor.clone();
		const colorTop = new THREE.Color(colorTopHex);

		for (let i = 0; i < count; i++) {
			const y = posAttribute.getY(i);
			const factor = Math.max(
				0.15,
				Math.min(1, (y + this.BOX_HEIGHT / 2) / this.BOX_HEIGHT),
			);
			const c = colorBottom.clone().lerp(colorTop, factor);
			colorsArr[i * 3] = c.r;
			colorsArr[i * 3 + 1] = c.g;
			colorsArr[i * 3 + 2] = c.b;
		}
		tubeGeo.setAttribute("color", new THREE.BufferAttribute(colorsArr, 3));
		return tubeGeo;
	}

	private applyLayout(
		boxWidth: number,
		boxDepth: number,
		rebuildHitboxes = false,
		onlyDirty = false,
	): void {
		const seriesCount = Math.max(1, this.parsedSeries.length);
		const LANE_DEPTH = boxDepth / seriesCount;
		const USABLE_LANE_DEPTH = LANE_DEPTH * 0.78;
		const Z_PAD = 6.0;

		this.parsedSeries.forEach((series, exIndex) => {
			if (onlyDirty && !this.dirtySeries.has(exIndex)) return;

			const stats = series.stats;
			const laneCenterZ = -boxDepth / 2 + (exIndex + 0.5) * LANE_DEPTH;
			const baseZ = laneCenterZ + USABLE_LANE_DEPTH * 0.34;
			const maxPositiveReach = USABLE_LANE_DEPTH * 0.72;
			const maxNegativeReach = USABLE_LANE_DEPTH * 0.38;

			const weights = this.dayWeightsBySeries[exIndex] ?? [1];
			const focusMorphs = this.dayFocusMorphBySeries[exIndex] ?? [0];
			const sprites = this.pointSpritesBySeries[exIndex] ?? [];
			const hoveredDay = this.hoveredDayBySeries.get(exIndex) ?? -1;

			// Pinned-Center Dock Layout: keep the hovered day's center anchored right under the cursor!
			const nDays = weights.length;
			const dayStartX: number[] = new Array(nDays + 1).fill(-boxWidth / 2) as number[];

			if (hoveredDay > 0 && nDays > 1) {
				const hIdx = hoveredDay - 1;
				// Natural unexpanded center of the hovered day stays pinned under the mouse
				const naturalCenterRatio = (hIdx + 0.5) / nDays;
				const totalW = weights.reduce((acc, w) => acc + w, 0) || 1;
				const hoveredWidthRatio = Math.min(0.38, (weights[hIdx] ?? 1) / totalW);

				// Clamp so the expanded box never overflows the left or right chart border
				const halfW = hoveredWidthRatio * 0.5;
				const pinnedCenter = Math.max(halfW, Math.min(1 - halfW, naturalCenterRatio));
				const hLeftRatio = pinnedCenter - halfW;
				const hRightRatio = pinnedCenter + halfW;

				// Distribute left neighbors smoothly into [0 .. hLeftRatio]
				let leftWeightSum = 0;
				for (let d = 0; d < hIdx; d++) leftWeightSum += weights[d] ?? 1;
				let accumLeft = 0;
				for (let d = 0; d < hIdx; d++) {
					dayStartX[d] = -boxWidth / 2 + (accumLeft / (leftWeightSum || 1)) * hLeftRatio * boxWidth;
					accumLeft += weights[d] ?? 1;
				}

				// Hovered day exact bounds
				dayStartX[hIdx] = -boxWidth / 2 + hLeftRatio * boxWidth;
				dayStartX[hIdx + 1] = -boxWidth / 2 + hRightRatio * boxWidth;

				// Distribute right neighbors smoothly into [hRightRatio .. 1]
				let rightWeightSum = 0;
				for (let d = hIdx + 1; d < nDays; d++) rightWeightSum += weights[d] ?? 1;
				let accumRight = 0;
				const rightSpanRatio = 1.0 - hRightRatio;
				for (let d = hIdx + 1; d < nDays; d++) {
					accumRight += weights[d] ?? 1;
					dayStartX[d + 1] =
						-boxWidth / 2 +
						(hRightRatio + (accumRight / (rightWeightSum || 1)) * rightSpanRatio) * boxWidth;
				}
			} else {
				const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;
				let accumW = 0;
				for (let d = 0; d < nDays; d++) {
					accumW += weights[d] ?? 1;
					dayStartX[d + 1] = -boxWidth / 2 + (accumW / totalWeight) * boxWidth;
				}
			}

			const mapX = (dayIndex: number, frac: number): number => {
				if (dayIndex === 0) return -boxWidth / 2;
				const dIdx = Math.min(Math.max(1, dayIndex), weights.length) - 1;
				const x0 = dayStartX[dIdx] ?? -boxWidth / 2;
				const x1 = dayStartX[dIdx + 1] ?? boxWidth / 2;
				return x0 + frac * (x1 - x0);
			};

			const spanY = Math.max(0.0001, stats.maxCumulative - stats.minCumulative);
			const mapY = (val: number): number =>
				-this.BOX_HEIGHT / 2 +
				((val - stats.minCumulative) / spanY) * this.BOX_HEIGHT;

			// Independent positive (-Z) and negative (+Z) mapping from exact baseZ!
			const mapZ = (normZ: number): number => {
				if (normZ >= 0) {
					return baseZ - normZ * maxPositiveReach;
				}
				return baseZ - normZ * maxNegativeReach;
			};

			const curvePoints: THREE.Vector3[] = [];
			const pointDayIndices: number[] = [];

			const baseNodeScale =
				stats.maxDays > 30 ? Math.max(0.45, 25 / stats.maxDays) : 1.0;

			series.pointsData.forEach((pt, i) => {
				const x = mapX(pt.dayIndex, pt.frac);
				const y = mapY(pt.cumulative);

				const morph =
					pt.dayIndex > 0 ? (focusMorphs[pt.dayIndex - 1] ?? 0.0) : 0.0;
				const effectiveNormZ =
					pt.globalNormZ + (pt.localNormZ - pt.globalNormZ) * morph;

				const z = pt.isNode ? baseZ : mapZ(effectiveNormZ);
				const pos = new THREE.Vector3(x, y, z);
				curvePoints.push(pos);
				pointDayIndices.push(pt.dayIndex);

				const sphere = series.meshes.spheres[i];
				if (sphere) {
					sphere.position.copy(pos);
					const baseR =
						(sphere.userData as { baseRadius?: number }).baseRadius ??
						(pt.isNode ? 1.5 : 0.9);
					const isHoveredDay = pt.dayIndex === hoveredDay;
					const subScale = pt.isNode
						? (isHoveredDay ? 1.15 : baseNodeScale) * baseR
						: baseNodeScale * (0.65 + 0.55 * morph) * baseR;
					sphere.scale.set(subScale, subScale, subScale);
				}

				// Lazy-create 3D value sprite ONLY when a day is actually focused!
				if (!pt.isNode && morph > 0.02) {
					let sprite = sprites[i];
					if (!sprite) {
						sprite = this.createValueSprite(pt.setVal, series.colorStr);
						sprites[i] = sprite;
					}
					sprite.position.set(pos.x, pos.y + 0.8, pos.z);
					sprite.material.opacity = Math.pow(morph, 1.5);
					sprite.visible = true;

                    const zoomScale =
						(this.viewSize / 320) /
						(this.camera ? Math.max(0.35, this.camera.zoom) : 1.0);
					sprite.scale.set(26 * zoomScale, 9.75 * zoomScale, 1);
					sprite.position.set(pos.x, pos.y + 1.2 * zoomScale, pos.z);
				} else {
					const sprite = sprites[i];
					if (sprite && sprite.visible) {
						sprite.visible = false;
					}
				}
			});

			if (series.meshes.tube && curvePoints.length > 1) {
				const zoomFactor = this.camera ? Math.sqrt(Math.max(0.3, this.camera.zoom)) : 1.0;
				const dynamicRadius = 0.55 / zoomFactor;
				const tubeGeo = this.buildHybridMorphTubeGeometry(
					curvePoints,
					pointDayIndices,
					focusMorphs,
					dynamicRadius,
					series.colorNum,
				);
				series.meshes.tube.geometry.dispose();
				series.meshes.tube.geometry = tubeGeo;
			}

			series.daysData.forEach((dayData) => {
				const dIdx = dayData.dayIndex - 1;
				const x0 = dayStartX[dIdx] ?? -boxWidth / 2;
				const x1 = dayStartX[dIdx + 1] ?? boxWidth / 2;
				const daySpanX = Math.max(2, x1 - x0);

				const boxPoints = dayData.pointIndices
					.map((idx) => curvePoints[idx])
					.filter((pt): pt is THREE.Vector3 => pt !== undefined);
				const box3 = new THREE.Box3().setFromPoints(boxPoints);
				const size = box3.getSize(new THREE.Vector3());
				const center = box3.getCenter(new THREE.Vector3());

				const hasNeg = dayData.scaleInfo.cellsNeg > 0;
				const zCeilWorld = baseZ - maxPositiveReach;
				const zFloorWorld = hasNeg ? baseZ + maxNegativeReach : baseZ;

				const zTopEdge = zCeilWorld - Z_PAD;
				const zBottomEdge = zFloorWorld + Z_PAD;

				const exactDepthZ = zBottomEdge - zTopEdge;
				const exactCenterZ = (zTopEdge + zBottomEdge) / 2;

				const widthX = Math.max(daySpanX, 4);
				const heightY = Math.max(size.y, 12) + 16;

				center.x = (x0 + x1) / 2;
				center.z = exactCenterZ;

				// Exact UV coordinates so the 0-line in the shader passes strictly through baseZ (between the 2 anchor nodes!)
				const exactZeroV = (zBottomEdge - baseZ) / exactDepthZ;
				const exactTopPadV = Z_PAD / exactDepthZ;
				const exactBottomPadV = Z_PAD / exactDepthZ;

				const hbData = dayData.mesh.userData as HitboxUserData & {
					exactZeroV?: number;
					exactTopPadV?: number;
					exactBottomPadV?: number;
				};
				hbData.exactZeroV = exactZeroV;
				hbData.exactTopPadV = exactTopPadV;
				hbData.exactBottomPadV = exactBottomPadV;

				if (rebuildHitboxes) {
					const segmentGeometry = new RoundedBoxGeometry(
						widthX,
						heightY,
						exactDepthZ,
						4,
						6,
					);

					const darkerColor = new THREE.Color(series.colorNum).multiplyScalar(0.15);
					const posAttr = segmentGeometry.attributes.position;
					const colorData = new Float32Array(posAttr.count * 4);

					for (let j = 0; j < posAttr.count; j++) {
						let alpha = 0;
						if (this.isTopDownView) {
							const localY = posAttr.getY(j);
							const normalizedY = (1 - localY + heightY / 2) / heightY;
							alpha = Math.pow(normalizedY, 5);
						} else {
							const localZ = posAttr.getZ(j);
							const normalizedZ = (1 - localZ + exactDepthZ / 2) / exactDepthZ;
							alpha = Math.pow(normalizedZ, 5);
						}
						colorData[j * 4] = darkerColor.r;
						colorData[j * 4 + 1] = darkerColor.g;
						colorData[j * 4 + 2] = darkerColor.b;
						colorData[j * 4 + 3] = alpha;
					}
					segmentGeometry.setAttribute(
						"color",
						new THREE.BufferAttribute(colorData, 4),
					);

					dayData.mesh.geometry.dispose();
					dayData.mesh.geometry = segmentGeometry;
					dayData.mesh.scale.set(1, 1, 1);
					dayData.mesh.position.copy(center);

					hbData.boxSize = { x: widthX, y: heightY, z: exactDepthZ };
				} else {
					const origSize = hbData.boxSize;
					if (origSize && origSize.x > 0) {
						dayData.mesh.scale.set(widthX / origSize.x, 1, 1);
					}
					dayData.mesh.position.copy(center);
				}
			});
		});

		if (this.hoveredSegment) {
			this.updateGridOrientation();
		}
	}

	private buildGrids(): void {
		const gridGeometry = new THREE.PlaneGeometry(this.maxDim * 5, this.maxDim * 5);
		gridGeometry.rotateX(-Math.PI / 2);

		this.gridUniforms = {
			color: { value: new THREE.Color() },
			focusPoint: {
				value: new THREE.Vector2(this.graphCenter.x, this.graphCenter.z),
			},
			fadeRadius: { value: this.maxDim * 1.15 },
			opacityMulti: { value: 0.6 },
		};

		this.gridMaterial = new THREE.ShaderMaterial({
			uniforms: this.gridUniforms,
			vertexShader: HORIZONTAL_GRID_VERTEX_SHADER,
			fragmentShader: HORIZONTAL_GRID_FRAGMENT_SHADER,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
		});

		const customGrid = new THREE.Mesh(gridGeometry, this.gridMaterial);
		customGrid.position.y = -this.BOX_HEIGHT / 2 - 0.5;
		this.graphGroup.add(customGrid);

		const vGridGeo = new THREE.PlaneGeometry(1, 1);
		this.vGridUniforms = {
			fillProgress: { value: 0.0 },
			targetFill: { value: 0.0 },
			gridScaleX: { value: 5.0 },
			cellsPos: { value: 10.0 },
			cellsNeg: { value: 0.0 },
			zeroLineV: { value: 0.08 },
			topPadV: { value: 0.05 },
			bottomPadV: { value: 0.05 },
			accentColor: { value: new THREE.Color(this.themeColor) },
		};

		this.vGridMat = new THREE.ShaderMaterial({
			uniforms: this.vGridUniforms,
			vertexShader: VERTICAL_GRID_VERTEX_SHADER,
			fragmentShader: VERTICAL_GRID_FRAGMENT_SHADER,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.AdditiveBlending,
		});

		this.verticalGrid = new THREE.Mesh(vGridGeo, this.vGridMat);
		this.verticalGrid.visible = false;
		this.graphGroup.add(this.verticalGrid);
	}

	private updateThreeTheme(isDark: boolean): void {
		const { bgStr, secStr } = generateThemeColors(this.themeColor, isDark);
		const bgNum = new THREE.Color(bgStr).getHex();
		this.scene.background = new THREE.Color(bgNum);
		this.scene.fog = new THREE.FogExp2(bgNum, isDark ? 0.0018 : 0.001);

		if (this.gridUniforms) {
			this.gridUniforms.color.value.set(secStr);
			this.gridUniforms.opacityMulti.value = isDark ? 0.75 : 0.9;
		}

		if (this.bloomPass) {
			this.bloomPass.strength = isDark ? 1.15 : 0.0;
			this.bloomPass.threshold = isDark ? 0 : 0.5;
		}
		this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
	}

	private updateGradientDirection(isTopDown: boolean): void {
		this.hitboxes.forEach((mesh) => {
			const posAttr = mesh.geometry.attributes.position;
			const colorAttr = mesh.geometry.attributes.color;
			if (!posAttr || !colorAttr) return;

			const hbData = mesh.userData as HitboxUserData;
			const size = hbData.boxSize;
			if (!size) return;

			for (let i = 0; i < posAttr.count; i++) {
				let alpha = 0;
				if (isTopDown) {
					const localY = posAttr.getY(i);
					alpha = Math.pow((1 - localY + size.y / 2) / size.y, 5);
				} else {
					const localZ = posAttr.getZ(i);
					alpha = Math.pow((1 - localZ + size.z / 2) / size.z, 5);
				}
				colorAttr.setW(i, alpha);
			}
			colorAttr.needsUpdate = true;
		});
	}

	private updateGridOrientation(): void {
		if (!this.hoveredSegment) return;
		const segBox = new THREE.Box3().setFromObject(this.hoveredSegment);
		const hbData = this.hoveredSegment.userData as HitboxUserData & {
			exactZeroV?: number;
			exactTopPadV?: number;
			exactBottomPadV?: number;
		};
		const segCenter = segBox.getCenter(new THREE.Vector3());
		const segSize = segBox.getSize(new THREE.Vector3());

		const scaleInfo = hbData.scaleInfo;
		this.vGridUniforms.accentColor.value.set(hbData.color);
		this.vGridUniforms.cellsPos.value = scaleInfo.cellsPos;
		this.vGridUniforms.cellsNeg.value = scaleInfo.cellsNeg;
		this.vGridUniforms.zeroLineV.value = hbData.exactZeroV ?? 0.08;
		this.vGridUniforms.topPadV.value = hbData.exactTopPadV ?? 0.05;
		this.vGridUniforms.bottomPadV.value = hbData.exactBottomPadV ?? 0.05;

		const numEntries = Math.max(2, hbData.sets.length + 1);
		this.vGridUniforms.gridScaleX.value = numEntries;

		if (this.isTopDownView) {
			this.verticalGrid.rotation.x = -Math.PI / 2;
			this.verticalGrid.position.set(
				segCenter.x,
				segBox.min.y + 0.2,
				segCenter.z,
			);
			this.verticalGrid.scale.set(segSize.x, segSize.z, 1);
		} else {
			this.verticalGrid.rotation.x = 0;
			this.verticalGrid.position.set(
				segCenter.x,
				segCenter.y,
				segBox.min.z + 0.2,
			);
			this.verticalGrid.scale.set(segSize.x, segSize.y, 1);
		}
	}

	public toggleViewMode(): void {
		this.is2DMode = !this.is2DMode;
		this.toggleBtn.textContent = this.is2DMode
			? this.labels.viewToggle3D
			: this.labels.viewToggle2D;

		if (this.hoveredSegment) {
			this.hoveredSegment.material.opacity = 0.0;
			this.hoveredSegment = null;
			this.hoveredDayBySeries.clear();
			this.isDockAnimating = true;
			this.tooltip.setCssProps({ opacity: "0" });
			this.vGridUniforms.targetFill.value = 0.0;
		}

		this.transition.startPos.copy(this.camera.position);
		this.transition.startTarget.copy(this.controls.target);
		this.transition.startWidth = this.currentBoxWidth;
		this.transition.startDepth = this.currentBoxDepth;
		this.transition.startQuat.copy(this.camera.quaternion);

		if (this.is2DMode) {
			const aspect = this.clientW / this.clientH;
			this.transition.endWidth = this.viewSize * aspect * 0.85;
			this.transition.endDepth = this.viewSize * 0.85;
			this.transition.endPos.copy(this.pos2D);
			this.transition.endTarget.copy(this.graphCenter);
			this.controls.enableRotate = false;
		} else {
			this.transition.endWidth = 260;
			this.transition.endDepth = Math.max(1, this.data.length) * 125;
			this.transition.endPos.copy(this.pos3D);
			this.transition.endTarget.copy(this.graphCenter);
			this.controls.enableRotate = true;
		}

		const tempCam = this.camera.clone();
		tempCam.position.copy(this.transition.endPos);
		tempCam.lookAt(this.transition.endTarget);
		this.transition.endQuat.copy(tempCam.quaternion);

		this.transition.startTime = performance.now();
		this.transition.active = true;
		if (this.inactivityTimer !== null) {
			activeWindow.clearTimeout(this.inactivityTimer);
		}
	}

	private setupInteractions(): void {
		const resetInactivity = (): void => {
			if (this.inactivityTimer !== null) {
				activeWindow.clearTimeout(this.inactivityTimer);
			}
			this.inactivityTimer = activeWindow.setTimeout(() => {
				this.transition.startPos.copy(this.camera.position);
				this.transition.startTarget.copy(this.controls.target);
				this.transition.startQuat.copy(this.camera.quaternion);

				this.transition.startWidth = this.currentBoxWidth;
				this.transition.startDepth = this.currentBoxDepth;

				if (this.is2DMode) {
					const aspect = this.clientW / this.clientH;
					this.transition.endWidth = this.viewSize * aspect * 0.85;
					this.transition.endDepth = this.viewSize * 0.85;
					this.transition.endPos.copy(this.pos2D);
				} else {
					this.transition.endWidth = 260;
					this.transition.endDepth = Math.max(1, this.data.length) * 125;
					this.transition.endPos.copy(this.pos3D);
				}

				this.transition.endTarget.copy(this.graphCenter);

				const tempCam = this.camera.clone();
				tempCam.position.copy(this.transition.endPos);
				tempCam.lookAt(this.transition.endTarget);
				this.transition.endQuat.copy(tempCam.quaternion);

				this.transition.startTime = performance.now();
				this.transition.active = true;
			}, this.INACTIVITY_DELAY_MS);
		};

		const handleInteraction = (clientX: number, clientY: number): void => {
			resetInactivity();
			if (this.transition.active) return;

			const rect = this.chartWrapper.getBoundingClientRect();
			this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
			this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

			this.raycaster.setFromCamera(this.mouse, this.camera);
			const intersects = this.raycaster.intersectObjects<HitboxMesh>(this.hitboxes);

			if (intersects.length > 0 && intersects[0]) {
				const object = intersects[0].object;
				if (this.hoveredSegment !== object) {
					if (this.hoveredSegment) {
						this.hoveredSegment.material.opacity = 0.0;
					}
					this.hoveredSegment = object;
					this.hoveredSegment.material.opacity = this.currentIsDark ? 0.28 : 0.35;

					const data = object.userData as HitboxUserData;

					this.hoveredDayBySeries.clear();
					this.hoveredDayBySeries.set(data.seriesIndex, data.dayIndex);
					this.isDockAnimating = true;

					this.vGridUniforms.targetFill.value = 1.0;
					this.vGridUniforms.fillProgress.value = 0.0;
					this.verticalGrid.visible = true;
					this.updateGridOrientation();

					this.graphGroup.children.forEach((child) => {
						const uData = child.userData as Partial<DataElementUserData>;
						if (uData && uData.isDataElement && uData.baseOpacity !== undefined) {
							uData.targetOpacity =
								uData.exercise === data.exercise ? uData.baseOpacity : 0.15;
						}
					});

					this.ttTitle.textContent = `${data.date} (${data.exercise})`;
					this.ttTitle.setCssProps({
						color: data.color,
						"border-color": data.color,
					});

					this.ttDataContainer.replaceChildren();

					const totalDiv = this.ttDataContainer.createDiv({
						text: `${this.labels.tooltipNoteTotal}: `,
					});
					const signPrefix = data.dayTotal > 0 ? "+" : "";
					totalDiv.createEl("b", { text: `${signPrefix}${data.dayTotal}` });

					this.ttDataContainer.createDiv({
						text: `${this.labels.tooltipEntries} [${data.sets.join(" → ")}]`,
					});

					const scaleDiv = this.ttDataContainer.createDiv({
						text: `${this.labels.tooltipGridScale ?? "Grid Scale:"} `,
					});
					scaleDiv.createEl("b", {
						text: `1 cell = ${data.scaleInfo.step} (max ${data.scaleInfo.maxCeil})`,
					});

					const cumulativeDiv = this.ttDataContainer.createDiv({
						text: `${this.labels.tooltipCumulative}: `,
					});
					cumulativeDiv.createEl("b", { text: String(data.total) });

                    if (data.note) {
						this.ttDataContainer.createDiv({
							cls: "enchartix-tooltip-note",
							text: `📝 "${data.note}"`,
						});
					}

					if (data.file) {
						const hint = this.ttDataContainer.createDiv({
							cls: "enchartix-tooltip-link-hint",
							text: `🔗 Click to open: ${data.file}`,
						});
						hint.setCssProps({ color: data.color });
					}
					this.chartWrapper.setCssProps({
						cursor: data.file ? "pointer" : "default",
					});
				}

				const tw = this.tooltip.offsetWidth;
				const th = this.tooltip.offsetHeight;

				let tLeft = clientX - rect.left + 15;
				let tTop = clientY - rect.top + 15;

				if (tLeft + tw > rect.width) tLeft = clientX - rect.left - tw - 15;
				if (tTop + th > rect.height) tTop = clientY - rect.top - th - 15;

				if (this.isTooltipPinned) {
					this.tooltip.setCssProps({
						opacity: "1",
						top: "16px",
						right: "16px",
						left: "auto",
					});
				} else {
					const tw = this.tooltip.offsetWidth;
					const th = this.tooltip.offsetHeight;

					let tLeft = clientX - rect.left + 15;
					let tTop = clientY - rect.top + 15;

					if (tLeft + tw > rect.width) tLeft = clientX - rect.left - tw - 15;
					if (tTop + th > rect.height) tTop = clientY - rect.top - th - 15;

					this.tooltip.setCssProps({
						opacity: "1",
						right: "auto",
						left: `${Math.max(10, Math.min(tLeft, rect.width - tw - 10))}px`,
						top: `${Math.max(10, Math.min(tTop, rect.height - th - 10))}px`,
					});
				}
			} else {
				if (this.hoveredSegment) {
					this.hoveredSegment.material.opacity = 0.0;
					this.hoveredSegment = null;
					this.hoveredDayBySeries.clear();
					this.isDockAnimating = true;
					this.vGridUniforms.targetFill.value = 0.0;
					this.graphGroup.children.forEach((child) => {
						const uData = child.userData as Partial<DataElementUserData>;
						if (uData && uData.isDataElement && uData.baseOpacity !== undefined) {
							uData.targetOpacity = uData.baseOpacity;
						}
					});
				}
				this.tooltip.setCssProps({ opacity: "0" });
			}
		};

		this.chartWrapper.addEventListener("mousemove", (e: MouseEvent) =>
			handleInteraction(e.clientX, e.clientY),
		);
		this.chartWrapper.addEventListener(
			"touchstart",
			(e: TouchEvent) => {
				if (e.touches[0]) {
					handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
				}
			},
			{ passive: true },
		);
		this.chartWrapper.addEventListener(
			"touchmove",
			(e: TouchEvent) => {
				if (e.touches[0]) {
					handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
				}
			},
			{ passive: true },
		);
		this.chartWrapper.addEventListener("wheel", () => resetInactivity(), {
			passive: true,
		});
		this.chartWrapper.addEventListener("mouseleave", () => {
			if (this.hoveredSegment) {
				this.hoveredSegment.material.opacity = 0.0;
				this.hoveredSegment = null;
				this.hoveredDayBySeries.clear();
				this.isDockAnimating = true;
			}
			this.tooltip.setCssProps({ opacity: "0" });
			resetInactivity();
		});

		this.controls.addEventListener("start", () => {
			if (this.transition.active) {
				this.transition.active = false;
				this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
			}
			if (this.inactivityTimer !== null) {
				activeWindow.clearTimeout(this.inactivityTimer);
			}
		});

		this.controls.addEventListener("change", () => resetInactivity());
		this.controls.addEventListener("end", () => resetInactivity());
		resetInactivity();
        
        let pointerDownPos = { x: 0, y: 0 };
		this.chartWrapper.addEventListener("pointerdown", (e: PointerEvent) => {
			pointerDownPos = { x: e.clientX, y: e.clientY };
		});

		this.chartWrapper.addEventListener("pointerup", (e: PointerEvent) => {
			const moveDist = Math.hypot(
				e.clientX - pointerDownPos.x,
				e.clientY - pointerDownPos.y,
			);
			// Only trigger if user clicked without dragging/rotating the 3D camera
			if (moveDist < 5 && this.hoveredSegment) {
				const data = this.hoveredSegment.userData as HitboxUserData;
				if (data.file) {
					const win = activeWindow as Window & {
						app?: {
							workspace?: {
								openLinkText?: (linktext: string, sourcePath: string) => void;
							};
						};
					};
					if (win.app?.workspace?.openLinkText) {
						win.app.workspace.openLinkText(data.file, "");
					}
				}
			}
		});
    }

	private stepDockMagnification(): boolean {
		this.dirtySeries.clear();
		let anyChanged = false;

		this.parsedSeries.forEach((_series, sIdx) => {
			const weights = this.dayWeightsBySeries[sIdx];
			const morphs = this.dayFocusMorphBySeries[sIdx];
			if (!weights || !morphs || weights.length === 0) return;

			const numDays = weights.length;
			const hoveredDay = this.hoveredDayBySeries.get(sIdx) ?? -1;

			const naturalDayWidth = this.currentBoxWidth / numDays;
			const targetExpandedWeight =
				naturalDayWidth < this.MIN_EXPANDED_DAY_WIDTH && numDays > 1
					? Math.min(
							numDays * 0.45,
							(this.MIN_EXPANDED_DAY_WIDTH / this.currentBoxWidth) * numDays * 1.35,
						)
					: 1.45;

			let seriesChanged = false;

			for (let i = 0; i < numDays; i++) {
				const dIdx = i + 1;
				let targetW = 1.0;
				let targetMorph = 0.0;

				if (hoveredDay > 0) {
					const dist = Math.abs(dIdx - hoveredDay);
					if (dist === 0) {
						targetW = Math.max(1.45, targetExpandedWeight);
						targetMorph = 1.0;
					} else if (dist === 1) {
						targetW = 1.0 + (Math.max(1.45, targetExpandedWeight) - 1.0) * 0.25;
						targetMorph = 0.0;
					}
				}

				const currentW = weights[i] ?? 1.0;
				const diffW = targetW - currentW;
				if (Math.abs(diffW) > 0.002) {
					weights[i] = currentW + diffW * 0.22;
					seriesChanged = true;
				} else if (currentW !== targetW) {
					weights[i] = targetW;
					seriesChanged = true;
				}

				const currentM = morphs[i] ?? 0.0;
				const diffM = targetMorph - currentM;
				if (Math.abs(diffM) > 0.002) {
					morphs[i] = currentM + diffM * 0.22;
					seriesChanged = true;
				} else if (currentM !== targetMorph) {
					morphs[i] = targetMorph;
					seriesChanged = true;
				}
			}

			if (seriesChanged) {
				this.dirtySeries.add(sIdx);
				anyChanged = true;
			}
		});

		return anyChanged;
	}

	public updateThemeColor(newHex: string): void {
		this.themeColor = newHex;

		while (this.graphGroup.children.length > 0) {
			const child = this.graphGroup.children[0];
			if (!child) break;
			this.graphGroup.remove(child);
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (Array.isArray(child.material)) {
					child.material.forEach((m: THREE.Material) => m.dispose());
				} else if (child.material instanceof THREE.Material) {
					child.material.dispose();
				}
			} else if (child instanceof THREE.Sprite) {
				child.material.map?.dispose();
				child.material.dispose();
			}
		}

		this.hitboxes = [];

		this.buildDataStructure();
		this.buildGrids();

		this.updateDOMTheme(this.currentIsDark);
		this.updateThreeTheme(this.currentIsDark);
	}

	public downloadScreenshot(filename = "enchartix-graph.png"): void {
		this.composer.render();
		const dataURL = this.renderer.domElement.toDataURL("image/png");

		const link = this.chartWrapper.createEl("a");
		link.download = filename;
		link.href = dataURL;
		link.click();
		link.remove();
	}

	private setupObservers(): void {
		this.intersectionObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0]) {
					this.isVisible = entries[0].isIntersecting;
				}
			},
			{ threshold: 0.1 },
		);
		this.intersectionObserver.observe(this.chartWrapper);

		this.resizeObserver = new ResizeObserver(() => {
			if (!this.chartWrapper.clientWidth || !this.chartWrapper.clientHeight) {
				return;
			}
			const newW = Math.max(this.chartWrapper.clientWidth, 10);
			const newH = Math.max(this.chartWrapper.clientHeight, 10);
			if (newW === this.clientW && newH === this.clientH) {
				return;
			}
			this.clientW = newW;
			this.clientH = newH;
			const aspect = this.clientW / this.clientH;
			this.camera.left = (-this.viewSize * aspect) / 2;
			this.camera.right = (this.viewSize * aspect) / 2;
			this.camera.top = this.viewSize / 2;
			this.camera.bottom = -this.viewSize / 2;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(this.clientW, this.clientH);
			this.composer.setSize(this.clientW, this.clientH);

			if (this.is2DMode && !this.transition.active) {
				this.currentBoxWidth = this.viewSize * aspect * 0.85;
				this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
			}
		});
		this.resizeObserver.observe(this.chartWrapper);

		const doc = activeDocument;
		this.themeObserver = new MutationObserver(() => {
			const isNowDark =
				doc.body.classList.contains("theme-dark") ||
				doc.documentElement.classList.contains("theme-dark");
			if (isNowDark !== this.currentIsDark) {
				this.currentIsDark = isNowDark;
				this.updateDOMTheme(this.currentIsDark);
				this.updateThreeTheme(this.currentIsDark);
			}
		});

		this.themeObserver.observe(doc.body, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	private animate(): void {
		if (!activeDocument.body.contains(this.chartWrapper)) {
			this.intersectionObserver?.disconnect();
			this.resizeObserver?.disconnect();
			this.themeObserver?.disconnect();
			return;
		}
		this.animationFrameID = requestAnimationFrame(this.animate);
		if (!this.isVisible) return;

		if (this.transition.active) {
			const now = performance.now();
			let t = (now - this.transition.startTime) / this.transition.duration;

			if (t >= 1) {
				t = 1;
				this.transition.active = false;
			}

			const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

			this.camera.position.lerpVectors(
				this.transition.startPos,
				this.transition.endPos,
				ease,
			);
			this.controls.target.lerpVectors(
				this.transition.startTarget,
				this.transition.endTarget,
				ease,
			);
			this.camera.quaternion.slerpQuaternions(
				this.transition.startQuat,
				this.transition.endQuat,
				ease,
			);

			this.currentBoxWidth =
				this.transition.startWidth +
				(this.transition.endWidth - this.transition.startWidth) * ease;
			this.currentBoxDepth =
				this.transition.startDepth +
				(this.transition.endDepth - this.transition.startDepth) * ease;

			this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, false);

			if (t === 1) {
				this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
			}
		} else {
			this.controls.update();
			if (this.isDockAnimating) {
				const changed = this.stepDockMagnification();
				if (changed) {
					this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, false, true);
				} else {
					this.isDockAnimating = false;
					this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true, false);
				}
			}
		}

		if (this.vGridUniforms) {
			const currentFill = this.vGridUniforms.fillProgress.value;
			const targetFill = this.vGridUniforms.targetFill.value;
			if (targetFill === 0.0 && currentFill > 0) {
				this.vGridUniforms.fillProgress.value = 0.0;
				this.verticalGrid.visible = false;
			} else if (targetFill === 1.0 && currentFill < 1.0) {
				this.vGridUniforms.fillProgress.value = Math.min(1.0, currentFill + 0.08);
			}
		}

		this.graphGroup.children.forEach((child) => {
			if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
				const uData = child.userData as Partial<DataElementUserData>;
				if (uData && uData.isDataElement && uData.targetOpacity !== undefined) {
					if (Math.abs(child.material.opacity - uData.targetOpacity) > 0.01) {
						child.material.opacity +=
							(uData.targetOpacity - child.material.opacity) * 0.25;
					}
				}
			}
		});

		const dir = new THREE.Vector3()
			.subVectors(this.camera.position, this.controls.target)
			.normalize();
		const currentIsTopDown = dir.y > 0.707;
		if (currentIsTopDown !== this.isTopDownView) {
			this.isTopDownView = currentIsTopDown;
			this.updateGradientDirection(this.isTopDownView);
			this.updateGridOrientation();
		}

		this.composer.render();
	}

	public destroy(): void {
		this.isVisible = false;
		if (this.animationFrameID !== null) {
			cancelAnimationFrame(this.animationFrameID);
		}
		if (this.inactivityTimer !== null) {
			activeWindow.clearTimeout(this.inactivityTimer);
		}

		this.intersectionObserver?.disconnect();
		this.resizeObserver?.disconnect();
		this.themeObserver?.disconnect();

		this.scene.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				object.geometry.dispose();
				if (Array.isArray(object.material)) {
					object.material.forEach((m: THREE.Material) => m.dispose());
				} else if (object.material instanceof THREE.Material) {
					object.material.dispose();
				}
			} else if (object instanceof THREE.Sprite) {
				object.material.map?.dispose();
				object.material.dispose();
			}
		});

		this.renderer.dispose();
		this.composer.dispose();
		this.controls.dispose();

		this.chartWrapper.remove();
	}
}