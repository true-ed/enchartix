export const HORIZONTAL_GRID_VERTEX_SHADER = `
	varying vec3 vWorldPosition;
	void main() {
		vec4 worldPosition = modelMatrix * vec4(position, 1.0);
		vWorldPosition = worldPosition.xyz;
		gl_Position = projectionMatrix * viewMatrix * worldPosition;
	}
`;

export const HORIZONTAL_GRID_FRAGMENT_SHADER = `
	uniform vec3 color;
	uniform vec2 focusPoint;
	uniform float fadeRadius;
	uniform float opacityMulti;
	varying vec3 vWorldPosition;

	void main() {
		float dist = distance(vWorldPosition.xz, focusPoint);
		float radialFade = 1.0 - smoothstep(0.0, fadeRadius, dist);
		float coreGlow = pow(1.0 - smoothstep(0.0, fadeRadius * 0.55, dist), 2.2);

		float ringWave = sin(dist * 0.08) * 0.5 + 0.5;
		float subtleRings = smoothstep(0.92, 1.0, ringWave) * 0.12 * radialFade;

		float alpha = (coreGlow * 0.28 + radialFade * 0.06 + subtleRings) * opacityMulti;
		gl_FragColor = vec4(color, alpha);
	}
`;

export const VERTICAL_GRID_VERTEX_SHADER = `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
	}
`;

export const VERTICAL_GRID_FRAGMENT_SHADER = `
	uniform float fillProgress;
	uniform float gridScaleX;
	uniform float cellsPos;
	uniform float cellsNeg;
	uniform float zeroLineV;
	uniform float topPadV;
	uniform float bottomPadV;
	uniform vec3 accentColor;
	varying vec2 vUv;

	void main() {
		// Map vUv.y to independent positive (above zeroLineV) and negative (below zeroLineV) cell coordinates
		float posSpanV = max(0.0001, (1.0 - topPadV) - zeroLineV);
		float negSpanV = max(0.0001, zeroLineV - bottomPadV);

		float relY = (vUv.y >= zeroLineV)
			? ((vUv.y - zeroLineV) / posSpanV) * cellsPos
			: ((vUv.y - zeroLineV) / negSpanV) * cellsNeg;

		float relX = (vUv.x - 0.5) * gridScaleX;

		// Screen-space derivatives (fwidth) guarantee razor-sharp 1px lines without stretching!
		float fwX = max(fwidth(relX), 0.0001);
		float fwY = max(fwidth(relY), 0.0001);

		// Minor grid (every 1 cell)
		vec2 minorDist = abs(fract(vec2(relX, relY) - 0.5) - 0.5);
		float minorX = 1.0 - smoothstep(0.0, fwX * 1.25, minorDist.x);
		float minorY = 1.0 - smoothstep(0.0, fwY * 1.25, minorDist.y);
		float minorAlpha = max(minorX * 0.35, minorY * 0.65);

		// Major grid (every 5 cells)
		vec2 majorDist = abs(fract(vec2(relX, relY) / 5.0 - 0.5) - 0.5);
		float majorX = 1.0 - smoothstep(0.0, (fwX / 5.0) * 1.6, majorDist.x);
		float majorY = 1.0 - smoothstep(0.0, (fwY / 5.0) * 1.6, majorDist.y);
		float majorAlpha = max(majorX * 0.55, majorY * 0.95);

		// Exact Zero Baseline passing directly through the two day anchor nodes
		float zeroDistPx = abs(vUv.y - zeroLineV) / max(fwidth(vUv.y), 0.00001);
		float zeroLine = 1.0 - smoothstep(0.5, 2.2, zeroDistPx);

		// Animated reveal from center
		float distFromCenter = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5));
		float reveal = 1.0 - smoothstep(fillProgress * 0.55, fillProgress * 0.55 + 0.15, distFromCenter);

		// Clean edge vignette
		float edgeFadeX = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
		float edgeFadeY = smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
		float envelope = reveal * edgeFadeX * edgeFadeY;

		vec3 baseGridColor = mix(vec3(0.9), accentColor, 0.35);
		vec3 finalColor = mix(baseGridColor, accentColor, zeroLine * 0.9);

		float combinedAlpha = (minorAlpha * 0.16 + majorAlpha * 0.28 + zeroLine * 0.85) * envelope;
		gl_FragColor = vec4(finalColor, combinedAlpha);
	}
`;