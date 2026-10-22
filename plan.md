# Image-to-3D Surface Visualizer — Build Plan

## 1. Project goal

Build a browser-based tool that turns a 2D image into an interactive 3D height-field surface. Image luminance (or a precomputed height map) controls vertex displacement, while users can adjust the visual result in real time.

### Core outcomes

- Upload a JPG, PNG, or WebP image.
- Convert its pixel data into a height map.
- Render a displaced Three.js plane with custom GLSL shaders.
- Orbit, zoom, and inspect the resulting surface.
- Adjust height, smoothing/detail, resolution, lighting, and color mapping at runtime.
- Optionally preprocess source images with Python, OpenCV, and NumPy.

## 2. Technology choices

| Area | Choice | Purpose |
| --- | --- | --- |
| Client app | Vite + vanilla JavaScript | Fast local development and a lightweight frontend. |
| 3D rendering | Three.js + WebGL 2 | Scene management, camera controls, GPU rendering. |
| Surface rendering | GLSL vertex and fragment shaders | GPU-side displacement, normals, lighting, and color ramps. |
| UI controls | lil-gui (or dat.GUI) | Compact real-time parameter controls. |
| Image preprocessing | Python, OpenCV, NumPy | Optional denoising, normalization, edge detection, and exported maps. |
| Deployment | GitHub Pages, Netlify, or Vercel | Static hosting for the frontend. |

## 3. Repository structure

```text
Image-to-3D-Surface-Visualizer/
├── src/
│   ├── main.js                 # App bootstrap and render loop
│   ├── scene.js                # Renderer, camera, lights, controls
│   ├── surface.js              # Plane mesh, textures, shader uniforms
│   ├── image-loader.js         # File upload, validation, texture creation
│   ├── ui.js                   # Parameter panel and events
│   ├── shaders/
│   │   ├── surface.vert.glsl   # Height-driven vertex displacement
│   │   └── surface.frag.glsl   # Lighting and height color mapping
│   └── styles.css
├── scripts/
│   └── preprocess_image.py     # Optional OpenCV preprocessing CLI
├── public/
│   └── examples/               # Small sample input images/maps
├── README.md
└── plan.md
```

## 4. Implementation phases

### Phase 1 — Project scaffold and base scene

1. Initialize the Vite project and install `three` and `lil-gui`.
2. Create a full-window canvas layout with an upload panel and a help/status area.
3. Configure a Three.js renderer with:
   - antialiasing enabled;
   - device-pixel-ratio clamping for performance;
   - sRGB color output;
   - responsive resize handling.
4. Add a perspective camera, neutral background, grid/axes helpers for development, and `OrbitControls`.
5. Establish an animation loop using `requestAnimationFrame`.

**Done when:** a responsive, controllable Three.js scene renders smoothly in the browser.

### Phase 2 — Image ingestion and height-map preparation

1. Add drag-and-drop and file-picker input for JPG, PNG, and WebP files.
2. Validate MIME type and apply a practical image-size limit before decoding.
3. Draw the uploaded image to an offscreen canvas and create a Three.js texture.
4. Use luminance as the default height signal:

   ```text
   luminance = 0.2126 × R + 0.7152 × G + 0.0722 × B
   ```

5. Allow users to choose whether the original image or a grayscale map is used for the visible surface color.
6. Provide a bundled demo image so the app is useful on first load.

**Done when:** an image upload reliably produces a texture ready for sampling in shaders.

### Phase 3 — GPU-displaced surface

1. Create a high-segment `PlaneGeometry` (for example, 256×256 segments initially).
2. Build a `ShaderMaterial` that accepts image texture and rendering controls as uniforms.
3. In the vertex shader:
   - sample the height texture using `uv`;
   - convert sampled color to luminance;
   - apply `heightScale`, bias, inversion, and optional contrast;
   - displace the vertex along its local normal.
4. Pass height, UV, and transformed normals or positions to the fragment shader.
5. In the fragment shader, implement image-color and height-ramp modes.
6. Add a basic Lambert/Blinn-Phong lighting model or derivative-based normal reconstruction for surface detail.

**Done when:** bright and dark areas visibly create raised and recessed terrain-like geometry.

### Phase 4 — Real-time interaction controls

Expose controls through `lil-gui` and keep all adjustments uniform-driven where possible so that they do not rebuild the mesh.

