# T00 · Scaffold the monorepo
Depends on: — · Size: S · Test review: — · Security rows: —

## Goal
An empty but working pnpm TypeScript monorepo where `pnpm check` passes, so every later task only
adds code to an existing package.

## Why
Every task needs the same commands and package layout (AGENTS.md §Commands). Fixing them now
prevents each session from inventing its own setup.

## Read before starting (only these)
- `specs/plan.md` §Stack, §Packages

## Human prerequisites
- Node 20+ and pnpm 9+ installed. Git repository initialised.

## Deliverables
- `package.json` (root, private), `pnpm-workspace.yaml` (`packages/*`, `evals`)
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `module`/`moduleResolution` `NodeNext`,
  `target` `ES2022`, `declaration`, `sourceMap`
- `vitest.workspace.ts`, `eslint.config.js` (typescript-eslint recommended; `no-console` **error**
  in `packages/host` and `packages/mcp-server` with `allow: ["error", "warn"]`), `.prettierrc`
- `.gitignore` (node_modules, dist, coverage, `*.pem`, `.env*`, `evals/results/*.tmp`)
- One package folder per row of `specs/plan.md` §Packages (except `evals`, which is a plain folder
  with its own package.json): `package.json` (`name: "@cb/<name>"`, `type: "module"`,
  `exports` → `dist/index.js`), `tsconfig.json` extending the base, `src/index.ts` exporting nothing
  yet, `test/smoke.test.ts`.
- Root scripts: `build` (tsc -b for all), `test` (vitest run), `lint`, `typecheck`,
  `check` = typecheck + lint + test, `eval` (placeholder that prints "not yet implemented (T21)" and
  exits 0).

## Do not touch
`specs/`, `docs/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `KIT-GUIDE.md`.

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | `pnpm install && pnpm check` exits 0 on a clean clone | run it |
| 2 | Each package has a passing smoke test named `T00 <package> builds` | `packages/*/test/smoke.test.ts` |
| 3 | Lint fails on `console.log` in `packages/host/src` | add a temporary line, run lint, remove it (note the result in the card) |

## Steps
1. Create the root files, then each package skeleton.
2. Install dev dependencies only: typescript, vitest, eslint, typescript-eslint, prettier.
   Runtime dependencies are added by the task that needs them.
3. Run `pnpm check`; fix until green.

## Out of scope
Any real code, runtime dependencies, the extension build (T08).

## Stop and ask if
A package in the table cannot be created as specified, or a tool version conflict needs a choice.

## Done when
- [ ] `pnpm check` green
- [ ] Criterion 3 verified and noted below
- [ ] `finish-task` run

## Implementation notes
<!-- filled by the agent at finish-task -->
