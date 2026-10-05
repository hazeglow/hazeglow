# hazeglow

## 0.4.0

### Minor Changes

- 514e12b: `Hazeglow` draws at most 60 frames a second and stops redrawing once the gradient has caught up with a pointer resting on it. `isSettled` also accepts the pointer target for the same check.

## 0.3.1

### Patch Changes

- b8113b7: The README has a new cover image, linked so it shows on npm as well as GitHub.

## 0.3.0

### Minor Changes

- c983823: Colours can now be OKLCH (`oklch(0.7 0.15 200)`) or CSS variables that follow your theme (`var(--brand, #6a3df5)`), with new `isColor`, `colorToOklab` and `resolveConfig` helpers. Hex configs render exactly as before.

## 0.2.0

### Minor Changes

- ea66609: Renamed from @scoobynko/afterglow: install hazeglow and import Hazeglow (was Afterglow). Every config renders exactly as before.

## 0.1.1

### Patch Changes

- d01e517: Importing only the config helpers from `@scoobynko/afterglow/core` (`parseConfig`, `encodeConfig`, the colour functions) no longer pulls the shader into your bundle: about 4 kB minified instead of 18 kB. The rendered picture is unchanged.

## 0.1.0

### Minor Changes

- 9b3a977: First release: the `Afterglow` React component, and the gradient engine on its own at `@scoobynko/afterglow/core`.
