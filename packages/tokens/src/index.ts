// @cb/tokens — token counting and budgets. See specs/plan/compiler.md §Token counting.
// Pure and browser-safe: no `node:` imports.
import type { DestinationProfile, Profile, Route } from "@cb/schema";
import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";

/** Fixed token cost of one image (proxy; labelled Inferred). */
export const IMAGE_TOKENS = 1000;

/** Raw push budget per profile, before the margin. Starting defaults, tuned in T21. */
export const PROFILE_BUDGET: Readonly<Record<Profile, number>> = {
  continue: 8000,
  rescue: 3000,
  second_opinion: 2000,
};

/** Raw push budget per route, before the margin. */
export const ROUTE_BUDGET: Readonly<Record<Route, number>> = {
  mcp: 6000,
  bundle: 8000,
  clipboard: 8000,
};

/** How many recent turns each profile pushes verbatim (second_opinion: last user + last assistant). */
export const PROFILE_RECENT_TURNS: Readonly<Record<Profile, number>> = {
  continue: 4,
  rescue: 10,
  second_opinion: 2,
};

/** Share of the raw budget actually used; 15 % margin for tokenizer differences. */
const BUDGET_MARGIN = 0.85;

const ROUTE_CAPS: Readonly<Record<Route, Omit<DestinationProfile, "route" | "pushBudgetTokens">>> =
  {
    mcp: { canPull: true, acceptsImages: true, acceptsFiles: false },
    bundle: { canPull: false, acceptsImages: true, acceptsFiles: true },
    clipboard: { canPull: false, acceptsImages: false, acceptsFiles: false },
  };

let encoder: Tiktoken | undefined;

/**
 * Token count of `text` with `o200k_base`, used as a proxy for every vendor.
 * Special-token strings such as `<|endoftext|>` are counted as plain text.
 */
export function countTokens(text: string): number {
  if (text === "") return 0;
  encoder ??= new Tiktoken(o200kBase);
  return encoder.encode(text, [], []).length;
}

/**
 * `floor(min(profile budget, route budget, window / 4) × 0.85)`.
 * `destinationWindow` is the destination's context window in tokens, when known.
 */
export function effectiveBudget(
  profile: Profile,
  route: Route,
  destinationWindow?: number,
): number {
  const raw = Math.min(
    PROFILE_BUDGET[profile],
    ROUTE_BUDGET[route],
    destinationWindow !== undefined ? destinationWindow / 4 : Infinity,
  );
  return Math.floor(raw * BUDGET_MARGIN);
}

/** What a route can take, and its effective push budget for this profile. */
export function destinationProfile(
  route: Route,
  profile: Profile,
  destinationWindow?: number,
): DestinationProfile {
  return {
    route,
    ...ROUTE_CAPS[route],
    pushBudgetTokens: effectiveBudget(profile, route, destinationWindow),
  };
}
