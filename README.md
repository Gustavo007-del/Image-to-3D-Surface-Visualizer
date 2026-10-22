# Image → 3D Surface Visualizer

An interactive browser tool that translates image luminance into a GPU-displaced 3D surface. It uses Three.js, WebGL, and custom GLSL shaders for real-time exploration of height, smoothing, lighting, and color maps.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL that Vite prints (usually `http://localhost:5173`). Drag in a PNG, JPG, or WebP image, then orbit the mesh and tune its shape from the control panel.

## Features

- Image upload and drag/drop support, with a procedural terrain demo on launch.
- GLSL vertex displacement driven by image luminance.
- Live controls for height, contrast, offset, inversion, smoothing, mesh detail, lighting, and palettes.
- Height-map controls for source channel, black/white points, and gamma correction, plus a live distribution histogram.
- Image, grayscale, and height-map rendering modes.
- PNG capture of the current canvas.
- Responsive camera controls and FPS indicator.

## Optional OpenCV preprocessing

For cleaner height maps, install the Python dependencies and process an image before loading it in the app:

```powershell
python -m pip install -r requirements.txt
python scripts/preprocess_image.py .\input.jpg --output .\public\generated --denoise bilateral --blur 3 --clahe --edges
```

The script produces a normalized grayscale `*_height.png`; with `--edges`, it also writes edge and combined maps.

## Project layout

```text
src/main.js              Scene, upload flow, GUI, and rendering loop
src/shaders.js           GLSL displacement and lighting shaders
src/styles.css           Responsive application styling
scripts/preprocess_image.py  Optional OpenCV map generator
```

## Build

```powershell
npm run build
```
