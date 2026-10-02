---
"@scoobynko/afterglow": patch
---

Importing only the config helpers from `@scoobynko/afterglow/core` (`parseConfig`, `encodeConfig`, the colour functions) no longer pulls the shader into your bundle: about 4 kB minified instead of 18 kB. The rendered picture is unchanged.
