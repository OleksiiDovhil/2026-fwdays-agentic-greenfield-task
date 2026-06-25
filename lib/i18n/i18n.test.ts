// Test-first (red): asserts the SPECIFIED i18n behavior pinned by design.md D1
// and spec "Centralized Ukrainian-first UI strings". Implementation
// (`lib/i18n/uk.ts`, `en.ts`, `index.ts`) does not exist yet — these MUST fail
// because the modules are missing, not because of weak assertions.
//
// Contract under test:
//   - `t(key)` returns the Ukrainian value by default.
//   - A key missing from `uk` falls back to the `en` value, with NO missing-key
//     placeholder and NO console error/warning.
//   - No string value in `uk` OR `en` contains an exclamation mark (BC-BRAND-01).
//
// @trace NFR-I18N-01, BC-BRAND-01
import { describe, it, expect, vi, afterEach } from "vitest";
import { t } from "@/lib/i18n";
import * as ukMod from "@/lib/i18n/uk";
import * as enMod from "@/lib/i18n/en";

// Tolerate either `export default {...}` or `export const uk = {...}` for the
// dictionary objects — the leaf-string CONTENT is what the spec pins, not the
// export keyword.
const uk = (ukMod as Record<string, unknown>).default ?? (ukMod as Record<string, unknown>).uk;
const en = (enMod as Record<string, unknown>).default ?? (enMod as Record<string, unknown>).en;

// Flatten a nested dictionary to dotted leaf paths -> string value.
function flatten(
  obj: unknown,
  prefix = "",
  out: Record<string, string> = {},
): Record<string, string> {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") flatten(v, path, out);
      else if (typeof v === "string") out[path] = v;
    }
  }
  return out;
}

const flatUk = flatten(uk);
const flatEn = flatten(en);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lib/i18n — Ukrainian-first defaults", () => {
  it("has a non-empty Ukrainian dictionary", () => {
    expect(Object.keys(flatUk).length).toBeGreaterThan(0);
  });

  it("t(key) returns the Ukrainian value for every key present in uk", () => {
    for (const [key, value] of Object.entries(flatUk)) {
      expect(t(key as never)).toBe(value);
    }
  });

  it("resolves the shell hero copy from the dictionary (not a hardcoded literal)", () => {
    // The empty-state hero is owned by the shell namespace (D7). Whatever its
    // exact leaf keys, every shell.* value must round-trip through t().
    const shellKeys = Object.keys(flatUk).filter((k) => k.startsWith("shell."));
    expect(shellKeys.length).toBeGreaterThan(0);
    for (const key of shellKeys) {
      expect(t(key as never)).toBe(flatUk[key]);
    }
  });
});

describe("lib/i18n — English fallback (no placeholder, no console noise)", () => {
  it("falls back to the English value for any key present only in en", () => {
    const enOnly = Object.keys(flatEn).filter((k) => !(k in flatUk));
    for (const key of enOnly) {
      expect(t(key as never)).toBe(flatEn[key]);
    }
  });

  it("never emits a missing-key placeholder or a console error/warning", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // A key absent from BOTH locales is the worst case: t() must degrade
    // quietly (no throw, no console noise, no "missing key"/"!!" placeholder).
    const ghost = "shell.__definitely_absent_key__";
    expect(() => t(ghost as never)).not.toThrow();
    const resolved = t(ghost as never);
    expect(String(resolved)).not.toMatch(/missing/i);
    expect(String(resolved)).not.toContain("!");

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("lib/i18n — calm tone (BC-BRAND-01)", () => {
  it("contains no exclamation mark in any Ukrainian value", () => {
    for (const [key, value] of Object.entries(flatUk)) {
      expect(value, `uk.${key} must not contain "!"`).not.toContain("!");
    }
  });

  it("contains no exclamation mark in any English value", () => {
    for (const [key, value] of Object.entries(flatEn)) {
      expect(value, `en.${key} must not contain "!"`).not.toContain("!");
    }
  });
});
