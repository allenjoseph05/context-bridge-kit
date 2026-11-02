import { describe, expect, it } from "vitest";
import {
  IMAGE_TOKENS,
  PROFILE_BUDGET,
  PROFILE_RECENT_TURNS,
  ROUTE_BUDGET,
  countTokens,
  destinationProfile,
  effectiveBudget,
} from "../src/index.js";

describe("@cb/tokens", () => {
  it("T04 count", () => {
    const text = "Use PostgreSQL 16 for the event store; keep `events` append-only.";
    const first = countTokens(text);
    expect(first).toBeGreaterThan(0);
    expect(countTokens(text)).toBe(first);
    expect(countTokens("hello")).toBeGreaterThan(0);
    expect(countTokens("")).toBe(0);
    // Longer text never counts fewer tokens than its prefix.
    expect(countTokens(text + " " + text)).toBeGreaterThan(first);
    expect(IMAGE_TOKENS).toBe(1000);
    expect(PROFILE_BUDGET).toEqual({ continue: 8000, rescue: 3000, second_opinion: 2000 });
    expect(ROUTE_BUDGET).toEqual({ mcp: 6000, bundle: 8000, clipboard: 8000 });
    expect(PROFILE_RECENT_TURNS).toEqual({ continue: 4, rescue: 10, second_opinion: 2 });
  });

  it("AC-08 effective budget", () => {
    expect(effectiveBudget("continue", "mcp")).toBe(Math.floor(6000 * 0.85));
    expect(effectiveBudget("continue", "clipboard")).toBe(Math.floor(8000 * 0.85));
    expect(effectiveBudget("continue", "bundle")).toBe(Math.floor(8000 * 0.85));
    for (const route of ["mcp", "bundle", "clipboard"] as const) {
      expect(effectiveBudget("rescue", route)).toBe(Math.floor(3000 * 0.85));
      expect(effectiveBudget("second_opinion", route)).toBe(Math.floor(2000 * 0.85));
    }
    expect(effectiveBudget("continue", "mcp", 16_000)).toBe(Math.floor(4000 * 0.85));
    expect(effectiveBudget("continue", "clipboard", 16_000)).toBe(Math.floor(4000 * 0.85));
    // A large window does not raise the budget.
    expect(effectiveBudget("continue", "mcp", 200_000)).toBe(Math.floor(6000 * 0.85));
    // A window that is not a multiple of 4 still floors to an integer.
    expect(effectiveBudget("continue", "clipboard", 10_001)).toBe(Math.floor((10_001 / 4) * 0.85));
  });

  it("T04 destination profiles", () => {
    expect(destinationProfile("mcp", "continue")).toEqual({
      route: "mcp",
      canPull: true,
      acceptsImages: true,
      acceptsFiles: false,
      pushBudgetTokens: Math.floor(6000 * 0.85),
    });
    expect(destinationProfile("bundle", "continue")).toEqual({
      route: "bundle",
      canPull: false,
      acceptsImages: true,
      acceptsFiles: true,
      pushBudgetTokens: Math.floor(8000 * 0.85),
    });
    expect(destinationProfile("clipboard", "rescue")).toEqual({
      route: "clipboard",
      canPull: false,
      acceptsImages: false,
      acceptsFiles: false,
      pushBudgetTokens: Math.floor(3000 * 0.85),
    });
    expect(destinationProfile("mcp", "continue", 16_000).pushBudgetTokens).toBe(
      Math.floor(4000 * 0.85),
    );
  });
});
