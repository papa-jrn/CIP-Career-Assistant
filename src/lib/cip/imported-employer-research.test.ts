import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchImportedEmployer } from "./imported-employer-research";
import { buildImportedJob, importedJobInput } from "./imported-jobs";

const posting = "https://jobs.ashbyhq.com/Example/role-123";
const business = "https://example.org/about";
const careers = "https://example.org/careers";
const job = buildImportedJob(importedJobInput.parse({
  title: "Chief of Staff", employer: "Example Company", sourceUrl: posting,
  originalMaterial: "Lead internal operations and coordinate cross-functional projects. Report to the CEO and improve operational processes across the remote technology company.",
}), { importId: "test", capturedAt: "2026-10-22T12:00:00Z" });
const businessQuote = "Example Company builds purchasing software for veterinary clinics.";
const careersQuote = "Example Company is hiring a Chief of Staff.";
function response(overrides = {}, withSources = true) {
  return new Response(JSON.stringify({ output: [
    { type: "web_search_call", action: { type: "search", sources: withSources ? [{ url: business }, { url: careers }] : [] } },
    { type: "message", content: [{ type: "output_text", text: JSON.stringify({ employerPage: { url: business, quote: businessQuote }, careersPage: { url: careers, quote: careersQuote }, businessConsistency: "consistent", explanation: "An internal operations role is consistent with the described software business, though active hiring remains unknown.", confidence: "medium", ...overrides }) }] },
  ] }), { status: 200 });
}
const pages = async (url: string) => ({ status: 200, text: url === business ? `<p>${businessQuote}</p>` : `<p>${careersQuote}</p><a href="${posting}?utm_source=careers">Chief of Staff</a>` });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", ""); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("imported employer research", () => {
  it("keeps an honest deterministic fallback when not configured", async () => {
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    expect(await researchImportedEmployer(job, pages)).toMatchObject({ status: "unavailable", businessConsistency: "unknown", listingCorroborated: false });
    expect(network).not.toHaveBeenCalled();
  });
  it("grounds company consistency and a careers-to-ATS connection in fetched sources", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn(async () => response()));
    const result = await researchImportedEmployer(job, pages);
    expect(result).toMatchObject({ status: "completed", businessConsistency: "consistent", confidence: "medium", listingCorroborated: true });
    expect(result.sources).toHaveLength(2);
    const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(request).toMatchObject({ max_tool_calls: 4, max_output_tokens: 2200, text: { format: { type: "json_schema", strict: true } } });
    expect(request.input[1].content).not.toContain("userContext");
  });
  it("reads unquoted career links and requires the title on the actual link", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn(async () => response()));
    const result = await researchImportedEmployer(job, async url => url === business ? pages(url) : ({ status: 200, text: `<p>${careersQuote}</p><a href=${posting} target='_blank'><h4>Chief of Staff</h4></a>` }));
    expect(result.listingCorroborated).toBe(true);
    const unrelated = await researchImportedEmployer(job, async url => url === business ? pages(url) : ({ status: 200, text: `<p>${careersQuote}</p><a href="${posting}">Engineer</a>` }));
    expect(unrelated.listingCorroborated).toBe(false);
  });
  it("offers an alternate role from the employer careers page without equating two postings", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn(async () => response()));
    const result = await researchImportedEmployer({ ...job, sourceUrl: "https://www.indeed.com/viewjob?jk=correct", sourceLinks: [] }, pages);
    expect(result.listingCorroborated).toBe(false);
    expect(result.matchingRoleUrl).toBe(posting);
  });
  it("accepts independently grounded pages when provider URL metadata is missing, but rejects invented quotes", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn(async () => response({}, false)));
    const reader = vi.fn(pages);
    expect(await researchImportedEmployer(job, reader)).toMatchObject({ status: "completed", listingCorroborated: true });
    expect(reader).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    expect((await researchImportedEmployer(job, async () => ({ status: 200, text: "A different company with no matching quote" }))).status).toBe("unavailable");
  });
  it("does not corroborate a different Indeed posting with the same path", async () => {
    const indeedJob = { ...job, sourceUrl: "https://www.indeed.com/viewjob?jk=correct", sourceLinks: [] };
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn(async () => response()));
    const result = await researchImportedEmployer(indeedJob, async url => url === business ? pages(url) : ({ status: 200, text: `<p>${careersQuote}</p><a href="https://www.indeed.com/viewjob?jk=wrong">Chief of Staff</a>` }));
    expect(result.listingCorroborated).toBe(false);
  });
  it("treats blocked pages and insufficient job descriptions as unknown", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn(async () => response()));
    expect((await researchImportedEmployer(job, async () => ({ status: 403, text: "Access denied" }))).status).toBe("unavailable");
    expect((await researchImportedEmployer({ ...job, originalMaterial: "", sourceLinks: [] }, pages)).businessConsistency).toBe("unknown");
  });
  it("falls back on provider timeout, error and malformed output", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    for (const provider of [async () => { throw new DOMException("timeout", "TimeoutError"); }, async () => new Response("failed", { status: 500 }), async () => response({ confidence: "certain" })]) {
      vi.stubGlobal("fetch", vi.fn(provider));
      expect(await researchImportedEmployer(job, pages)).toMatchObject({ status: "unavailable", businessConsistency: "unknown" });
    }
  });
});

