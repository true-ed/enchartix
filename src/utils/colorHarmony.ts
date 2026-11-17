export interface HSL {
	h: number;
	s: number;
	l: number;
}

export interface OKLCH {
	l: number;
	c: number;
	h: number;
}

export interface ThemeColors {
	bgStr: string;
	secStr: string;
}

export const getHSL = (hex: string): HSL => {
	const raw = hex.startsWith("#") ? hex.substring(1) : hex;
	let chars = raw.split("");
	if (chars.length === 3) {
		chars = [chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]];
	}
	const num = parseInt(chars.join(""), 16);
	let r = ((num >> 16) & 255) / 255;
	let g = ((num >> 8) & 255) / 255;
	let b = (num & 255) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			case b:
				h = (r - g) / d + 4;
				break;
		}
		h /= 6;
	}

	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	};
};

export const generateThemeColors = (hex: string, isDark: boolean): ThemeColors => {
	const { h, s } = getHSL(hex);
	const bgHue = (h + 180) % 360;
	const bgSat = Math.max(10, Math.round(s * 0.2));
	const bgLight = isDark ? 6 : 96;
	const bgStr = `hsl(${bgHue}, ${bgSat}%, ${bgLight}%)`;

	const secHue = (h + 30) % 360;
	const secSat = Math.max(20, Math.round(s * 0.4));
	const secLight = isDark ? 16 : 86;
	const secStr = `hsl(${secHue}, ${secSat}%, ${secLight}%)`;

	return { bgStr, secStr };
};

export const hexToOKLCH = (hex: string): OKLCH => {
	const cleanHex = hex.startsWith("#") ? hex.substring(1) : hex;
	const fullHex =
		cleanHex.length === 3
			? cleanHex
					.split("")
					.map((ch) => ch + ch)
					.join("")
			: cleanHex;

	let r = parseInt(fullHex.substring(0, 2), 16) / 255;
	let g = parseInt(fullHex.substring(2, 4), 16) / 255;
	let b = parseInt(fullHex.substring(4, 6), 16) / 255;

	const lin = (c: number): number =>
		c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;

	r = lin(r);
	g = lin(g);
	b = lin(b);

	const lms = [
		0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
		0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
		0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
	].map((val) => Math.cbrt(val));

	const L = 0.2104542553 * lms[0] + 0.793617785 * lms[1] - 0.0040720468 * lms[2];
	const a = 1.9779984951 * lms[0] - 2.428592205 * lms[1] + 0.4505937099 * lms[2];
	const b_ = 0.0259040371 * lms[0] + 0.7827717662 * lms[1] - 0.808675766 * lms[2];

	return {
		l: L,
		c: Math.sqrt(a * a + b_ * b_),
		h: ((Math.atan2(b_, a) * 180) / Math.PI + 360) % 360,
	};
};

export const oklchToHex = (L: number, C: number, h: number): string => {
	let actualC = C;
	const hRad = (h * Math.PI) / 180;
	let rgb: [number, number, number] = [0, 0, 0];

	for (let i = 0; i < 10; i++) {
		const a = actualC * Math.cos(hRad);
		const b = actualC * Math.sin(hRad);
		const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
		const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
		const s_ = L - 0.0894841775 * a - 1.291485548 * b;

		const l3 = l_ * l_ * l_;
		const m3 = m_ * m_ * m_;
		const s3 = s_ * s_ * s_;

		const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
		const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
		const b_r = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

		rgb = [r, g, b_r];
		if (rgb.every((c) => c >= -0.001 && c <= 1.001)) break;
		actualC *= 0.9;
	}

	const gamma = (c: number): number =>
		c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

	const toHex = (c: number): string =>
		Math.max(0, Math.min(255, Math.round(gamma(c) * 255)))
			.toString(16)
			.padStart(2, "0");

	return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
};

export const generateAccentPalette = (hex: string, count: number): string[] => {
	const userColor = hexToOKLCH(hex);
	const palette: string[] = [];

	const centerIndex = Math.floor(count / 2);
	const hueStep = 10;

	for (let i = 0; i < count; i++) {
		const offset = (i - centerIndex) * hueStep;
		let newHue = (userColor.h - offset) % 360;
		if (newHue < 0) {
			newHue += 360;
		}
		palette.push(oklchToHex(userColor.l, userColor.c, newHue));
	}
	return palette;
};