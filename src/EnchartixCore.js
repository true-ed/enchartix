import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// =======================================================
// 🎨 COLOR HARMONY
// =======================================================
const getHSL = (hex) => {
  let c = hex.substring(1).split("");
  if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
  c = "0x" + c.join("");
  let r = (c >> 16) & 255,
    g = (c >> 8) & 255,
    b = c & 255;
  r /= 255;
  g /= 255;
  b /= 255;
  let max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
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

const generateThemeColors = (hex, isDark) => {
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

const hexToOKLCH = (hex) => {
  let r = parseInt(hex.substring(1, 3), 16) / 255;
  let g = parseInt(hex.substring(3, 5), 16) / 255;
  let b = parseInt(hex.substring(5, 7), 16) / 255;
  const lin = (c) =>
    c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  r = lin(r);
  g = lin(g);
  b = lin(b);
  const lms = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  const L =
    0.2104542553 * lms[0] + 0.793617785 * lms[1] - 0.0040720468 * lms[2];
  const a =
    1.9779984951 * lms[0] - 2.428592205 * lms[1] + 0.4505937099 * lms[2];
  const b_ =
    0.0259040371 * lms[0] + 0.7827717662 * lms[1] - 0.808675766 * lms[2];
  return {
    l: L,
    c: Math.sqrt(a * a + b_ * b_),
    h: ((Math.atan2(b_, a) * 180) / Math.PI + 360) % 360,
  };
};

const oklchToHex = (L, C, h) => {
  let actualC = C;
  const hRad = (h * Math.PI) / 180;
  let rgb;
  for (let i = 0; i < 10; i++) {
    const a = actualC * Math.cos(hRad);
    const b = actualC * Math.sin(hRad);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ * l_ * l_,
      m3 = m_ * m_ * m_,
      s3 = s_ * s_ * s_;
    const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const b_r = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
    rgb = [r, g, b_r];
    if (rgb.every((c) => c >= -0.001 && c <= 1.001)) break;
    actualC *= 0.9;
  }
  const gamma = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  const toHex = (c) =>
    Math.max(0, Math.min(255, Math.round(gamma(c) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
};

const generateAccentPalette = (hex, count) => {
  const userColor = hexToOKLCH(hex);
  let palette = [];

  const centerIndex = Math.floor(count / 2);
  const hueStep = 10;

  for (let i = 0; i < count; i++) {
    let offset = (i - centerIndex) * hueStep;

    let newHue = (userColor.h - offset) % 360;

    if (newHue < 0) {
      newHue += 360;
    }

    palette.push(oklchToHex(userColor.l, userColor.c, newHue));
  }
  return palette;
};

const defaultLabels = {
  viewToggle2D: "2D Flat View",
  viewToggle3D: "3D Perspective",
  tooltipDailyTotal: "Daily Total",
  tooltipEntries: "Entries:",
  tooltipCumulative: "Overall Progress:",
};

// =======================================================
// 🚀 ENCHARTIX 3D ENGINE
// =======================================================
export class EnchartixGraph {
  constructor(container, data, options = {}) {
    this.container = container;
    this.data = data;
    this.themeColor = options.themeColor || "#7d33ff";

    this.labels = { ...defaultLabels, ...(options.labels || {}) };

    this.currentIsDark =
      options.isDark !== undefined
        ? options.isDark
        : document.body.classList.contains("theme-dark") ||
          document.documentElement.classList.contains("theme-dark");
    this.hitboxes = [];
    this.is2DMode = false;
    this.hoveredSegment = null;
    this.isTopDownView = false;
    this.isVisible = true;
    this.inactivityTimer = null;

    this.BOX_HEIGHT = 120;
    this.currentBoxWidth = 250;
    this.currentBoxDepth = this.data.length * 120;

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
      startWidth: 250,
      endWidth: 250,
      startDepth: this.currentBoxDepth,
      endDepth: this.currentBoxDepth,
    };

    this.initDOM();
    this.initThreeJS();
    this.setupObservers();
  }

  initDOM() {
    // Wrapper setup
    this.chartWrapper = document.createElement("div");
    this.chartWrapper.className = "enchartix-wrapper";

    // UI Overlay setup
    this.uiOverlay = document.createElement("div");
    this.uiOverlay.className = "enchartix-ui-overlay";

    // Toggle button setup
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.innerText = this.labels.viewToggle2D;
    this.toggleBtn.className = "enchartix-toggle-btn";
    this.toggleBtn.onclick = () => this.toggleViewMode();

    this.uiOverlay.appendChild(this.toggleBtn);

    // Tooltip setup
    this.tooltip = document.createElement("div");
    this.tooltip.className = "enchartix-tooltip";

    const ttTitle = document.createElement("div");
    ttTitle.id = "tt-title";
    ttTitle.className = "enchartix-tooltip-title";
    // Dynamic theme colors must use setProperty
    ttTitle.style.setProperty("color", this.themeColor);
    ttTitle.style.setProperty("border-bottom-color", `${this.themeColor}44`);

    const ttDataContainer = document.createElement("div");
    ttDataContainer.id = "tt-data";
    ttDataContainer.className = "enchartix-tooltip-data";

    this.tooltip.appendChild(ttTitle);
    this.tooltip.appendChild(ttDataContainer);

    // Assemble DOM
    this.chartWrapper.appendChild(this.uiOverlay);
    this.chartWrapper.appendChild(this.tooltip);
    this.container.appendChild(this.chartWrapper);

    this.updateDOMTheme(this.currentIsDark);
  }

  updateDOMTheme(isDark) {
    const { bgStr } = generateThemeColors(this.themeColor, isDark);
    const shadowAlpha = isDark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.15)";

    // Apply dynamic theme properties
    this.chartWrapper.style.setProperty("background-color", bgStr);
    this.chartWrapper.style.setProperty(
      "box-shadow",
      `inset 0 10px 30px ${shadowAlpha}, inset 0 0 20px ${this.themeColor}33`,
    );

    this.toggleBtn.style.setProperty(
      "background",
      isDark ? `${this.themeColor}22` : `${this.themeColor}15`,
    );
    this.toggleBtn.style.setProperty("border", `1px solid ${this.themeColor}`);
    this.toggleBtn.style.setProperty(
      "color",
      isDark ? this.themeColor : "#222",
    );

    this.tooltip.style.setProperty(
      "background",
      isDark ? "rgba(10, 10, 20, 0.85)" : "rgba(255, 255, 255, 0.9)",
    );
    this.tooltip.style.setProperty("color", isDark ? "#fff" : "#222");
    this.tooltip.style.setProperty(
      "box-shadow",
      isDark
        ? "0 4px 15px rgba(0, 0, 0, 0.5)"
        : "0 4px 15px rgba(0, 0, 0, 0.1)",
    );
  }

  initThreeJS() {
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.clientW, this.clientH);
    this.chartWrapper.appendChild(this.renderer.domElement);

    this.buildDataStructure();

    const graphBox = new THREE.Box3().setFromObject(this.graphGroup);
    this.graphCenter = graphBox.getCenter(new THREE.Vector3());
    const graphSize = graphBox.getSize(new THREE.Vector3());
    this.maxDim = Math.max(graphSize.x, graphSize.y, graphSize.z, 50);

    this.buildGrids();

    this.viewSize = this.maxDim * 1.2;
    let aspect = this.clientW / this.clientH;

    this.camera = new THREE.OrthographicCamera(
      (this.viewSize * aspect) / -2,
      (this.viewSize * aspect) / 2,
      this.viewSize / 2,
      this.viewSize / -2,
      -this.maxDim * 3,
      this.maxDim * 3,
    );

    this.pos3D = new THREE.Vector3(
      this.graphCenter.x - this.maxDim * 0.5,
      this.graphCenter.y + this.maxDim * 0.4,
      this.graphCenter.z + this.maxDim * 0.8,
    );
    this.pos2D = new THREE.Vector3(
      this.graphCenter.x,
      this.graphCenter.y + this.maxDim,
      this.graphCenter.z + 1.0,
    );

    this.camera.position.copy(this.pos3D);
    this.camera.zoom = 1.0;
    this.camera.updateProjectionMatrix();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.copy(this.graphCenter);
    this.controls.minZoom = 0.3;
    this.controls.maxZoom = 4.0;
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
      1.5,
      0.4,
      0.1,
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);

    this.updateThreeTheme(this.currentIsDark);
    this.setupInteractions();

    this.animate = this.animate.bind(this);
    this.animate();
  }

  buildDataStructure() {
    const accentPalette = generateAccentPalette(
      this.themeColor,
      this.data.length,
    );

    const exerciseStats = this.data.map((series) => {
      let maxCumulative = 0.0001,
        maxSet = 0.0001,
        currentCumulative = 0;
      const maxDays = Math.max(1, series.entries.length - 1);
      series.entries.forEach((d, i) => {
        if (i === 0) return;
        d.sets.forEach((setVal) => {
          currentCumulative += setVal;
          maxSet = Math.max(maxSet, setVal);
        });
        maxCumulative = Math.max(maxCumulative, currentCumulative);
      });
      return { maxCumulative, maxSet, maxDays };
    });

    this.parsedSeries = [];

    this.data.forEach((series, exIndex) => {
      const stats = exerciseStats[exIndex];
      const accentStr = accentPalette[exIndex];
      const accentNum = new THREE.Color(accentStr).getHex();

      const seriesObj = {
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

      seriesObj.pointsData.push({
        dayIndex: 0,
        frac: 0,
        cumulative: 0,
        setVal: 0,
        zDir: 0,
        isNode: true,
      });
      seriesObj.meshes.spheres.push(
        this.createPointMesh(accentNum, 1.5, series.name),
      );
      globalPtIdx++;

      series.entries.forEach((d, dayIndex) => {
        if (dayIndex === 0) return;

        const sets = d.sets;
        const numSets = sets.length;
        const dayPointsIdx = [globalPtIdx - 1];

        sets.forEach((setVal, index) => {
          cumulative += setVal;
          const frac = (index + 1) / numSets;
          const isNode = numSets === 1 || index === numSets - 1;
          const zDir = index % 2 === 0 ? 1 : -1;

          seriesObj.pointsData.push({
            dayIndex,
            frac,
            cumulative,
            setVal,
            zDir,
            isNode,
          });
          seriesObj.meshes.spheres.push(
            this.createPointMesh(accentNum, isNode ? 1.5 : 0.8, series.name),
          );

          dayPointsIdx.push(globalPtIdx);
          globalPtIdx++;
        });

        if (dayPointsIdx.length > 1) {
          const hitboxMesh = new THREE.Mesh(
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
          hitboxMesh.userData = {
            exercise: series.name,
            date: d.date,
            sets: sets,
            dayTotal: sets.reduce((a, b) => a + b, 0),
            total: cumulative,
            color: accentStr,
          };
          this.graphGroup.add(hitboxMesh);
          this.hitboxes.push(hitboxMesh);

          seriesObj.daysData.push({
            mesh: hitboxMesh,
            pointIndices: dayPointsIdx,
          });
        }
      });

      if (seriesObj.pointsData.length > 1) {
        const tube = new THREE.Mesh(
          new THREE.BufferGeometry(),
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
          }),
        );
        tube.userData = {
          exercise: series.name,
          isDataElement: true,
          baseOpacity: 0.8,
          targetOpacity: 0.8,
        };
        this.graphGroup.add(tube);
        seriesObj.meshes.tube = tube;
      }

      this.parsedSeries.push(seriesObj);
    });

    this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
  }

  createPointMesh(color, size, exName) {
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1.0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = {
      exercise: exName,
      isDataElement: true,
      baseOpacity: 1.0,
      targetOpacity: 1.0,
    };
    this.graphGroup.add(mesh);
    return mesh;
  }

  applyLayout(boxWidth, boxDepth, rebuildHitboxes = false) {
    const EXERCISE_DEPTH = boxDepth / this.parsedSeries.length;
    const Z_PADDING = 0.9;

    this.parsedSeries.forEach((series, exIndex) => {
      const stats = series.stats;
      const baseZ = -boxDepth / 2 + (exIndex + 0.5) * EXERCISE_DEPTH;
      const maxDeviationZ = (EXERCISE_DEPTH / 2) * Z_PADDING;

      const mapX = (dayIndex, frac) => {
        const pos = dayIndex === 0 ? 0 : dayIndex - 1 + frac;
        return -boxWidth / 2 + (pos / stats.maxDays) * boxWidth;
      };
      const mapY = (val) =>
        -this.BOX_HEIGHT / 2 + (val / stats.maxCumulative) * this.BOX_HEIGHT;
      const mapZ = (val, zDir) =>
        baseZ + (val / stats.maxSet) * maxDeviationZ * zDir;

      const curvePoints = [];

      series.pointsData.forEach((pt, i) => {
        const x = mapX(pt.dayIndex, pt.frac);
        const y = mapY(pt.cumulative);
        const z = pt.isNode ? baseZ : mapZ(pt.setVal, pt.zDir);
        const pos = new THREE.Vector3(x, y, z);
        curvePoints.push(pos);
        series.meshes.spheres[i].position.copy(pos);
      });

      if (series.meshes.tube && curvePoints.length > 1) {
        const curve = new THREE.CatmullRomCurve3(
          curvePoints,
          false,
          "centripetal",
          0.5,
        );

        const segmentCount = Math.min(
          1000,
          Math.max(300, Math.floor(boxWidth * 1.5)),
        );
        const tubeGeo = new THREE.TubeGeometry(
          curve,
          segmentCount,
          0.3,
          8,
          false,
        );

        const count = tubeGeo.attributes.position.count;
        const colorsArr = new Float32Array(count * 3);
        const colorBottom = new THREE.Color(
          this.scene ? this.scene.background : 0x000000,
        );
        const colorTop = new THREE.Color(series.colorNum);

        for (let i = 0; i < count; i++) {
          const y = tubeGeo.attributes.position.getY(i);
          const factor = Math.max(
            0,
            Math.min(1, (y + this.BOX_HEIGHT / 2) / this.BOX_HEIGHT),
          );
          const c = colorBottom.clone().lerp(colorTop, factor);
          colorsArr[i * 3] = c.r;
          colorsArr[i * 3 + 1] = c.g;
          colorsArr[i * 3 + 2] = c.b;
        }
        tubeGeo.setAttribute("color", new THREE.BufferAttribute(colorsArr, 3));

        series.meshes.tube.geometry.dispose();
        series.meshes.tube.geometry = tubeGeo;
      }

      if (rebuildHitboxes) {
        series.daysData.forEach((dayData) => {
          const boxPoints = dayData.pointIndices.map((idx) => curvePoints[idx]);
          const box3 = new THREE.Box3().setFromPoints(boxPoints);
          const size = box3.getSize(new THREE.Vector3());
          const center = box3.getCenter(new THREE.Vector3());

          size.x = Math.max(size.x, 8) + 16;
          size.y = Math.max(size.y, 8) + 16;
          size.z = Math.max(size.z, 24) + 16;

          const segmentGeometry = new RoundedBoxGeometry(
            size.x,
            size.y,
            size.z,
            4,
            8,
          );

          const darkerColor = new THREE.Color(series.colorNum).multiplyScalar(
            0.1,
          );
          const posAttr = segmentGeometry.attributes.position;
          const colorData = new Float32Array(posAttr.count * 4);

          for (let j = 0; j < posAttr.count; j++) {
            let alpha = 0;
            if (this.isTopDownView) {
              const localY = posAttr.getY(j);
              const normalizedY = (1 - localY + size.y / 2) / size.y;
              alpha = Math.pow(normalizedY, 5);
            } else {
              const localZ = posAttr.getZ(j);
              const normalizedZ = (1 - localZ + size.z / 2) / size.z;
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
          dayData.mesh.position.copy(center);
          dayData.mesh.userData.boxSize = { x: size.x, y: size.y, z: size.z };
        });
      }
    });
  }

  buildGrids() {
    const gridGeometry = new THREE.PlaneGeometry(
      this.maxDim * 5,
      this.maxDim * 5,
    );
    gridGeometry.rotateX(-Math.PI / 2);
    this.gridMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color() },
        focusPoint: {
          value: new THREE.Vector2(this.graphCenter.x, this.graphCenter.z),
        },
        fadeRadius: { value: this.maxDim * 0.9 },
        gridScale: { value: 20.0 },
        lineThickness: { value: 0.04 },
        opacityMulti: { value: 0.5 },
      },
      vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
            `,
      fragmentShader: `
                uniform vec3 color; uniform vec2 focusPoint; uniform float fadeRadius;
                uniform float gridScale; uniform float lineThickness; uniform float opacityMulti;
                varying vec3 vWorldPosition;
                void main() {
                    vec2 coord = vWorldPosition.xz / gridScale;
                    vec2 grid = abs(fract(coord - 0.5) - 0.5);
                    float lineX = smoothstep(lineThickness, 0.0, grid.x);
                    float lineY = smoothstep(lineThickness, 0.0, grid.y);
                    float lineAlpha = max(lineX, lineY);
                    float dist = distance(vWorldPosition.xz, focusPoint);
                    float fade = 1.0 - smoothstep(0.0, fadeRadius, dist);
                    float coreGlow = 1.0 - smoothstep(0.0, fadeRadius * 0.3, dist);
                    vec3 finalColor = mix(color * (opacityMulti), color, coreGlow);
                    gl_FragColor = vec4(finalColor, lineAlpha * fade * opacityMulti);
                }
            `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const customGrid = new THREE.Mesh(gridGeometry, this.gridMaterial);
    customGrid.position.y = -this.BOX_HEIGHT / 2 - 0.1;
    this.graphGroup.add(customGrid);

    const vGridGeo = new THREE.PlaneGeometry(1, 1);
    this.vGridMat = new THREE.ShaderMaterial({
      uniforms: {
        fillProgress: { value: 0.0 },
        targetFill: { value: 0.0 },
        gridScaleX: { value: 5.0 },
        gridScaleY: { value: 5.0 },
        lineThickness: { value: 0.05 },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
                uniform float fillProgress; uniform float gridScaleX; uniform float gridScaleY; uniform float lineThickness;
                varying vec2 vUv;
                void main() {
                    vec2 coord = vec2((vUv.x - 0.5) * gridScaleX, (vUv.y - 0.5) * gridScaleY);
                    vec2 grid = abs(fract(coord - 0.5) - 0.5);
                    float lineX = smoothstep(lineThickness, 0.0, grid.x);
                    float lineY = smoothstep(lineThickness, 0.0, grid.y);
                    float lineAlpha = max(lineX, lineY);
                    float distX = abs(vUv.x - 0.5); float distY = abs(vUv.y - 0.5);
                    float revealX = 1.0 - smoothstep(fillProgress * 0.5, fillProgress * 0.5 + 0.1, distY);
                    float revealY = 1.0 - smoothstep(fillProgress * 0.5, fillProgress * 0.5 + 0.1, distX);
                    float structuralMask = max(lineX * revealX, lineY * revealY);
                    float generalFade = 1.0 - smoothstep(fillProgress * 0.7, fillProgress * 0.7 + 0.2, max(distX, distY));
                    float finalMask = max(structuralMask, generalFade * lineAlpha * 0.3);
                    float edgeFadeX = smoothstep(0.0, 0.4, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
                    float edgeFadeY = smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
                    gl_FragColor = vec4(vec3(1.0), finalMask * edgeFadeX * edgeFadeY * 0.1);
                }
            `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.verticalGrid = new THREE.Mesh(vGridGeo, this.vGridMat);
    this.verticalGrid.visible = false;
    this.graphGroup.add(this.verticalGrid);
  }

  updateThreeTheme(isDark) {
    const { bgStr, secStr } = generateThemeColors(this.themeColor, isDark);
    const bgNum = new THREE.Color(bgStr).getHex();
    this.scene.background = new THREE.Color(bgNum);
    this.scene.fog = new THREE.FogExp2(bgNum, isDark ? 0.002 : 0.001);

    if (this.gridMaterial) {
      this.gridMaterial.uniforms.color.value.set(secStr);
      this.gridMaterial.uniforms.opacityMulti.value = isDark ? 0.6 : 0.8;
    }

    if (this.bloomPass) {
      this.bloomPass.strength = isDark ? 1.2 : 0.0;
      this.bloomPass.threshold = isDark ? 0 : 0.5;
    }
    this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
  }

  updateGradientDirection(isTopDown) {
    this.hitboxes.forEach((mesh) => {
      if (!mesh.geometry.attributes.position) return;
      const posAttr = mesh.geometry.attributes.position;
      const colorAttr = mesh.geometry.attributes.color;
      const size = mesh.userData.boxSize;
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

  updateGridOrientation() {
    if (!this.hoveredSegment) return;
    const segBox = new THREE.Box3().setFromObject(this.hoveredSegment);
    const segSize = this.hoveredSegment.userData.boxSize;
    const segCenter = segBox.getCenter(new THREE.Vector3());

    if (this.isTopDownView) {
      this.verticalGrid.rotation.x = -Math.PI / 2;
      this.verticalGrid.position.set(
        segCenter.x,
        segBox.min.y + 0.2,
        segCenter.z,
      );
      this.verticalGrid.scale.set(segSize.x, segSize.z, 1);
      this.vGridMat.uniforms.gridScaleX.value = segSize.x / 4.0;
      this.vGridMat.uniforms.gridScaleY.value = segSize.z / 4.0;
    } else {
      this.verticalGrid.rotation.x = 0;
      this.verticalGrid.position.set(
        segCenter.x,
        segCenter.y,
        segBox.min.z + 0.2,
      );
      this.verticalGrid.scale.set(segSize.x, segSize.y, 1);
      this.vGridMat.uniforms.gridScaleX.value = segSize.x / 4.0;
      this.vGridMat.uniforms.gridScaleY.value = segSize.y / 4.0;
    }
  }

  toggleViewMode() {
    this.is2DMode = !this.is2DMode;
    this.toggleBtn.innerText = this.is2DMode
      ? this.labels.viewToggle3D
      : this.labels.viewToggle2D;

    if (this.hoveredSegment) {
      this.hoveredSegment.material.opacity = 0.0;
      this.hoveredSegment = null;
      this.tooltip.style.setProperty("opacity", "0");
      this.vGridMat.uniforms.targetFill.value = 0.0;
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
      this.transition.endWidth = 250;
      this.transition.endDepth = this.data.length * 120;
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
    clearTimeout(this.inactivityTimer);
  }

  setupInteractions() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    const handleInteraction = (clientX, clientY) => {
      if (this.transition.active) return;

      const rect = this.chartWrapper.getBoundingClientRect();
      this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.hitboxes);

      if (intersects.length > 0) {
        const object = intersects[0].object;
        if (this.hoveredSegment !== object) {
          if (this.hoveredSegment) this.hoveredSegment.material.opacity = 0.0;
          this.hoveredSegment = object;
          this.hoveredSegment.material.opacity = this.currentIsDark ? 0.3 : 0.4;

          const data = object.userData;
          this.vGridMat.uniforms.targetFill.value = 1.0;
          this.vGridMat.uniforms.fillProgress.value = 0.0;
          this.verticalGrid.visible = true;
          this.updateGridOrientation();

          this.graphGroup.children.forEach((child) => {
            if (child.userData && child.userData.isDataElement) {
              child.userData.targetOpacity =
                child.userData.exercise === data.exercise
                  ? child.userData.baseOpacity
                  : 0.15;
            }
          });

          this.tooltip.querySelector("#tt-title").innerText =
            `${data.date} (${data.exercise})`;
          this.tooltip.querySelector("#tt-title").style.color = data.color;
          this.tooltip.querySelector("#tt-title").style.borderColor =
            data.color;

          const ttData = this.tooltip.querySelector("#tt-data");
          ttData.replaceChildren();

          const totalDiv = document.createElement("div");
          totalDiv.textContent = `${this.labels.tooltipNoteTotal}: `;
          const totalBold = document.createElement("b");
          totalBold.textContent = data.dayTotal;
          totalDiv.appendChild(totalBold);

          const exerciseDiv = document.createElement("div");
          exerciseDiv.textContent = `${data.exercise}: ${data.sets.join(" + ")}`;

          const cumulativeDiv = document.createElement("div");
          cumulativeDiv.textContent = `${this.labels.tooltipCumulative}: `;
          const cumulativeBold = document.createElement("b");
          cumulativeBold.textContent = data.total;
          cumulativeDiv.appendChild(cumulativeBold);

          ttData.append(totalDiv, exerciseDiv, cumulativeDiv);
        }

        // Update tooltip position and visibility
        this.tooltip.style.setProperty("opacity", "1");

        const tw = this.tooltip.offsetWidth,
          th = this.tooltip.offsetHeight;

        let tLeft = clientX - rect.left + 15,
          tTop = clientY - rect.top + 15;

        if (tLeft + tw > rect.width) tLeft = clientX - rect.left - tw - 15;
        if (tTop + th > rect.height) tTop = clientY - rect.top - th - 15;

        this.tooltip.style.setProperty(
          "left",
          `${Math.max(10, Math.min(tLeft, rect.width - tw - 10))}px`,
        );
        this.tooltip.style.setProperty(
          "top",
          `${Math.max(10, Math.min(tTop, rect.height - th - 10))}px`,
        );
      } else {
        if (this.hoveredSegment) {
          this.hoveredSegment.material.opacity = 0.0;
          this.hoveredSegment = null;
          this.vGridMat.uniforms.targetFill.value = 0.0;
          this.graphGroup.children.forEach((child) => {
            if (child.userData && child.userData.isDataElement) {
              child.userData.targetOpacity = child.userData.baseOpacity;
            }
          });
        }
        // Hide tooltip
        this.tooltip.style.setProperty("opacity", "0");
      }
    };

    this.chartWrapper.addEventListener("mousemove", (e) =>
      handleInteraction(e.clientX, e.clientY),
    );
    this.chartWrapper.addEventListener(
      "touchstart",
      (e) => handleInteraction(e.touches[0].clientX, e.touches[0].clientY),
      { passive: true },
    );
    this.chartWrapper.addEventListener(
      "touchmove",
      (e) => handleInteraction(e.touches[0].clientX, e.touches[0].clientY),
      { passive: true },
    );
    this.chartWrapper.addEventListener("mouseleave", () => {
      if (this.hoveredSegment) {
        this.hoveredSegment.material.opacity = 0.0;
        this.hoveredSegment = null;
      }
      // Hide tooltip on leave
      this.tooltip.style.setProperty('opacity', '0');
    });

    this.controls.addEventListener("start", () => {
      if (this.transition.active) {
        this.transition.active = false;
        this.applyLayout(this.currentBoxWidth, this.currentBoxDepth, true);
      }
      clearTimeout(this.inactivityTimer);
    });

    const resetInactivity = () => {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = setTimeout(() => {
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
          this.transition.endWidth = 250;
          this.transition.endDepth = this.data.length * 120;
          this.transition.endPos.copy(this.pos3D);
        }

        this.transition.endTarget.copy(this.graphCenter);

        const tempCam = this.camera.clone();
        tempCam.position.copy(this.transition.endPos);
        tempCam.lookAt(this.transition.endTarget);
        this.transition.endQuat.copy(tempCam.quaternion);

        this.transition.startTime = performance.now();
        this.transition.active = true;
      }, 5000);
    };

    this.controls.addEventListener("end", () => resetInactivity());
    resetInactivity();
  }

  updateThemeColor(newHex) {
    this.themeColor = newHex;

    while (this.graphGroup.children.length > 0) {
      const child = this.graphGroup.children[0];
      this.graphGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material))
          child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    this.hitboxes = [];

    this.buildDataStructure();
    this.buildGrids();

    this.updateDOMTheme(this.currentIsDark);
    this.updateThreeTheme(this.currentIsDark);
  }

  downloadScreenshot(filename = "enchartix-graph.png") {
    this.composer.render();

    const dataURL = this.renderer.domElement.toDataURL("image/png");

    const link = document.createElement("a");
    link.download = filename;
    link.href = dataURL;
    link.click();
    link.remove();
  }

  setupObservers() {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        this.isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.1 },
    );
    this.intersectionObserver.observe(this.chartWrapper);

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.chartWrapper.clientWidth || !this.chartWrapper.clientHeight)
        return;
      this.clientW = Math.max(this.chartWrapper.clientWidth, 10);
      this.clientH = Math.max(this.chartWrapper.clientHeight, 10);
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

    this.themeObserver = new MutationObserver(() => {
      const isNowDark =
        document.body.classList.contains("theme-dark") ||
        document.documentElement.classList.contains("theme-dark");
      if (isNowDark !== this.currentIsDark) {
        this.currentIsDark = isNowDark;
        this.updateDOMTheme(this.currentIsDark);
        this.updateThreeTheme(this.currentIsDark);
      }
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  animate() {
    if (!document.body.contains(this.chartWrapper)) {
      this.intersectionObserver.disconnect();
      this.resizeObserver.disconnect();
      if (this.themeObserver) this.themeObserver.disconnect();
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
    }

    if (this.vGridMat && this.vGridMat.uniforms.fillProgress) {
      const currentFill = this.vGridMat.uniforms.fillProgress.value;
      const targetFill = this.vGridMat.uniforms.targetFill.value;
      if (targetFill === 0.0 && currentFill > 0) {
        this.vGridMat.uniforms.fillProgress.value = 0.0;
        this.verticalGrid.visible = false;
      } else if (targetFill === 1.0 && currentFill < 1.0) {
        this.vGridMat.uniforms.fillProgress.value = Math.min(
          1.0,
          currentFill + 0.08,
        );
      }
    }

    this.graphGroup.children.forEach((child) => {
      if (child.userData && child.userData.isDataElement) {
        const mat = child.material;
        if (Math.abs(mat.opacity - child.userData.targetOpacity) > 0.01) {
          mat.opacity += (child.userData.targetOpacity - mat.opacity) * 0.25;
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

  destroy() {
    this.isVisible = false;
    if (this.animationFrameID) cancelAnimationFrame(this.animationFrameID);

    if (this.intersectionObserver) this.intersectionObserver.disconnect();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.themeObserver) this.themeObserver.disconnect();

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material))
          object.material.forEach((m) => m.dispose());
        else object.material.dispose();
      }
    });

    this.renderer.dispose();
    this.composer.dispose();
    this.controls.dispose();

    if (this.chartWrapper && this.chartWrapper.parentNode) {
      this.chartWrapper.parentNode.removeChild(this.chartWrapper);
    }
  }
}
