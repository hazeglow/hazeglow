import { MAX_MESH_POINTS, MAX_STOPS } from "./config";

export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

const GLYPH_ROWS = [
  [".....", ".....", ".....", ".....", "..#.."],
  [".....", "..#..", ".....", "..#..", "....."],
  [".....", ".....", ".###.", ".....", "....."],
  [".....", "..#..", ".###.", "..#..", "....."],
  [".....", ".###.", ".....", ".###.", "....."],
  ["#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  [".###.", "#...#", "#...#", "#...#", ".###."],
  [".###.", "#...#", ".###.", "#...#", ".###."],
  [".###.", "#.#.#", "#.###", "#....", ".####"],
  [".#.#.", "#####", ".#.#.", "#####", ".#.#."],
];

function glyphBits(rows: string[]): number {
  let bits = 0;
  rows.forEach((row, y) => {
    for (let x = 0; x < 5; x++) if (row[x] === "#") bits |= 1 << (x + 5 * y);
  });
  return bits;
}

function litPixels(bits: number): number {
  return bits.toString(2).replace(/0/g, "").length;
}

function head(): string {
  return `#version 300 es
precision highp float;
precision highp int;

`;
}

function uniforms(): string {
  return `uniform vec2 u_resolution;
uniform float u_time;
uniform float u_loop;
uniform vec2 u_seed;
uniform uint u_grainSeed;
uniform int u_shape;
uniform int u_motion;
uniform vec2 u_center;
uniform vec2 u_size;
uniform float u_roundness;
uniform float u_softness;
uniform float u_rotation;
uniform float u_rampDirection;
uniform float u_angle;
uniform float u_warp;
uniform float u_warpScale;
uniform float u_grain;
uniform vec3 u_palette[${MAX_STOPS}];
uniform int u_paletteCount;
uniform vec3 u_background;
uniform vec2 u_meshPoints[${MAX_MESH_POINTS}];
uniform vec3 u_meshColors[${MAX_MESH_POINTS}];
uniform int u_meshCount;
uniform int u_effect;
uniform float u_effectSize;
uniform float u_effectAmount;
uniform vec2 u_pointer;
uniform float u_pointerForce;

`;
}

function constants(glyphs: number[]): string {
  return `const int SHAPE_BAND = 1;
const int SHAPE_BLOB = 2;
const int SHAPE_RING = 3;
const int SHAPE_MESH = 4;
const float RING_RADIUS = 0.68;
const float RING_HALF_WIDTH = 0.32;
const float POINTER_REACH = 0.1;
const float POINTER_PULL = 1.6;
const float POINTER_PUSH = 0.8;
const float POINTER_PUSH_REACH = 0.25;
const int MOTION_DRIFT = 1;
const int MOTION_BREATHE = 2;
const int MOTION_FLOW = 3;
const int EFFECT_DITHER = 1;
const int EFFECT_ASCII = 2;
const int EFFECT_HALFTONE = 3;
const int EFFECT_PIXELATE = 4;
const int EFFECT_GLASS = 5;
const int GLYPH_COUNT = ${glyphs.length};
const int GLYPHS[GLYPH_COUNT] = int[GLYPH_COUNT](${glyphs.join(", ")});
const float TAU = 6.28318530718;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const mat2 HALFTONE_ROTATION = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678);

`;
}

function hashes(): string {
  return `uint hash(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

`;
}

function noise(): string {
  return `uint hash3(ivec3 p) {
  return hash(uint(p.x) + hash(uint(p.y) + hash(uint(p.z))));
}

vec3 gradientAt(ivec3 p) {
  uint h = hash3(p);
  vec3 g = vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) / 511.5 - 1.0;
  return normalize(g + 1e-4);
}

float gradientNoise(vec3 p) {
  vec3 cell = floor(p);
  ivec3 i = ivec3(cell);
  vec3 f = p - cell;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(gradientAt(i), f);
  float n100 = dot(gradientAt(i + ivec3(1, 0, 0)), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(gradientAt(i + ivec3(0, 1, 0)), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(gradientAt(i + ivec3(1, 1, 0)), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(gradientAt(i + ivec3(0, 0, 1)), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(gradientAt(i + ivec3(1, 0, 1)), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(gradientAt(i + ivec3(0, 1, 1)), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(gradientAt(i + ivec3(1, 1, 1)), f - vec3(1.0, 1.0, 1.0));
  float front = mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y);
  float back = mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y);
  return mix(front, back, u.z) * 1.6;
}

vec2 warpField(vec2 p, float z) {
  vec3 q = vec3(p, z);
  return vec2(gradientNoise(q), gradientNoise(q + vec3(19.1, 7.3, 3.7)));
}

float cycle(float rate) {
  if (u_loop <= 0.0) return u_time * rate;
  return TAU * max(1.0, floor(u_loop * rate / TAU + 0.5)) * u_time / u_loop;
}

float evolvingNoise(vec3 p, float rate) {
  if (u_motion != MOTION_DRIFT) return gradientNoise(p);
  if (u_loop <= 0.0) return gradientNoise(p + vec3(0.0, 0.0, u_time * rate));
  float phase = fract(u_time / u_loop);
  float blend = phase * phase * (3.0 - 2.0 * phase);
  float travel = u_loop * rate;
  float correlation = exp(-5.0 * travel * travel);
  float level = inversesqrt(1.0 - 2.0 * blend * (1.0 - blend) * (1.0 - correlation));
  float ahead = gradientNoise(p + vec3(0.0, 0.0, phase * travel));
  float behind = gradientNoise(p + vec3(0.0, 0.0, (phase - 1.0) * travel));
  return mix(ahead, behind, blend) * level;
}

vec2 evolvingField(vec2 p, float depth, float rate) {
  vec3 q = vec3(p, depth);
  return vec2(evolvingNoise(q, rate), evolvingNoise(q + vec3(19.1, 7.3, 3.7), rate));
}

vec3 stopAt(int index) {
  return u_palette[clamp(index, 0, u_paletteCount - 1)];
}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(u_paletteCount - 1);
  int i = int(floor(x));
  float f = x - float(i);
  vec3 p0 = stopAt(i - 1);
  vec3 p1 = stopAt(i);
  vec3 p2 = stopAt(i + 1);
  vec3 p3 = stopAt(i + 2);
  return 0.5 * (2.0 * p1
    + (p2 - p0) * f
    + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f
    + (3.0 * p1 - p0 - 3.0 * p2 + p3) * f * f * f);
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

`;
}

function grain(): string {
  return `float grainHash(ivec2 p, uint salt) {
  return float(hash(uint(p.x) + hash(uint(p.y) + hash(u_grainSeed + salt)))) / 4294967295.0;
}

float grainNoise(vec2 p, uint salt) {
  vec2 cell = floor(p);
  ivec2 i = ivec2(cell);
  vec2 f = p - cell;
  float top = mix(grainHash(i, salt), grainHash(i + ivec2(1, 0), salt), f.x);
  float bottom = mix(grainHash(i + ivec2(0, 1), salt), grainHash(i + ivec2(1, 1), salt), f.x);
  return mix(top, bottom, f.y);
}

float bayer(ivec2 p) {
  int x = p.x & 7;
  int y = p.y & 7;
  int value = 0;
  for (int bit = 0; bit < 3; bit++) {
    int xBit = (x >> bit) & 1;
    int yBit = (y >> bit) & 1;
    value = (value << 2) | ((xBit ^ yBit) << 1) | yBit;
  }
  return (float(value) + 0.5) / 64.0;
}

float glyphBit(int glyph, ivec2 texel) {
  if (texel.x < 0 || texel.x > 4 || texel.y < 0 || texel.y > 4) return 0.0;
  return float((glyph >> (texel.x + 5 * texel.y)) & 1);
}

`;
}

function gradient(): string {
  return `vec3 meshColor(vec2 position, vec2 aspect, float breathe, float orbit) {
  if (u_meshCount == 0) return u_background;
  float sharpness = mix(3.0, 1.0, u_softness);
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int index = 0; index < ${MAX_MESH_POINTS}; index++) {
    if (index >= u_meshCount) break;
    float phase = float(index) * 2.399;
    vec2 point = 0.5 + (u_meshPoints[index] - 0.5) * (1.0 + 0.12 * breathe);
    point += 0.07 * (vec2(sin(orbit + phase), cos(orbit + phase * 1.3)) - vec2(sin(phase), cos(phase * 1.3)));
    vec2 delta = position - point * aspect;
    float weight = pow(dot(delta, delta) + 0.002, -sharpness);
    sum += weight * u_meshColors[index];
    total += weight;
  }
  return sum / total;
}

vec3 gradientAt(vec2 pixel) {
  float shortSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / shortSide;
  vec2 position = pixel / u_resolution * aspect;

  float breathe = u_motion == MOTION_BREATHE ? sin(cycle(1.0)) : 0.0;
  float flow = u_motion == MOTION_FLOW ? sin(cycle(0.6)) : 0.0;

  vec2 centered = position - 0.5 * aspect;
  vec2 warpPosition = centered * u_warpScale + u_seed;
  vec2 coarse = evolvingField(warpPosition, 0.0, 0.07);
  vec2 fine = evolvingField(warpPosition * 1.9 + coarse * 1.2 + 5.2, 4.0, 0.091);
  vec2 wobble = vec2(0.0);
  vec2 sway = vec2(0.0);
  if (u_motion == MOTION_DRIFT) {
    vec2 wobblePosition = centered * 0.9 + u_seed.yx;
    wobble = 0.1 * (evolvingField(wobblePosition, 20.0, 0.22) - warpField(wobblePosition, 20.0));
    sway = 0.04 * vec2(sin(cycle(0.5)), sin(cycle(0.37) + 1.3) - sin(1.3));
  }
  vec2 fromPointer = position - u_pointer * aspect;
  bool pulling = u_pointerForce > 0.0;
  float pointerGain = pulling ? POINTER_PULL : POINTER_PUSH;
  float pointerReach = pulling ? POINTER_REACH : POINTER_PUSH_REACH;
  vec2 pull = fromPointer * exp(-dot(fromPointer, fromPointer) / pointerReach) * u_pointerForce * pointerGain;
  vec2 displaced = position + (coarse + 0.3 * fine) * u_warp * 0.9 + wobble + sway + pull;
  if (u_shape == SHAPE_MESH) {
    float orbit = u_motion == MOTION_FLOW ? cycle(0.6) : 0.0;
    return linearToSrgb(oklabToLinear(meshColor(displaced, aspect, breathe, orbit)));
  }
  vec2 offset = displaced - u_center * aspect;
  float turnX = cos(u_rotation);
  float turnY = sin(u_rotation);
  vec2 p = vec2(turnX * offset.x + turnY * offset.y, turnX * offset.y - turnY * offset.x);

  vec2 halfExtent = max(u_size * aspect * 0.5, vec2(1e-3)) * (1.0 + 0.1 * breathe);
  float falloff = (0.006 + 0.5 * u_softness * u_softness) * (1.0 + 0.3 * breathe);
  vec2 axis = vec2(cos(u_angle), sin(u_angle));
  float along = dot(p, axis);

  float radial;
  float slope;
  float depth;
  float axisExtent;
  if (u_shape == SHAPE_BAND) {
    depth = halfExtent.y;
    radial = abs(along) / depth;
    slope = 1.0 / depth;
    axisExtent = depth;
  } else {
    float power = u_shape == SHAPE_BLOB ? 2.0 : mix(8.0, 2.0, u_roundness);
    vec2 scaled = abs(p) / halfExtent;
    radial = pow(pow(scaled.x, power) + pow(scaled.y, power), 1.0 / power);
    vec2 direction = scaled / max(radial, 1e-4);
    slope = max(length(pow(direction, vec2(power - 1.0)) / halfExtent), 1e-4);
    depth = min(halfExtent.x, halfExtent.y);
    axisExtent = abs(axis.x) * halfExtent.x + abs(axis.y) * halfExtent.y;
    if (u_shape == SHAPE_BLOB) {
      radial += mix(0.45, 0.08, u_roundness) * evolvingNoise(vec3(p / depth * 0.9 + u_seed.yx, 9.0), 0.07);
    }
    if (u_shape == SHAPE_RING) {
      radial = abs(radial - RING_RADIUS) / RING_HALF_WIDTH;
      slope /= RING_HALF_WIDTH;
    }
  }

  float edgeDistance = (radial - 1.0) / slope;
  float mask = 0.5 - 0.5 * tanh(1.6 * edgeDistance / falloff);

  float radialT = clamp(radial, 0.0, 1.0);
  radialT = radialT * radialT * (3.0 - 2.0 * radialT);
  float axisT = clamp(0.5 + 0.5 * along / axisExtent, 0.0, 1.0);
  float t = mix(radialT, axisT, u_rampDirection) + 0.15 * flow;

  vec3 lab = mix(u_background, ramp(t), mask);
  return linearToSrgb(oklabToLinear(lab));
}

`;
}

function effectMain(): string {
  return `void main() {
  float shortSide = min(u_resolution.x, u_resolution.y);
  vec3 color = applyEffect(vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y));

  float cellSize = max(1.0, shortSide / 1080.0);
  vec2 grainPosition = (gl_FragCoord.xy - 0.5) / cellSize;
  float fineGrain = grainNoise(grainPosition, 0u) + grainNoise(grainPosition, 7u) - 1.0;
  float coarseGrain = grainNoise(grainPosition * 0.5 + 100.0, 13u) - 0.5;
  float luma = dot(color, LUMA);
  float strength = u_grain * 0.14 * mix(0.3, 1.0, smoothstep(0.0, 0.2, luma));
  color += (0.8 * fineGrain + 0.4 * coarseGrain) * strength;

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
}

function glyphCodes(): number[] {
  return GLYPH_ROWS.map(glyphBits).sort((a, b) => litPixels(a) - litPixels(b));
}

export function fragmentShader(): string {
  return head() + uniforms() + `out vec4 outColor;

` + constants(glyphCodes()) + hashes() + noise() + grain() + gradient() + `vec3 applyEffect(vec2 pixel) {
  float scale = min(u_resolution.x, u_resolution.y) / 1080.0;
  float cell = 1.0;
  vec2 id = vec2(0.0);
  vec2 grid = vec2(0.0);
  float rib = 1.0;
  float across = 0.0;
  vec2 samplePoint = pixel;

  if (u_effect == EFFECT_DITHER) {
    cell = max(1.0, round(u_effectSize * scale));
    id = floor(pixel / cell);
    samplePoint = (id + 0.5) * cell;
  } else if (u_effect == EFFECT_ASCII) {
    cell = max(7.0, u_effectSize * scale);
    id = floor(pixel / cell);
    samplePoint = (id + 0.5) * cell;
  } else if (u_effect == EFFECT_HALFTONE) {
    cell = max(3.0, u_effectSize * scale);
    grid = HALFTONE_ROTATION * pixel / cell;
    id = floor(grid) + 0.5;
    samplePoint = transpose(HALFTONE_ROTATION) * id * cell;
  } else if (u_effect == EFFECT_PIXELATE) {
    cell = max(1.0, round(u_effectSize * scale));
    samplePoint = (floor(pixel / cell) + 0.5) * cell;
  } else if (u_effect == EFFECT_GLASS) {
    rib = max(2.0, u_effectSize * scale);
    across = fract(pixel.x / rib) - 0.5;
    samplePoint = pixel + vec2(across * rib * u_effectAmount * 8.0, 0.0);
  }

  vec3 color = gradientAt(samplePoint);

  if (u_effect == EFFECT_DITHER) {
    float steps = floor(mix(1.0, 7.0, u_effectAmount) + 0.5);
    return floor(color * steps + bayer(ivec2(id))) / steps;
  }

  if (u_effect == EFFECT_ASCII) {
    float peak = max(color.r, max(color.g, color.b));
    float brightness = pow(clamp(mix(dot(color, LUMA), peak, 0.5), 0.0, 0.999), 0.75);
    int index = int(floor(brightness * float(GLYPH_COUNT + 1)));
    if (index == 0) return vec3(0.0);
    int glyph = GLYPHS[index - 1];
    float footprint = 7.0 / cell;
    vec2 low = fract(pixel / cell) * 7.0 - 1.0 - 0.5 * footprint;
    ivec2 texel = ivec2(floor(low));
    vec2 spill = clamp((low + footprint - vec2(texel) - 1.0) / footprint, 0.0, 1.0);
    float lit = mix(
      mix(glyphBit(glyph, texel), glyphBit(glyph, texel + ivec2(1, 0)), spill.x),
      mix(glyphBit(glyph, texel + ivec2(0, 1)), glyphBit(glyph, texel + ivec2(1, 1)), spill.x),
      spill.y);
    return mix(color, color / max(peak, 1e-3), u_effectAmount) * lit;
  }

  if (u_effect == EFFECT_HALFTONE) {
    float peak = max(color.r, max(color.g, color.b));
    float radius = sqrt(peak) * mix(0.4, 0.75, u_effectAmount);
    float edge = 0.75 / cell;
    float coverage = 1.0 - smoothstep(radius - edge, radius + edge, length(grid - id));
    return color / max(peak, 1e-3) * coverage;
  }

  if (u_effect == EFFECT_GLASS) {
    color *= 1.0 + 0.3 * u_effectAmount * across;
    return color * (1.0 - 0.3 * u_effectAmount * smoothstep(0.38, 0.5, abs(across)));
  }

  return color;
}

` + effectMain();
}

export function cellShader(): string {
  return head() + uniforms() + `out uvec4 outCell;

` + constants(glyphCodes()) + hashes() + noise() + gradient() + `void main() {
  float scale = min(u_resolution.x, u_resolution.y) / 1080.0;
  float cell = u_effect == EFFECT_ASCII ? max(7.0, u_effectSize * scale) : max(1.0, round(u_effectSize * scale));
  vec2 id = floor(gl_FragCoord.xy);
  outCell = uvec4(floatBitsToUint(gradientAt((id + 0.5) * cell)), 0u);
}
`;
}

export function compositeShader(): string {
  return head() + uniforms() + `uniform highp usampler2D u_cells;

out vec4 outColor;

` + constants(glyphCodes()) + hashes() + grain() + `vec3 cellAt(vec2 id) {
  return uintBitsToFloat(texelFetch(u_cells, ivec2(id), 0).rgb);
}

vec3 applyEffect(vec2 pixel) {
  float scale = min(u_resolution.x, u_resolution.y) / 1080.0;

  if (u_effect == EFFECT_DITHER) {
    float cell = max(1.0, round(u_effectSize * scale));
    vec2 id = floor(pixel / cell);
    vec3 color = cellAt(id);
    float steps = floor(mix(1.0, 7.0, u_effectAmount) + 0.5);
    return floor(color * steps + bayer(ivec2(id))) / steps;
  }

  if (u_effect == EFFECT_ASCII) {
    float cell = max(7.0, u_effectSize * scale);
    vec2 id = floor(pixel / cell);
    vec3 color = cellAt(id);
    float peak = max(color.r, max(color.g, color.b));
    float brightness = pow(clamp(mix(dot(color, LUMA), peak, 0.5), 0.0, 0.999), 0.75);
    int index = int(floor(brightness * float(GLYPH_COUNT + 1)));
    if (index == 0) return vec3(0.0);
    int glyph = GLYPHS[index - 1];
    float footprint = 7.0 / cell;
    vec2 low = fract(pixel / cell) * 7.0 - 1.0 - 0.5 * footprint;
    ivec2 texel = ivec2(floor(low));
    vec2 spill = clamp((low + footprint - vec2(texel) - 1.0) / footprint, 0.0, 1.0);
    float lit = mix(
      mix(glyphBit(glyph, texel), glyphBit(glyph, texel + ivec2(1, 0)), spill.x),
      mix(glyphBit(glyph, texel + ivec2(0, 1)), glyphBit(glyph, texel + ivec2(1, 1)), spill.x),
      spill.y);
    return mix(color, color / max(peak, 1e-3), u_effectAmount) * lit;
  }

  if (u_effect == EFFECT_PIXELATE) {
    float cell = max(1.0, round(u_effectSize * scale));
    return cellAt(floor(pixel / cell));
  }

  return vec3(0.0);
}

` + effectMain();
}
