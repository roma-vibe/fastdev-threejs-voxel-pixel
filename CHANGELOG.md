# Changelog

## 1.0.0 — 2026-10-05

- Add the blocky pixel-art browser voxel game starter with Three.js, PixiJS and Vue.
- Adapt reusable voxel rendering, lighting, physics, procedural textures, particles and animation from the owner’s prototype; replace story content with the original Meadow Crossing demo.
- Include exploration, a training guardian, crystals, checkpoints, block editing, procedural audio and versioned browser-local saves.
- Add 23 tests, a zero-warning lint and formatting gate, production serving, three verified Docker choices, authoring instructions and Russian catalog translations.
- Redraw the HUD only when visible state changes and upload only active particle buffers.
- Reuse camera vectors, animation poses and mesher scratch storage without changing simulation timing.
- Merge compatible opaque faces with identical lighting while preserving per-block atlas repeats and texture filtering.
- Combine output conversion and grading with GPU-calibrated half-float rounding; retain separate chromatic-aberration passes.
- Add rendering regression tests and performance guidance; verify local and Docker checks, production builds and browser gameplay.
- Record the project brief in SPEC.md and turn it into a specification with the demo as its starting point.
- Rewrite AGENTS.md as a complete agent guide for the selected Docker mode.
- Describe only the selected Docker mode in README.md and remove references to the source prototype.
- Fix melee line of sight, which ignored walls because both entity centres shared one vector.
- Re-mesh every section whose lighting changes after a block edit.
- Show the menu instead of a blank page when browser storage is blocked.
- Take the page title in index.html from APP_NAME.
- Comment every key in .env.example.
- Redraw the paused scene after graphics quality or window size changes.
- Do not attack, mine or place with the click that captures the pointer.
- Save on page exit only while playing, so an idle tab cannot overwrite newer progress.
- Start a fresh game from New adventure when saves are unavailable.
- Dispose the HUD safely when its initialisation did not finish.
- Unescape backslashes and newlines in double-quoted .env values.
- Read files before sending headers in the production server and never cache the page fallback as an immutable asset.
- Raise the test timeout to 60 seconds for slow machines and containers.