| Control | Initial range | Effect |
| --- | --- | --- |
| Height | 0–3 | Strength of vertex displacement. |
| Height offset | -1–1 | Moves the midpoint of the surface. |
| Invert | on/off | Swaps peaks and valleys. |
| Contrast | 0.25–3 | Makes height changes more or less pronounced. |
| Surface resolution | 64–512 | Rebuilds plane subdivisions when changed. |
| Smoothing | 0–10 | Controls blur/preprocessing or sampling behavior. |
| Color mode | image/grayscale/heatmap | Chooses the fragment coloring strategy. |
| Color ramp | selectable palettes | Changes height-based colors. |
| Wireframe | on/off | Helps inspect mesh detail. |
| Light direction/intensity | interactive | Reveals form and detail. |

**Done when:** all controls update the result immediately and remain understandable on desktop and mobile layouts.

### Phase 5 — Python preprocessing pipeline

Implement `scripts/preprocess_image.py` as a command-line helper for cases where stronger cleanup is desirable before browser rendering.

1. Load an image with OpenCV.
2. Convert it to grayscale.
3. Apply optional denoising (Gaussian, median, or bilateral filter).
4. Normalize intensities to the 0–255 range.
5. Optionally apply CLAHE or contrast adjustment.
6. Generate optional maps:
   - normalized grayscale height map;
   - blurred/smoothed height map;
   - Canny edge map;
   - combined height-plus-edge map.
7. Write PNG outputs and emit concise metadata (dimensions and settings used).

Suggested interface:

```powershell
python scripts/preprocess_image.py input.jpg --output public/generated --blur 3 --denoise bilateral --edges
```

**Done when:** a noisy source image can be transformed into predictable height/edge maps that the browser app can load.

### Phase 6 — Performance and robustness

1. Benchmark with 1K, 2K, and oversized input images on desktop and mobile hardware.
2. Limit texture dimensions before upload to the GPU (for example, 2048 px on the longest edge by default).
3. Cap render pixel ratio to avoid excessive fill rate on high-DPI displays.
4. Offer low/medium/high mesh-detail presets instead of an unrestricted segment count.
5. Reuse textures and dispose replaced textures, materials, and geometry.
6. Pause rendering when the page is hidden if no animated effect is active.
7. Display a clear message for unsupported images, decode errors, or WebGL failures.

**Target:** maintain approximately 60 FPS on a modern laptop at the default quality preset.

### Phase 7 — Polish, accessibility, and release

1. Add keyboard-accessible upload and control interactions.
2. Include labels, value readouts, and color mode descriptions.
3. Add reset, screenshot, and export-height-map actions.
4. Document supported image types, preprocessing usage, and known limits.
5. Add a short GIF/video and screenshots to the README.
6. Build production assets and deploy to a static host.

## 5. Shader design notes

The first version should use a texture in both shaders. This keeps large image data on the GPU and avoids expensive CPU updates during control changes.

```glsl
// Conceptual vertex-shader flow
float h = luminance(texture(uHeightMap, uv).rgb);
h = (h - 0.5 + uHeightOffset) * uContrast;
if (uInvert) h = -h;
vec3 displaced = position + normal * (h * uHeightScale);
gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
```

For visually credible lighting, start with a directional light and reconstruct an approximate normal in the fragment shader from nearby height samples. Add a simpler fallback for devices that struggle with derivative sampling.

## 6. Validation checklist

- Uploading, replacing, and resetting images does not leak GPU resources.
- The app handles portrait, landscape, square, and transparent PNG images.
- Invert, height, and contrast visibly affect displacement.
- Color modes are visually distinct and preserve expected texture color where applicable.
- Camera rotation, pan, and zoom work without jitter.
- The default demo remains interactive near 60 FPS on the target machine.
- Python-generated maps load correctly in the browser.
- Production build completes with no console errors.

## 7. Milestone order

1. Base Three.js scene.
2. Image upload and texture display on a flat plane.
3. Shader-driven height displacement.
4. Lighting and color modes.
5. Real-time controls.
6. Python preprocessing utility.
7. Performance tuning, documentation, and deployment.

## 8. First implementation slice

Start with the smallest end-to-end experience:

1. Load one bundled image.
2. Render it on a segmented plane.
3. Displace vertices from luminance in a custom vertex shader.
4. Add orbit controls plus height and invert controls.
5. Add file upload after the core surface is visually correct.

This sequence proves the central technical idea before investing in preprocessing, exports, or advanced UI polish.

## 9. Expanded feature roadmap

The following additions turn the project from a strong graphics demo into a more capable visual-analysis and content-creation tool. Build them in release-sized groups so the app remains testable and responsive.

### Release 1.1 — Better image-to-height conversion

The default luminance approach is fast, but not every photograph has brightness that represents physical depth. Add tools that make the conversion more deliberate.

