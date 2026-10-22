import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { fragmentShader, vertexShader } from './shaders.js';
import './styles.css';

const canvas = document.querySelector('#webgl-canvas');
const stage = document.querySelector('#stage');
const dropZone = document.querySelector('#drop-zone');
const input = document.querySelector('#image-input');
const status = document.querySelector('#status');
const imageLabel = document.querySelector('#image-label');
const fpsLabel = document.querySelector('#fps');
const histogramCanvas = document.querySelector('#histogram');
const histogramContext = histogramCanvas.getContext('2d');
const histogramRange = document.querySelector('#histogram-range');
const histogramSummary = document.querySelector('#histogram-summary');

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TEXTURE_EDGE = 2048;
const textureCanvas = document.createElement('canvas');
const textureContext = textureCanvas.getContext('2d', { willReadFrequently: false });
let sourceCanvas = createDemoCanvas();
let heightTexture;
let colorTexture;
let mesh;
let elapsedFrames = 0;
let fpsWindowStart = performance.now();
let sourceHistogram = new Uint32Array(256);

const settings = {
  height: 2.0,
  offset: 0,
  contrast: 1.0,
  invert: false,
  smoothing: 0,
  heightChannel: 'Luminance',
  blackPoint: 0,
  whitePoint: 1,
  gamma: 1,
  resolution: 256,
  colorMode: 'Source image',
  palette: 'Aurora',
  wireframe: false,
  light: 1.3,
  ambient: 0.32,
  resetSettings: () => resetSettings(),
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x07111f, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07111f, 0.035);
const camera = new THREE.PerspectiveCamera(42, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0, -6.8, 5.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 0, 0);
controls.minDistance = 2.2;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.49;

const grid = new THREE.GridHelper(12, 24, 0x1d3c55, 0x102638);
grid.position.z = -1.25;
grid.rotation.x = Math.PI / 2;
scene.add(grid);

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide,
  uniforms: {
    uHeightMap: { value: null },
    uColorMap: { value: null },
    uHeightScale: { value: settings.height },
    uHeightOffset: { value: settings.offset },
    uContrast: { value: settings.contrast },
    uInvert: { value: 0 },
    uHeightChannel: { value: 0 },
    uBlackPoint: { value: settings.blackPoint },
    uWhitePoint: { value: settings.whitePoint },
    uGamma: { value: settings.gamma },
    uLightDirection: { value: new THREE.Vector3(-0.35, -0.55, 1.0) },
    uLightIntensity: { value: settings.light },
    uAmbient: { value: settings.ambient },
    uColorMode: { value: 0 },
    uPalette: { value: 0 },
    uWireframe: { value: 0 },
  },
});

function createDemoCanvas() {
  const demo = document.createElement('canvas');
  demo.width = demo.height = 1024;
  const ctx = demo.getContext('2d');
  const image = ctx.createImageData(demo.width, demo.height);
  for (let y = 0; y < demo.height; y += 1) {
    for (let x = 0; x < demo.width; x += 1) {
      const nx = (x / demo.width - 0.5) * 2;
      const ny = (y / demo.height - 0.5) * 2;
      const radial = Math.hypot(nx, ny);
      const ridges = Math.sin(nx * 9.0 + Math.sin(ny * 4.0)) * Math.cos(ny * 10.0);
      const crater = Math.exp(-((nx + 0.28) ** 2 + (ny - 0.15) ** 2) * 13);
      const island = Math.exp(-(nx ** 2 + ny ** 2) * 2.1);
      const value = Math.max(0, Math.min(1, 0.35 + ridges * 0.13 + island * 0.43 - crater * 0.42 - radial * 0.13));
      const index = (y * demo.width + x) * 4;
      image.data[index] = value * 105;
      image.data[index + 1] = 25 + value * 170;
      image.data[index + 2] = 58 + value * 180;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return demo;
}

function fitCanvasToTextureLimit(source) {
  const scale = Math.min(1, MAX_TEXTURE_EDGE / Math.max(source.width, source.height));
  textureCanvas.width = Math.max(1, Math.round(source.width * scale));
  textureCanvas.height = Math.max(1, Math.round(source.height * scale));
}

function buildSourceHistogram() {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const pixels = sourceCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const channelIndex = ['Luminance', 'Red', 'Green', 'Blue', 'Alpha'].indexOf(settings.heightChannel);
  const nextHistogram = new Uint32Array(256);
  const sampleStep = Math.max(1, Math.floor((width * height) / 300000));

  for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4 * sampleStep) {
    const red = pixels[pixelIndex];
    const green = pixels[pixelIndex + 1];
    const blue = pixels[pixelIndex + 2];
    const alpha = pixels[pixelIndex + 3];
    const value = channelIndex === 0
      ? Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)
      : [red, green, blue, alpha][channelIndex - 1];
    nextHistogram[value] += 1;
  }
  sourceHistogram = nextHistogram;
}

