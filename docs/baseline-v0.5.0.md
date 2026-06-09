# pi-agentteam v0.5.0 rollback baseline

> Local development note. This file is intentionally under `docs/` and is not included in the npm package.

v0.5.0 remains the documented rollback/migration baseline for users who need to leave the bridge-only/vNext runtime line.

## Release planning note

The Go high-performance kernel direction is a future optional-helper plan, not part of the v0.5.0 rollback baseline and not a required runtime dependency. Current planning records live in `docs/decisions/0001-replaceable-go-kernel.md` and `docs/go-kernel-port-audit.md`.

Release planning must preserve the TypeScript/pi facade, visible tmux panes, leader-gated governance, explicit `agentteam_receive` and TaskReport full-text boundaries, explicit PlanRun progression, no hidden scheduler/autopilot, no worker-spawns-worker, and legacy state compatibility. Do not change package versions, run `npm version`, or publish npm packages as part of Go-kernel planning slices.

## Install rollback baseline

```bash
npm install pi-agentteam@0.5.0
```

For pi user settings, pin the package source to:

```json
"npm:pi-agentteam@0.5.0"
```

## Operational reminder

- Use a clean or backed-up `PI_AGENTTEAM_HOME` when testing rollback behavior.
- Restart/reload pi after changing package settings.
- Respawn workers after rollback; do not expect an in-process switch between runtime versions.
- v0.6.x state may contain bridge/runtime/task-history structures that older versions should not be expected to understand.