| Feature | User value | Implementation direction |
| --- | --- | --- |
| Channel selection | Use red, green, blue, alpha, or luminance as the height source. | Add a shader uniform or generate a single-channel canvas map. |
| Histogram preview | Show whether the image has enough tonal range for displacement. | Draw a 256-bin histogram from canvas pixel data. |
| Black/white points | Remap the useful range without changing the source image. | Add `minHeight` and `maxHeight` uniforms and clamp/remap samples. |
| Gamma curve | Reveal shadows or protect highlights. | Apply `pow(height, gamma)` in the vertex shader. |
| Height-map paint mask | Let users limit displacement to selected image regions. | Maintain a second canvas texture for a brush-painted mask. |
| Edge-preserving smoothing | Remove noise without erasing strong features. | Add bilateral filtering to the Python tool and make its settings visible in metadata. |
| Normal-map generation | Add apparent surface detail without increasing geometry density. | Generate Sobel normal maps in Python or sample adjacent height texels in GLSL. |

**Acceptance criteria:** a user can turn a low-contrast or noisy photo into a controllable height field without leaving the application for basic corrections.

### Release 1.2 — Visualization and inspection modes

1. **Split compare view:** a draggable divider comparing original image, height map, and rendered surface.
2. **Orthographic camera:** switch between perspective beauty shots and measurement-friendly top-down inspection.
3. **Contour lines:** overlay configurable isolines by quantizing normalized height in the fragment shader.
4. **Cross-section tool:** click or drag a line across the plane and display its elevation profile in a small Canvas/SVG chart.
5. **Lighting presets:** studio, sunrise, technical clay, and x-ray/normal visualizations.
6. **Material presets:** clay, water, brushed metal, lava, terrain, and monochrome print.
7. **Environment lighting:** support a small set of compressed HDR environment maps for physically inspired reflections.
8. **Stereo/anaglyph mode:** optional demonstration mode for depth perception and presentations.

### Release 1.3 — Creation, sharing, and export

| Export | Notes |
| --- | --- |
| PNG screenshot | Already present; add transparent background and resolution scale options. |
| Height map PNG | Export the processed grayscale map exactly as sent to the displacement shader. |
| Normal map PNG | Export a Sobel/derivative-based normal map for game-engine workflows. |
| GLB / glTF mesh | Read displaced vertices back or calculate them on the CPU at an export-only resolution. Include color texture/material. |
| OBJ mesh | Offer a broadly compatible geometry-only alternative. |
| Project preset JSON | Save image-conversion and appearance settings; allow import later. |
| Shareable URL state | Serialize non-image control settings in the URL hash. Do not include uploaded image data by default. |
| Short turntable video | Render a fixed camera orbit to frames, then encode client-side only when performance permits. |

For mesh export, clearly label the resolution and expected triangle count before generation. High-resolution mesh output can be expensive even when the live shader remains smooth.

### Release 1.4 — Manual sculpting and compositing

1. Add a **sculpt brush** with raise, lower, smooth, flatten, and noise modes.
2. Use a separate editable height texture so original image data can always be restored.
3. Support pressure-sensitive input where Pointer Events expose it, while retaining mouse/touch fallbacks.
4. Add undo/redo with a bounded history of compressed texture snapshots.
5. Allow layers: source height, generated noise, paint mask, and a second uploaded height map.
6. Implement blend modes such as add, subtract, multiply, max, min, and overlay.
7. Include before/after snapshots so destructive-seeming adjustments stay reversible.

**Technical note:** for the initial implementation, use a 2D canvas as the editable source and upload changes to a `CanvasTexture`. Move to render-target ping-pong textures only if brush latency becomes a bottleneck.

## 10. Advanced rendering plan

### Geometry quality

- Add adaptive resolution presets based on image dimensions and detected hardware capability.
- Explore tessellation-like subdivision through displaced grid levels or a tile/quadtree approach for large datasets.
- Add a low-detail proxy during active camera movement, restoring full detail when movement stops.
- Consider instanced tiles for very large height fields rather than one oversized geometry.

### Surface realism

- Reconstruct normals from central height differences, scaled by texture texel size and displacement scale.
- Add optional ambient occlusion approximation and rim light for form readability.
- Add triplanar color mapping for generated materials, avoiding stretching on steep displacement.
- Add waterline coloring based on a configurable elevation.
- Provide a physical scale setting (for example, millimetres or metres per image pixel) for technical workflows.

### Post-processing

- Add configurable tone mapping and exposure.
- Optional bloom for emissive heat-map modes.
- FXAA/SMAA anti-aliasing preset for lower-end devices.
- Depth-of-field still-render mode only; keep it disabled during interaction.