function percentile(histogram, total, target) {
  const threshold = total * target;
  let count = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    count += histogram[index];
    if (count >= threshold) return index;
  }
  return 255;
}

function drawHistogram() {
  const displayHistogram = new Uint32Array(256);
  const levelRange = Math.max(settings.whitePoint - settings.blackPoint, 0.001);
  let total = 0;
  for (let index = 0; index < sourceHistogram.length; index += 1) {
    const adjusted = Math.pow(Math.min(1, Math.max(0, (index / 255 - settings.blackPoint) / levelRange)), settings.gamma);
    displayHistogram[Math.round(adjusted * 255)] += sourceHistogram[index];
    total += sourceHistogram[index];
  }
  const max = Math.max(...displayHistogram, 1);
  const { width, height } = histogramCanvas;
  histogramContext.clearRect(0, 0, width, height);
  const fill = histogramContext.createLinearGradient(0, 0, width, 0);
  fill.addColorStop(0, '#318fbd');
  fill.addColorStop(0.5, '#4ee3d7');
  fill.addColorStop(1, '#ffe08a');
  histogramContext.fillStyle = fill;
  for (let index = 0; index < displayHistogram.length; index += 1) {
    const barHeight = Math.max(1, Math.round((displayHistogram[index] / max) * (height - 4)));
    histogramContext.fillRect(index, height - barHeight, 1, barHeight);
  }
  histogramContext.fillStyle = 'rgba(219, 247, 255, 0.36)';
  histogramContext.fillRect(Math.round(settings.blackPoint * width), 0, 1, height);
  histogramContext.fillRect(Math.round(settings.whitePoint * width), 0, 1, height);
  const p05 = percentile(displayHistogram, total, 0.05);
  const p95 = percentile(displayHistogram, total, 0.95);
  histogramRange.textContent = `P05 ${p05} · P95 ${p95}`;
  histogramSummary.textContent = `${settings.heightChannel} · ${Math.round(settings.blackPoint * 255)}–${Math.round(settings.whitePoint * 255)} · γ ${settings.gamma.toFixed(2)}`;
}

function refreshAnalysis(rebuildHistogram = false) {
  if (rebuildHistogram) buildSourceHistogram();
  drawHistogram();
}

function makeTexture(canvasElement) {
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function refreshTextures() {
  fitCanvasToTextureLimit(sourceCanvas);
  textureContext.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  textureContext.filter = settings.smoothing > 0 ? `blur(${settings.smoothing}px)` : 'none';
  textureContext.drawImage(sourceCanvas, 0, 0, textureCanvas.width, textureCanvas.height);
  textureContext.filter = 'none';

  const nextHeightTexture = makeTexture(textureCanvas);
  const nextColorTexture = makeTexture(sourceCanvas);
  if (heightTexture) heightTexture.dispose();
  if (colorTexture) colorTexture.dispose();
  heightTexture = nextHeightTexture;
  colorTexture = nextColorTexture;
  material.uniforms.uHeightMap.value = heightTexture;
  material.uniforms.uColorMap.value = colorTexture;
}

function rebuildSurface() {
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
  }
  const geometry = new THREE.PlaneGeometry(6.8, 6.8, settings.resolution, settings.resolution);
  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}

function applySettings() {
  material.uniforms.uHeightScale.value = settings.height;
  material.uniforms.uHeightOffset.value = settings.offset;
  material.uniforms.uContrast.value = settings.contrast;
  material.uniforms.uInvert.value = Number(settings.invert);
  material.uniforms.uHeightChannel.value = ['Luminance', 'Red', 'Green', 'Blue', 'Alpha'].indexOf(settings.heightChannel);
  material.uniforms.uBlackPoint.value = settings.blackPoint;
  material.uniforms.uWhitePoint.value = settings.whitePoint;
  material.uniforms.uGamma.value = settings.gamma;
  material.uniforms.uLightIntensity.value = settings.light;
  material.uniforms.uAmbient.value = settings.ambient;
  material.uniforms.uWireframe.value = Number(settings.wireframe);
  material.uniforms.uColorMode.value = ['Source image', 'Grayscale', 'Height map'].indexOf(settings.colorMode);
  material.uniforms.uPalette.value = ['Aurora', 'Topographic', 'Magenta'].indexOf(settings.palette);
}

function setStatus(message, type = '') {
  status.textContent = message;
  status.className = `status ${type}`;
  if (message) window.setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 3600);
}

