# Three.js Voxel Game, Pixel Style skeleton — instructions for AI agents

This repository is a fastDev skeleton (`threejs-voxel-pixel`). It is not a project: fastDev copies `files/` into
new projects and renders `*.tmpl` files. Read the fastDev skeleton authoring guide first
(MCP tool `get_authoring_guide`, or `docs/skeleton-authoring.md` in the fastDev repository).

- Change `template.toml` and `files/` only; `files/AGENTS.md.tmpl` and `files/SPEC.md.tmpl` are the
  instructions of the future projects, not of this repository.
- Do not commit, tag or edit `CHANGELOG.md` by hand: validate, verify and publish through fastDev
  (`validate_skeleton`, `verify_skeleton`, `publish_skeleton`). Publishing commits, creates the
  `vX.Y.Z` tag, pushes and updates the registry.
- Never move or delete a published tag.
- Everything is written in English.
- Keep `files/` free of third-party content: no franchise or brand names, copied story, characters, saves or
  external assets.
- Rendered `AGENTS.md`, `SPEC.md` and `README.md` are checked by Prettier in new projects (`npm run check`): after
  changing a `.tmpl`, create a project per Docker mode and run `npx prettier --check '*.md'` there.
