---
"hazeglow": minor
---

No more multi-second freezes while shaders compile on Windows. Shaders now compile in the background where the browser supports it, and the main shader calls the gradient once instead of once per effect, so Direct3D compiles it far faster. New: `renderer.ready`, a promise that resolves to `true` once the renderer can draw (or `false` if it cannot); `render` calls before that are kept and the last one is drawn as soon as it is ready, so await `ready` before reading pixels back. `<Hazeglow>` stays transparent until its shader is ready. `createRenderer` now returns null on software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render Driver), `<Hazeglow>` stops animating when frames take longer than 100 ms, and calls `onUnsupported` when the shader fails or the GPU context is lost a second time. The restructured shader can differ from 0.5 by one colour level in a few pixels out of millions.
