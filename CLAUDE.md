# Repository rules for Claude

Read this before making any change to this repo.

## Pre-push checklist

Before you push a branch (any branch), run these and make sure they all pass:

1. `npm run typecheck` must exit 0.
2. `npm test` must pass.
3. `npm run build` must succeed and produce `dist/index.mjs`, `dist/hazeglow.mjs`, `dist/core.mjs` and their `.d.ts` files. The build checks its own output and fails if `hazeglow.mjs` loses `"use client"` or if `core.mjs` imports React.

Do not push if any of them fails. Fix the root cause; do not silence errors.

## Changeset rule

If the change modifies anything under `src/` that affects users of the published package (new/removed/changed prop or export, behavior change, bug fix that reaches runtime, anything that changes the rendered picture), you MUST add a changeset before opening the PR:

```
npx changeset
```

- Bump type: `patch` for bug fixes, `minor` for additive features, `major` for breaking changes to the public API or to the picture a config produces.
- Summary: one line, written from the consumer's perspective.

Skip the changeset for: docs-only edits, CI/workflow changes, `.gitignore`, `CLAUDE.md`, tests, tooling config that doesn't change the tarball.

## Branch + PR flow

- `main` is protected. Never push to it directly; the ruleset will reject it.
- Name the branch `type/short-description`: lowercase letters and digits with single hyphens or dots. The type is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`. The "Conventional branch name" check fails the PR otherwise, and it is a required check.
- The branch type does not decide the release. The changeset does: a PR with a changeset leads to a release, a PR without one does not.
- Open a PR with `gh pr create`. The user merges.
- After merge, the Release workflow either opens a "version packages" PR (if changesets are pending) or publishes.

## Public API: do not change without the user's explicit approval

- Entry points: `hazeglow` (component plus engine) and `hazeglow/core` (engine only, no React import, no `"use client"`).
- Component: `Hazeglow` with props `config`, `className`, `style`, `onUnsupported`, and a ref handle with `getTime()`. Types `HazeglowProps`, `HazeglowHandle`.
- Engine exports: the list in `src/core.ts`. `tests/exports.test.ts` pins it.
- The picture: a given config and time must render the same pixels across releases. hazeglow.dev and the portfolio at jakubsalmik.com import this package, and their share links depend on that. Treat any edit to `src/shader.ts` or to the uniforms in `src/renderer.ts` as a breaking change unless the output is proven identical. `tests/shader.test.ts` pins both shader sources by hash.
- `parseConfig` never throws and returns keys in the same order as `DEFAULT_CONFIG`, so encoded links survive a round trip.

## Decisions already made

- The renderer re-sends all uniforms every frame. Caching them by config identity was measured (about 4 microseconds per frame saved) and rejected, because a config mutated in place would silently stop updating. The test "picks up a config that was changed in place" pins this.
- In `Hazeglow`, time and pointer live in refs so the animation loop causes zero React re-renders, and `setEngaged` is guarded by a ref. Keep it that way.
- `failIfMajorPerformanceCaveat: true` stays. Software rendering took 9 to 10 seconds to start.
- The fragment shader source is built inside `fragmentShader()`, not at module level, so bundlers can drop it for consumers who only import config helpers. The build fails if the shader shows up in such a bundle. Keep module-level code in the engine free of calls for the same reason.
- `touch-action` is `pan-y` while hover is on and unset while it is off.

## Things to never do

- Do not write code comments. Rationale goes in commit messages.
- Do not commit `dist/` or `node_modules/`.
- Do not run `npm publish`, `npm version`, or create release tags by hand. The Release workflow owns these.
- Do not add runtime dependencies. This package advertises zero deps.
- Do not use `tsup`'s `treeshake: true` (it strips `"use client"`) or TypeScript 7 (it breaks tsup's `.d.ts` build; stay on `^5`).
- Do not use `git push --force`, `git reset --hard`, or `git commit --amend` on pushed commits.
