import { describe, expect, it } from "vitest";
import {
  careersUrlPayload,
  currentCareersUrls,
  describeCareersUrl,
  isHttpUrl,
  parseCareersUrlCorrection,
  resolveCareersUrl,
  type CareersUrlCorrection,
} from "./employer-careers-url";

const correction = (over: Partial<CareersUrlCorrection> = {}): CareersUrlCorrection => ({
  employerKey: "riverside health",
  employerName: "Riverside Health",
  careersUrl: "https://careers.riverside.org/openings",
  recordedAt: "2026-10-23T12:00:00.000Z",
  ...over,
});

const employer = (careers_url: string | null = "https://guessed.example.org/jobs") =>
  ({ name: "Riverside Health", careers_url });

describe("storing a careers URL", () => {
  it("reads back what was stored", () => {
    const stored = JSON.stringify(careersUrlPayload(correction({ note: "Found it in their footer." })));
    expect(parseCareersUrlCorrection(stored, "now")).toMatchObject({
      employerName: "Riverside Health",
      careersUrl: "https://careers.riverside.org/openings",
      note: "Found it in their footer.",
    });
  });

  it("treats a stored value that is not a usable address as none known", () => {
    // Never hand something unusable to the search.
    const stored = JSON.stringify({ careersUrl: { employerName: "Riverside Health", careersUrl: "javascript:alert(1)" } });
    expect(parseCareersUrlCorrection(stored, "now")?.careersUrl).toBe("");
  });

  it("rejects a record that names no employer", () => {
    expect(parseCareersUrlCorrection(null, "now")).toBeNull();
    expect(parseCareersUrlCorrection("not json", "now")).toBeNull();
    expect(parseCareersUrlCorrection(JSON.stringify({ careersUrl: { careersUrl: "https://x.org" } }), "now")).toBeNull();
  });

  it("accepts only http and https", () => {
    expect(isHttpUrl("https://careers.example.org")).toBe(true);
    expect(isHttpUrl("http://careers.example.org")).toBe(true);
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x.org"]) {
      expect(isHttpUrl(bad)).toBe(false);
    }
  });

  it("lets a later correction supersede an earlier one without deleting it", () => {
    const state = currentCareersUrls([
      correction({ careersUrl: "https://careers.riverside.org/new", recordedAt: "2026-10-23T13:00:00.000Z" }),
      correction({ careersUrl: "https://careers.riverside.org/old", recordedAt: "2026-10-23T12:00:00.000Z" }),
    ]);
    expect(state.get("riverside health")?.careersUrl).toBe("https://careers.riverside.org/new");
  });
});

describe("what the app uses and shows", () => {
  it("uses the discovered URL when the user has not said otherwise", () => {
    const resolved = resolveCareersUrl(employer(), currentCareersUrls([]));
    expect(resolved).toMatchObject({ url: "https://guessed.example.org/jobs", origin: "discovered" });
  });

  it("prefers the user's answer over the discovered one, and remembers what it replaced", () => {
    const resolved = resolveCareersUrl(employer(), currentCareersUrls([correction()]));
    expect(resolved).toMatchObject({
      url: "https://careers.riverside.org/openings",
      origin: "user_supplied",
      replaced: "https://guessed.example.org/jobs",
    });
  });

  it("honours the user saying there is no careers page, rather than falling back to the guess", () => {
    // This is a real answer. Falling back would quietly reinstate the value
    // they just rejected and keep sending the search to the wrong place.
    expect(resolveCareersUrl(employer(), currentCareersUrls([correction({ careersUrl: "" })]))).toBeNull();
  });

  it("matches the employer despite small naming differences", () => {
    const resolved = resolveCareersUrl({ name: "riverside  health", careers_url: null }, currentCareersUrls([correction()]));
    expect(resolved?.origin).toBe("user_supplied");
  });

  it("does not apply one employer's correction to another", () => {
    const resolved = resolveCareersUrl({ name: "Granite Trust", careers_url: null }, currentCareersUrls([correction()]));
    expect(resolved).toBeNull();
  });

  it("reports nothing rather than an unusable discovered value", () => {
    expect(resolveCareersUrl(employer("javascript:alert(1)"), currentCareersUrls([]))).toBeNull();
    expect(resolveCareersUrl(employer(null), currentCareersUrls([]))).toBeNull();
  });
});

describe("how the link is described", () => {
  it("says a discovered URL is a guess that has not been confirmed", () => {
    const text = describeCareersUrl(resolveCareersUrl(employer(), currentCareersUrls([])));
    expect(text).toMatch(/guessed/i);
    expect(text).toMatch(/not been confirmed/i);
  });

  it("says when the user supplied it, and when it replaced a guess", () => {
    expect(describeCareersUrl(resolveCareersUrl({ name: "Riverside Health", careers_url: null }, currentCareersUrls([correction()]))))
      .toBe("Careers page you supplied.");
    expect(describeCareersUrl(resolveCareersUrl(employer(), currentCareersUrls([correction()]))))
      .toMatch(/replacing the one CIP had guessed/i);
  });

  it("explains what happens when no careers page is known", () => {
    const text = describeCareersUrl(null);
    expect(text).toMatch(/no careers page recorded/i);
    expect(text).toMatch(/sector boards and the open web/i);
  });
});
