---
"hazeglow": minor
---

Dither, ascii and pixelate effects now compute the gradient once per cell instead of once per pixel. This cuts their GPU time per frame by up to about 90%, and the picture is unchanged.
