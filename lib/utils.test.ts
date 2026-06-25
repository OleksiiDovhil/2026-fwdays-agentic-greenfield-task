// Colocated unit test for the `cn()` design-system glue (design.md D5, task 1.2).
// `cn` must flatten conditional inputs and let later Tailwind utilities win over
// conflicting earlier ones (tailwind-merge), staying framework-free.
//
// @trace TC-STACK-02
import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("lib/utils — cn", () => {
  it("joins plain class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy conditional values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports object and array syntax", () => {
    expect(cn("a", { b: true, c: false }, ["d", "e"])).toBe("a b d e");
  });

  it("resolves conflicting Tailwind utilities so the last one wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-foreground", "text-muted-foreground")).toBe(
      "text-muted-foreground",
    );
  });

  it("returns an empty string for no meaningful input", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined)).toBe("");
  });
});
