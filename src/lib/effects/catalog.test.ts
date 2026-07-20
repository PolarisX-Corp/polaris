import { describe, expect, it } from "vitest";
import { CATALOG_VERSION, EFFECT_CATALOG, getEffectEntry } from "./catalog";

describe("effect catalog", () => {
  it("looks up a known effect entry", () => {
    const entry = getEffectEntry("add_internal_label");
    expect(entry?.reversibility).toBe("reversible");
    expect(entry?.autoExecuteAllowed).toBe(true);
  });

  it("returns undefined for an unknown effect", () => {
    expect(getEffectEntry("nope")).toBeUndefined();
  });

  it("stamps every entry with the catalog version", () => {
    for (const entry of EFFECT_CATALOG) {
      expect(entry.policyVersion).toBe(CATALOG_VERSION);
    }
  });

  it("covers all reversibility levels in the examples", () => {
    const levels = EFFECT_CATALOG.map((e) => e.reversibility).sort();
    expect(levels).toEqual(["compensatable", "irreversible", "reversible"]);
  });
});
