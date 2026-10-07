---
"hazeglow": patch
---

Stop the page from freezing for seconds the first time a dither, pixelate or ascii gradient draws on Windows: the extra shaders for those effects now compile in the background where the browser supports it, and the gradient draws on the main shader (pixel-identical) until they are ready. `createRenderer` also returns null on software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render Driver) so your fallback shows, `<Hazeglow>` stops animating when frames take longer than 100 ms, and it calls `onUnsupported` once the GPU context is lost a second time.
