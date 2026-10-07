---
"hazeglow": patch
---

Show your fallback instead of freezing on software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render Driver): `createRenderer` now returns null there. `<Hazeglow>` also stops animating when frames take longer than 100 ms, and calls `onUnsupported` once the GPU context is lost a second time.
