# @scoobynko/afterglow

Soft, grainy, glowing gradients for React. You describe a gradient as a small JSON config and the component draws it on a canvas: a blurred shape or a colour mesh, with film grain, slow motion and an optional hover pull. It is one WebGL2 fragment shader. Zero runtime dependencies. ~10kb gzipped. MIT.

**Design your own:** https://www.jakubsalmik.com/afterglow

![The six built-in presets: dusk, pearl, ember, horizon, ultraviolet and candy](./docs/presets.jpg)

## Install

```bash
npm install @scoobynko/afterglow
```

React 18 or 19.

## Usage

```tsx
import { Afterglow, presets } from "@scoobynko/afterglow";

export function Hero() {
  return (
    <div style={{ height: 480 }}>
      <Afterglow config={presets.dusk} />
    </div>
  );
}
```

The canvas fills its parent, so give the parent a size. There is no CSS file to import.

It works in the Next.js App Router as is. `Afterglow` is a client component, and you can render it from a server component.

### Props

| Prop            | Type                  | Description                                                                 |
| --------------- | --------------------- | --------------------------------------------------------------------------- |
| `config`        | `GradientConfig`      | The gradient. Required. Pass a new object to change it.                     |
| `className`     | `string`              | Pass-through class for the canvas.                                          |
| `style`         | `CSSProperties`       | Merged over the default `display: block; width: 100%; height: 100%`.        |
| `onUnsupported` | `() => void`          | Called once if WebGL2 on a GPU is not available. Show your fallback here.   |
| `ref`           | `Ref<AfterglowHandle>` | `ref.current.getTime()` returns the animation clock in seconds.            |

The canvas is `aria-hidden`. It is decoration, so put your content next to it or on top of it.

## Design a gradient

You do not have to write the config by hand.

1. Open https://www.jakubsalmik.com/afterglow and shape the gradient with the controls.
2. Copy the JSON.
3. Paste it as `config`.

```tsx
import { Afterglow, type GradientConfig } from "@scoobynko/afterglow";

const config: GradientConfig = {
  version: 1,
  seed: 1,
  shape: "pill",
  center: [0.5, 0.42],
  size: [0.86, 0.6],
  roundness: 0.7,
  softness: 0.5,
  rotation: 0,
  rampDirection: 0.9,
  angle: 90,
  warp: 0.06,
  warpScale: 1,
  palette: ["#6a3df5", "#35aef2", "#c9a0e8", "#f59a22", "#3a5cf5", "#5a28e8"],
  background: "#000000",
  mesh: [],
  grain: 0.3,
  motion: "drift",
  speed: 1,
  loop: 0,
  hover: 0,
  hoverMode: "pull",
  effect: "none",
  effectSize: 8,
  effectAmount: 0.5,
};

<Afterglow config={config} />;
```

If the config comes from somewhere you do not control (a CMS, a URL, a `.json` file), run it through `parseConfig` first. It never throws. Missing or invalid fields fall back to the defaults and numbers are clamped to their range.

```tsx
import { Afterglow, parseConfig } from "@scoobynko/afterglow";

<Afterglow config={parseConfig(untrusted)} />;
```

`encodeConfig(config)` turns a config into a URL-safe string and `decodeConfig(string)` turns it back, for share links.

## Presets

Six ready-made configs, the ones in the picture above, left to right and top to bottom:

`presets.dusk`, `presets.pearl`, `presets.ember`, `presets.horizon`, `presets.ultraviolet`, `presets.candy`

Use one as a starting point and override what you need:

```tsx
<Afterglow config={{ ...presets.horizon, motion: "breathe", grain: 0.5 }} />
```

`presets` is typed as `Record<string, GradientConfig>`. If your project has `noUncheckedIndexedAccess` on, write `presets.dusk!`.

`randomConfig(seed)` returns a new, good-looking config for any integer seed. The same seed always gives the same gradient.

## Config reference

Positions and sizes are fractions of the canvas: `[0, 0]` is the top left corner and `[1, 1]` the bottom right. Colours are hex strings, `#rgb` or `#rrggbb`. They are blended in Oklab, so the steps between them stay clean.

| Field           | Type / range                                                      | What it does                                                                                             |
| --------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `version`       | `1`                                                               | Config format version.                                                                                   |
| `seed`          | integer                                                           | Picks the noise pattern for the warp and the grain.                                                      |
| `shape`         | `"pill" \| "band" \| "blob" \| "ring" \| "mesh"`                   | The form of the glow. `mesh` uses `mesh` points instead of `palette`.                                    |
| `center`        | `[x, y]`, 0 to 1                                                  | Where the shape sits.                                                                                    |
| `size`          | `[width, height]`, 0 to 1.5                                       | How big the shape is. `1` spans the canvas.                                                              |
| `roundness`     | 0 to 1                                                            | `0` is a rounded box, `1` an ellipse. For `blob`, lower is more irregular.                               |
| `softness`      | 0 to 1                                                            | How far the edge fades out. For `mesh`, how much the points melt into each other.                        |
| `rotation`      | 0 to 360                                                          | Turns the shape, in degrees.                                                                             |
| `rampDirection` | 0 to 1                                                            | `0` runs the colours from the middle outwards, `1` runs them in a line along `angle`.                    |
| `angle`         | 0 to 360                                                          | Direction of the colour line, in degrees. `90` is top to bottom.                                         |
| `warp`          | 0 to 1                                                            | How much the shape is bent by noise.                                                                     |
| `warpScale`     | 0.5 to 4                                                          | Size of the bends. Higher is finer.                                                                      |
| `palette`       | 2 to 10 colours                                                   | The colour stops, first to last.                                                                         |
| `background`    | colour                                                            | What is behind the shape.                                                                                |
| `mesh`          | up to 16 `[x, y, colour]` points                                  | The colour points for `shape: "mesh"`. Ignored by the other shapes.                                      |
| `grain`         | 0 to 1                                                            | Film grain strength.                                                                                     |
| `motion`        | `"none" \| "drift" \| "breathe" \| "flow"`                         | `drift` slowly reshapes, `breathe` pulses in size, `flow` slides the colours.                            |
| `speed`         | 0 to 2                                                            | Motion speed multiplier.                                                                                 |
| `loop`          | 0 to 30                                                           | Length of a seamless loop in seconds. `0` never repeats.                                                 |
| `hover`         | 0 to 1                                                            | How strongly the gradient reacts to the pointer. `0` turns it off.                                       |
| `hoverMode`     | `"pull" \| "push"`                                                 | Whether the gradient is drawn towards the pointer or pushed away from it.                                |
| `effect`        | `"none" \| "dither" \| "ascii" \| "halftone" \| "pixelate" \| "glass"` | A stylised finish on top of the gradient.                                                                |
| `effectSize`    | 2 to 64                                                           | Cell size of the effect.                                                                                 |
| `effectAmount`  | 0 to 1                                                            | Strength of the effect.                                                                                  |