describe("employer research source boundaries", () => {
  it("normalizes research tracking URLs without repeating ungrounded careers claims", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const original = response({ explanation: "The careers link verifies the supplied Ashby posting." });
    const payload = await original.json();
    payload.output[0].action.sources[1].url += "?trk=public_post-text";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
    const result = await researchImportedEmployer(job, pages);
    expect(result.listingCorroborated).toBe(true);
    expect(result.note).not.toContain("verifies the supplied Ashby");
    expect(result.note).toContain("listing attribution is reported separately");
  });
});

describe("repeatable grounded research", () => {
  it("does not vary solely because source metadata changes between checks", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const provider = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response({}, false)).mockResolvedValueOnce(response({}, false));
    vi.stubGlobal("fetch", provider);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await researchImportedEmployer(job, pages)).toMatchObject({ status: "completed", businessConsistency: "consistent", listingCorroborated: true });
    }
  });
  it("normalizes typographic quotes while still requiring actual page evidence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn(async () => response({ employerPage: { url: business, quote: "Example Company's software helps clinics." } })));
    const result = await researchImportedEmployer(job, async url => url === business ? ({ status: 200, text: "<p>Example Company’s software helps clinics.</p>" }) : pages(url));
    expect(result.sources.some(source => source.purpose === "business")).toBe(true);
  });
  it("does not invent evidence for unreachable or private candidate URLs", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn(async () => response({ employerPage: { url: "http://127.0.0.1/private", quote: businessQuote }, careersPage: null }, false)));
    const guarded = vi.fn(async () => null);
    expect((await researchImportedEmployer(job, guarded)).status).toBe("unavailable");
    expect(guarded).toHaveBeenCalledWith("http://127.0.0.1/private");
  });
  it("preserves one grounded source if the other read throws", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubGlobal("fetch", vi.fn(async () => response()));
    const result = await researchImportedEmployer(job, async url => { if (url === careers) throw Error("network failed"); return pages(url); });
    expect(result).toMatchObject({ status: "completed", businessConsistency: "consistent", listingCorroborated: false });
    expect(result.sources).toHaveLength(1);
  });
  it("requires an actual web search call and independent evidence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const payload = await response().json(); payload.output.shift();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
    const reader = vi.fn(pages);
    expect((await researchImportedEmployer(job, reader)).status).toBe("unavailable");
    expect(reader).not.toHaveBeenCalled();
  });
});

describe("business explanation", () => {
  it("retains useful business reasoning while removing unsupported careers sentences", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", vi.fn(async () => response({ explanation: "Internal operations supports the company's veterinary purchasing software business. The careers link verifies the Ashby posting. A CEO-facing coordination role is consistent with that operating context." })));
    const result = await researchImportedEmployer(job, pages);
    expect(result.note).toContain("veterinary purchasing software business");
    expect(result.note).toContain("CEO-facing coordination");
    expect(result.note).not.toContain("verifies the Ashby");
  });
});
