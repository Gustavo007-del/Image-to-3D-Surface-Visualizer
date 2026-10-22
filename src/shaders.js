export const vertexShader = /* glsl */ `
  uniform sampler2D uHeightMap;
  uniform float uHeightScale;
  uniform float uHeightOffset;
  uniform float uContrast;
  uniform float uInvert;
  uniform float uHeightChannel;
  uniform float uBlackPoint;
  uniform float uWhitePoint;
  uniform float uGamma;

  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPosition;

  float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  float selectedChannel(vec4 color) {
    if (uHeightChannel < 0.5) return luminance(color.rgb);
    if (uHeightChannel < 1.5) return color.r;
    if (uHeightChannel < 2.5) return color.g;
    if (uHeightChannel < 3.5) return color.b;
    return color.a;
  }

  void main() {
    vUv = uv;
    float sampledHeight = selectedChannel(texture2D(uHeightMap, uv));
    float levelRange = max(uWhitePoint - uBlackPoint, 0.001);
    sampledHeight = clamp((sampledHeight - uBlackPoint) / levelRange, 0.0, 1.0);
    sampledHeight = pow(sampledHeight, max(uGamma, 0.01));
    float centeredHeight = (sampledHeight - 0.5 + uHeightOffset) * uContrast;
    centeredHeight *= mix(1.0, -1.0, uInvert);
    vHeight = centeredHeight;

    vec3 displacedPosition = position + normal * (centeredHeight * uHeightScale);
    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uColorMap;
  uniform vec3 uLightDirection;
  uniform float uLightIntensity;
  uniform float uAmbient;
  uniform float uColorMode;
  uniform float uPalette;
  uniform float uWireframe;

  varying vec2 vUv;
  varying float vHeight;
  varying vec3 vWorldPosition;

  vec3 heatColor(float value, float palette) {
    value = clamp(value, 0.0, 1.0);
    if (palette < 0.5) {
      return mix(vec3(0.035, 0.08, 0.16), vec3(0.08, 0.85, 0.92), smoothstep(0.0, 0.56, value))
           + mix(vec3(0.0), vec3(0.98, 0.54, 0.12), smoothstep(0.52, 1.0, value));
    }
    if (palette < 1.5) {
      vec3 deep = vec3(0.03, 0.12, 0.25);
      vec3 land = vec3(0.18, 0.72, 0.42);
      vec3 summit = vec3(0.94, 0.91, 0.70);
      return mix(mix(deep, land, smoothstep(0.0, 0.58, value)), summit, smoothstep(0.54, 1.0, value));
    }
    return mix(vec3(0.16, 0.025, 0.22), vec3(1.0, 0.2, 0.55), value);
  }

  void main() {
    vec3 sourceColor = texture2D(uColorMap, vUv).rgb;
    float height = clamp(vHeight + 0.5, 0.0, 1.0);
    vec3 baseColor = sourceColor;
    if (uColorMode > 0.5 && uColorMode < 1.5) {
      baseColor = vec3(height);
    } else if (uColorMode > 1.5) {
      baseColor = heatColor(height, uPalette);
    }

    vec3 dx = dFdx(vWorldPosition);
    vec3 dy = dFdy(vWorldPosition);
    vec3 normal = normalize(cross(dx, dy));
    if (!gl_FrontFacing) normal *= -1.0;
    float diffuse = max(dot(normal, normalize(uLightDirection)), 0.0);
    vec3 litColor = baseColor * (uAmbient + diffuse * uLightIntensity);

    if (uWireframe > 0.5) {
      float grid = min(min(fract(vUv.x * 64.0), 1.0 - fract(vUv.x * 64.0)), min(fract(vUv.y * 64.0), 1.0 - fract(vUv.y * 64.0)));
      litColor = mix(vec3(0.04, 0.95, 0.92), litColor, smoothstep(0.0, 0.018, grid));
    }
    gl_FragColor = vec4(litColor, 1.0);
  }
`;