The lists and limits are exported, so you can build your own controls: `SHAPES`, `MOTIONS`, `EFFECTS`, `HOVER_MODES`, `RANGES`, `MIN_STOPS`, `MAX_STOPS`, `MAX_MESH_POINTS`, `DEFAULT_CONFIG`.

## Hover

Set `hover` above `0` and the gradient follows the pointer, then eases back when it leaves.

```tsx
<Afterglow config={{ ...presets.dusk, hover: 0.6, hoverMode: "pull" }} />
```

- It listens to pointer events, so mouse, pen and touch all drive it.
- While hover is on, the canvas sets `touch-action: pan-y`, so a finger on the gradient still scrolls the page up and down. Override it through `style` if you want something else, for example `style={{ touchAction: "none" }}` on a full-screen gradient.
- While hover is off, the pointer handlers do nothing and `touch-action` is left alone.

## Without React

The engine has its own entry point with no React import. Use it in Vue, Svelte, plain JavaScript, a worker with an `OffscreenCanvas`, or to render a single frame for an image export.

```ts
import { createRenderer, presets } from "@scoobynko/afterglow/core";

const canvas = document.querySelector("canvas")!;
const renderer = createRenderer(canvas);

if (renderer) {
  renderer.resize(1600, 900);
  renderer.render(presets.dusk, 0);
}
```

- `createRenderer(canvas)` returns `null` when WebGL2 on a GPU is not available.
- `renderer.render(config, time, pointer?)` draws one frame. `time` is in seconds. The same config and time always give the same picture.
- `renderer.resize(width, height)` sets the size in device pixels. `renderer.maxSize` is the largest side the GPU allows.
- `renderer.dispose()` frees the shader program and the listeners.

To animate, call `render` from `requestAnimationFrame` with a growing `time`. To save a frame, read the canvas (`toBlob`, `drawImage`) right after `render`, in the same task, because the drawing buffer is not kept between frames.

Everything on `/core` is also exported from the main entry: `parseConfig`, `encodeConfig`, `decodeConfig`, `presets`, `randomConfig`, `randomMesh`, `mulberry32`, the colour helpers (`isHex`, `parseHex`, `toHex`, `srgbToLinear`, `linearToSrgb`, `linearToOklab`, `hexToOklab`) and the pointer easing used by the component (`IDLE_POINTER`, `stepPointer`, `isSettled`).

## Limits

- **It needs WebGL2 with a GPU.** Software rendering is refused on purpose, because it took 9 to 10 seconds to start. When there is no GPU the canvas stays empty and `onUnsupported` is called, so keep a CSS background behind it as a fallback.
- **About 16 gradients per page.** Browsers cap live WebGL contexts at roughly 16 per page and each `Afterglow` uses one. Past the cap the browser drops the oldest ones.
- **Reduced motion turns motion off.** Under `prefers-reduced-motion: reduce` the gradient is drawn as a still frame and hover is disabled.
- **Tested in Chrome only so far.** Safari, Firefox and real phones are untested.
- The canvas is empty until JavaScript runs. There is nothing to see in server-rendered HTML.

To keep it light, the animation loop pauses while the canvas is off screen or the tab is hidden, the device pixel ratio is capped at 2, and the loop never re-renders React.

## Contributing

PRs welcome.

1. Branch off `main`: `fix/...`, `feat/...`, `chore/...`, or `docs/...`.
2. Before pushing, run `npm run typecheck`, `npm test` and `npm run build`. All three must pass.
3. If your change touches `src/`, add a changeset:
   ```bash
   npx changeset
   ```
   Pick `patch` (bug fix), `minor` (additive feature), or `major` (breaking change), and write a one-line summary from the consumer's perspective. CI fails without one.
4. Open a PR with `gh pr create`.

### Release automation

You don't run `npm publish`, `npm version`, or tag releases by hand.

- Merging a PR to `main` runs the [Release workflow](.github/workflows/release.yml).
- If pending changesets exist, it opens (or updates) a "version packages" PR that bumps `package.json` and updates `CHANGELOG.md`.
- Merging that PR publishes to npm and tags the release.

Don't commit `dist/` or `node_modules/`, don't edit changeset files in the version PR, and don't add runtime dependencies. This package is zero-deps.

## License

MIT © [Jakub Šalmík](https://jakubsalmik.com)
