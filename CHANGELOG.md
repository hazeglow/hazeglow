# hazeglow

## 0.1.1

### Patch Changes

- d01e517: Importing only the config helpers from `@scoobynko/afterglow/core` (`parseConfig`, `encodeConfig`, the colour functions) no longer pulls the shader into your bundle: about 4 kB minified instead of 18 kB. The rendered picture is unchanged.

## 0.1.0

### Minor Changes

- 9b3a977: First release: the `Afterglow` React component, and the gradient engine on its own at `@scoobynko/afterglow/core`.
