import * as THREE from "three";

export interface EnchartixEntry {
	sets?: number[];
	values?: number[];
	date: string;
    note?: string;
	notes?: string;
	file?: string;
}

export interface EnchartixSeriesInput {
	name: string;
	entries: EnchartixEntry[];
}

export interface EnchartixLabels {
	viewToggle2D: string;
	viewToggle3D: string;
	tooltipNoteTotal: string;
	tooltipDailyTotal?: string;
	tooltipEntries: string;
	tooltipCumulative: string;
	tooltipGridScale?: string;
	tooltipModePinned?: string;
	tooltipModeFloating?: string;
}

export interface EnchartixOptions {
	themeColor?: string;
	isDark?: boolean;
	tooltipMode?: "pinned" | "floating";
	labels?: Partial<EnchartixLabels>;
}

export interface DayScaleInfo {
	step: number;
	maxCeil: number;
	minFloor: number;
	totalSpan: number;
	cellsPos: number;
	cellsNeg: number;
	totalCells: number;
	zeroRatio: number;
}

export interface ExerciseStats {
	maxCumulative: number;
	minCumulative: number;
	maxDays: number;
	globalMaxPosSet: number;
	globalMaxNegSet: number;
}

export interface PointData {
	dayIndex: number;
	frac: number;
	cumulative: number;
	setVal: number;
	globalNormZ: number; 
	localNormZ: number;  
	isNode: boolean;
}

export interface BoxSize {
	x: number;
	y: number;
	z: number;
}

export interface HitboxUserData {
	exercise: string;
	seriesIndex: number;
	dayIndex: number;
	date: string;
	sets: number[];
	dayTotal: number;
	total: number;
	color: string;
	scaleInfo: DayScaleInfo;
	boxSize?: BoxSize;
	note?: string;
	file?: string;
}

export interface DataElementUserData {
	exercise: string;
	isDataElement: boolean;
	baseOpacity: number;
	targetOpacity: number;
}

export type HitboxMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
export type DataMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

export interface DayData {
	dayIndex: number;
	mesh: HitboxMesh;
	pointIndices: number[];
	scaleInfo: DayScaleInfo;
}

export interface ParsedSeries {
	name: string;
	colorNum: number;
	colorStr: string;
	stats: ExerciseStats;
	pointsData: PointData[];
	daysData: DayData[];
	meshes: {
		spheres: DataMesh[];
		tube: DataMesh | null;
		hitboxes: HitboxMesh[];
	};
}

export interface TransitionState {
	active: boolean;
	startTime: number;
	duration: number;
	startPos: THREE.Vector3;
	endPos: THREE.Vector3;
	startTarget: THREE.Vector3;
	endTarget: THREE.Vector3;
	startQuat: THREE.Quaternion;
	endQuat: THREE.Quaternion;
	startWidth: number;
	endWidth: number;
	startDepth: number;
	endDepth: number;
}