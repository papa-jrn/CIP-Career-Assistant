import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import {
  buildCanonicalEmployers,
  clearEmployerAlias,
  employerMatch,
  loadEmployerAliases,
  normOrg,
  resolveEmployerName,
  setEmployerAlias,
} from "@/lib/cip/employer-resolution";

const USER = "user-1";
const NOW = "2026-09-23T00:00:00.000Z";
const now = () => NOW;

describe("employerMatch (conservative)", () => {
  it("matches an exact normalized name and an acronym", () => {
    expect(employerMatch(normOrg("Hypertherm"), normOrg("Hypertherm Inc."))).toBe("exact");
    expect(employerMatch(normOrg("DHMC"), normOrg("Dartmouth-Hitchcock Medical Center"))).toBe("acronym");
  });

  it("matches on a full multi-token subset, but not on a single shared generic token", () => {
    expect(employerMatch(normOrg("Dartmouth-Hitchcock"), normOrg("Dartmouth-Hitchcock Medical Center"))).toBe("tokens");
    // The crucial guard: two distinct siblings that share only "dartmouth" must NOT merge.
    expect(employerMatch(normOrg("Dartmouth College"), normOrg("Dartmouth Health"))).toBeNull();
    expect(employerMatch(normOrg("Acme Robotics"), normOrg("Acme Foods"))).toBeNull();
  });
});

describe("resolveEmployerName", () => {
  const canon = buildCanonicalEmployers(["Dartmouth Health", "Dartmouth College", "Hypertherm"]);

  it("resolves an acronym to the right sibling and leaves distinct siblings alone", () => {
    expect(resolveEmployerName("Dartmouth Health System", canon, new Map()).canonical).toBe("Dartmouth Health");
    // "Dartmouth" alone is ambiguous/generic — do not guess between College and Health.
    expect(resolveEmployerName("Dartmouth", canon, new Map()).canonical).toBeNull();
  });

  it("lets a saved alias win, including one that forces 'unresolved'", () => {
    const confirm = new Map([[normOrg("DH"), "Dartmouth Health"]]);
    expect(resolveEmployerName("DH", canon, confirm)).toMatchObject({ canonical: "Dartmouth Health", basis: "alias" });
    const forceNone = new Map([[normOrg("Hypertherm"), ""]]);
    expect(resolveEmployerName("Hypertherm", canon, forceNone)).toMatchObject({ canonical: null, basis: "alias" });
  });
});

describe("alias persistence", () => {
  it("saves, updates in place, loads, and clears an alias", async () => {
    const { client, db } = createFakeSupabase();
    await setEmployerAlias(client, USER, "DHMC", "Dartmouth Health", now);
    expect(db.employer_aliases).toHaveLength(1);
    expect(db.employer_aliases[0]).toMatchObject({ alias_norm: "dhmc", canonical_name: "Dartmouth Health" });

    await setEmployerAlias(client, USER, "DHMC", "", now); // change the correction to "force unresolved"
    expect(db.employer_aliases).toHaveLength(1);
    expect(db.employer_aliases[0].canonical_name).toBe("");

    const map = await loadEmployerAliases(client, USER);
    expect(map.get("dhmc")).toBe("");

    await clearEmployerAlias(client, USER, "DHMC");
    expect(db.employer_aliases).toHaveLength(0);
  });
});