async function loadImage(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    setStatus('Please select a PNG, JPG, or WebP image.', 'error');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setStatus('That image is larger than 20 MB. Choose a smaller file.', 'error');
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_TEXTURE_EDGE / Math.max(bitmap.width, bitmap.height));
    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = Math.max(1, Math.round(bitmap.width * scale));
    nextCanvas.height = Math.max(1, Math.round(bitmap.height * scale));
    nextCanvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    sourceCanvas = nextCanvas;
    refreshTextures();
    refreshAnalysis(true);
    imageLabel.textContent = `${file.name} · ${nextCanvas.width} × ${nextCanvas.height}`;
    dropZone.classList.add('compact');
    setStatus('Image loaded. Adjust the controls to shape the surface.', 'success');
  } catch (error) {
    console.error(error);
    setStatus('The image could not be decoded.', 'error');
  }
}

function resetView() {
  camera.position.set(0, -6.8, 5.2);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resetSettings() {
  Object.assign(settings, {
    height: 2.0, offset: 0, contrast: 1.0, invert: false, smoothing: 0,
    heightChannel: 'Luminance', blackPoint: 0, whitePoint: 1, gamma: 1,
    resolution: 256, colorMode: 'Source image', palette: 'Aurora', wireframe: false,
    light: 1.3, ambient: 0.32,
  });
  refreshTextures();
  rebuildSurface();
  applySettings();
  refreshAnalysis(true);
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  setStatus('Surface controls reset.', 'success');
}

const gui = new GUI({ title: 'SURFACE CONTROLS', width: 278 });
const displacement = gui.addFolder('Displacement');
displacement.add(settings, 'height', 0, 4, 0.01).name('Height').onChange(applySettings);
displacement.add(settings, 'offset', -0.5, 0.5, 0.01).name('Offset').onChange(applySettings);
displacement.add(settings, 'contrast', 0.2, 3, 0.01).name('Contrast').onChange(applySettings);
displacement.add(settings, 'invert').name('Invert').onChange(applySettings);
displacement.add(settings, 'smoothing', 0, 12, 1).name('Smoothing').onFinishChange(refreshTextures);
const heightMap = gui.addFolder('Height map');
heightMap.add(settings, 'heightChannel', ['Luminance', 'Red', 'Green', 'Blue', 'Alpha']).name('Source channel').onChange(() => {
  applySettings();
  refreshAnalysis(true);
});
heightMap.add(settings, 'blackPoint', 0, 0.95, 0.01).name('Black point').onChange(() => {
  if (settings.blackPoint >= settings.whitePoint) settings.whitePoint = Math.min(1, settings.blackPoint + 0.01);
  applySettings();
  refreshAnalysis();
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
});
heightMap.add(settings, 'whitePoint', 0.05, 1, 0.01).name('White point').onChange(() => {
  if (settings.whitePoint <= settings.blackPoint) settings.blackPoint = Math.max(0, settings.whitePoint - 0.01);
  applySettings();
  refreshAnalysis();
  gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
});
heightMap.add(settings, 'gamma', 0.2, 3, 0.01).name('Gamma').onChange(() => {
  applySettings();
  refreshAnalysis();
});
const appearance = gui.addFolder('Appearance');
appearance.add(settings, 'colorMode', ['Source image', 'Grayscale', 'Height map']).name('Color mode').onChange(applySettings);
appearance.add(settings, 'palette', ['Aurora', 'Topographic', 'Magenta']).name('Color ramp').onChange(applySettings);
appearance.add(settings, 'wireframe').name('Grid overlay').onChange(applySettings);
appearance.add(settings, 'light', 0, 2.5, 0.01).name('Light strength').onChange(applySettings);
appearance.add(settings, 'ambient', 0, 1, 0.01).name('Ambient light').onChange(applySettings);
const geometryControls = gui.addFolder('Geometry');
geometryControls.add(settings, 'resolution', { Low: 96, Medium: 192, High: 256, Ultra: 384 }).name('Detail').onChange(rebuildSurface);
gui.add(settings, 'resetSettings').name('Reset controls');

input.addEventListener('change', (event) => loadImage(event.target.files[0]));
['dragenter', 'dragover'].forEach((eventName) => {
  stage.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('dragging');
  });
});
['dragleave', 'drop'].forEach((eventName) => {
  stage.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragging');
  });
});
stage.addEventListener('drop', (event) => loadImage(event.dataTransfer.files[0]));
document.querySelector('#reset-view').addEventListener('click', resetView);
document.querySelector('#save-image').addEventListener('click', () => {
  renderer.render(scene, camera);
  const anchor = document.createElement('a');
  anchor.download = 'image-surface.png';
  anchor.href = canvas.toDataURL('image/png');
  anchor.click();
});

window.addEventListener('resize', () => {
  const { clientWidth: width, clientHeight: height } = stage;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});

refreshTextures();
rebuildSurface();
applySettings();
refreshAnalysis(true);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  elapsedFrames += 1;
  const now = performance.now();
  if (now - fpsWindowStart >= 750) {
    fpsLabel.textContent = `${Math.round((elapsedFrames * 1000) / (now - fpsWindowStart))} FPS`;
    elapsedFrames = 0;
    fpsWindowStart = now;
  }
}

animate();
