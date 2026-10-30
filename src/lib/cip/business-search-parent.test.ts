import { describe, expect, it } from "vitest";
import { resolveParentOrganization } from "./business-search-engine";

describe("resolveParentOrganization", () => {
  it("drops a parent that is the employer itself, however it is spelled", () => {
    expect(resolveParentOrganization("Intuit Inc.", "Intuit Inc.")).toBe("");
    expect(resolveParentOrganization("Nuro Inc.", "Nuro")).toBe("");
    expect(resolveParentOrganization("El Camino Health", "El Camino Health")).toBe("");
    expect(resolveParentOrganization("Microsoft Corporation", "microsoft corp")).toBe("");
  });

  it("keeps a genuine parent", () => {
    expect(resolveParentOrganization("LinkedIn Corporation", "Microsoft Corporation")).toBe("Microsoft Corporation");
    expect(resolveParentOrganization("Google LLC", "Alphabet Inc.")).toBe("Alphabet Inc.");
    expect(resolveParentOrganization("Palo Alto Medical Foundation", "Sutter Health")).toBe("Sutter Health");
  });

  it("treats a missing or blank parent as no parent", () => {
    expect(resolveParentOrganization("Pure Storage Inc.")).toBe("");
    expect(resolveParentOrganization("Pure Storage Inc.", "   ")).toBe("");
  });
});
