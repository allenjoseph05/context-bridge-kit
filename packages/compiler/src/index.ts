// @cb/compiler — public API.
export { newFence, renderEnvelope } from "./envelope.js";
export type { FenceRng } from "./envelope.js";
export { compile, NotImplementedError } from "./compile.js";
export type { CompileError, CompileInput, CompileResult } from "./compile.js";
export { checkCoverage } from "./coverage.js";
export { buildBundle } from "./bundle.js";