## 11. Python processing expansion

Enhance the preprocessing script into a reproducible pipeline, without making Python mandatory for the web app.

1. Accept a JSON/YAML processing preset, alongside CLI flags.
2. Save a sidecar metadata file containing input hash, dimensions, filter parameters, and generated outputs.
3. Add Sobel, Scharr, Laplacian, and unsharp-mask options.
4. Add a `--depth-model` extension point for future monocular-depth model output, while keeping model downloads out of the default installation.
5. Batch-process a directory of images with predictable output naming.
6. Add image-statistics output: min/max/mean/stddev, clipping percentage, and histogram CSV.
7. Create tests using small checked-in fixture images and expected output properties.

Example future command:

```powershell
python scripts/preprocess_image.py .\photos --batch --preset .\presets\terrain.json --output .\public\generated --normal-map --metadata
```

## 12. Data, privacy, and safety choices

- Process uploaded images entirely in the browser by default; do not upload them to a server.
- Display a clear local-processing notice beside the upload control.
- Keep image files out of URL state and project presets unless the user explicitly exports a bundled project.
- Place practical image dimension, memory, and file-size limits before decoding.
- Strip no metadata on input because it never leaves the browser; strip it from any exported derived image where browser APIs allow it.
- Declare that outputs are visualizations, not calibrated scientific measurements, unless a physical calibration workflow is explicitly added.

## 13. Accessibility and product UX

1. Provide an accessible non-WebGL fallback message with preprocessing/export guidance.
2. Ensure all custom controls are keyboard-operable and have visible focus states.
3. Include clear text descriptions for palettes rather than relying on color alone.
4. Offer reduced-motion behavior: disable auto-orbit and animated UI transitions.
5. Make range controls expose their numeric values and support keyboard increments.
6. Add a guided empty state: upload → choose height channel → set height → inspect → export.
7. Persist non-sensitive UI preferences locally, with a visible “clear saved preferences” action.
8. Include a responsive compact panel for phones and a touch-friendly camera-control hint.

## 14. Testing strategy

| Layer | Checks |
| --- | --- |
| Unit | Luminance conversion, height remapping, input validation, preset serialization, and preprocessing helpers. |
| Shader smoke tests | Compile shaders in headless browser/WebGL-capable CI and fail on compiler errors. |
| Integration | Upload fixtures, change controls, reset state, export a PNG, and verify canvas output is non-empty. |
| Visual regression | Capture representative scenes for every color mode and compare with a permitted pixel-difference threshold. |
| Performance | Record FPS, GPU frame time where available, texture dimensions, and memory for baseline, 1K, and 2K cases. |
| Accessibility | Automated keyboard/ARIA checks plus a manual screen-reader pass for the upload and controls workflow. |

Add a GitHub Actions workflow after the feature set stabilizes:

1. Install Node and Python dependencies.
2. Run the production build and Python syntax/tests.
3. Run browser smoke tests.
4. Publish a preview artifact for pull requests.

## 15. Updated milestone plan

| Milestone | Deliverable | Priority |
| --- | --- | --- |
| M1 | Uploadable shader-displaced surface, camera, controls, and PNG capture. | Complete |
| M2 | Better height conversion: channel controls, black/white points, gamma, histogram. | Next |
| M3 | Inspection: split view, contours, cross-sections, camera and lighting presets. | High |
| M4 | Creator exports: height/normal PNG, preset JSON, GLB/OBJ. | High |
| M5 | OpenCV pipeline presets, batch mode, metadata, and test fixtures. | Medium |
| M6 | Sculpt tools, masks, compositing layers, undo/redo. | Medium |
| M7 | Advanced rendering, adaptive detail, post-processing, and performance telemetry. | Medium |
| M8 | CI, visual regression, accessibility audit, deployment documentation. | High before release |

## 16. Portfolio-ready enhancements

To make the project especially compelling in a portfolio or resume, include these presentation pieces:

- A gallery of 4–6 carefully chosen source images with corresponding height maps and final surfaces.
- One short screen recording showing an image upload, live displacement adjustment, and a GLB/PNG export.
- An architecture diagram showing image input → optional Python/OpenCV preparation → GPU texture → GLSL displacement → render/export.
- A performance table comparing low, medium, and high geometry presets on the development machine.
- A technical note explaining why GPU texture sampling is used for interactive rendering while CPU processing is reserved for offline export/preprocessing.
- An explicit limitations section: brightness is not inherently depth, dense meshes cost memory, and client WebGL support varies by device.
