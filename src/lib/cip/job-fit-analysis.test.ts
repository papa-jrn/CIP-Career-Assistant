import { DIMENSIONS, type CompetitiveDimension } from "./competitiveness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessImportedJobFitWithAi, assessImportedJobFit, parseImportedJobFit, importedJobFitPayload, type FitContext } from "./imported-job-fit";
import { scoreFit, isUnestablishedPersonalClaim, type DetailedFit } from "./job-fit-analysis";
import { buildImportedJob, importedJobInput } from "./imported-jobs";
const at = "2026-10-23T12:00:00Z";
const description = "Lead internal operations and coordinate cross-functional projects. Build processes and support the CEO. Bachelor's degree required. Equivalent experience is accepted for the operations experience requirement. Fully remote. Salary $150,000.";
const job = buildImportedJob(importedJobInput.parse({ title: "Chief of Staff", employer: "Example", sourceUrl: "https://example.org/job", originalMaterial: description }), { importId: "test", capturedAt: "2026-10-22T12:00:00Z" });
const context: FitContext = { laneRoles: ["Executive leadership", "Technology leadership", "Product founder"], workModes: ["remote"], exclusions: { industries: [], roles: [], employers: [] }, profileEvidence: [{ refId: "resume", kind: "user", detail: "Bachelor's degree in business. Led internal operations, built processes and coordinated cross-functional projects for a remote software business." }, { refId: "strategy", kind: "inference", detail: "A technology leadership lane may suit the user's goals." }] };
const dimensions = (): CompetitiveDimension[] => DIMENSIONS.map(dimension => ({ dimension, rating: "direct", evidenceStrength: "concrete", explanation: "A concrete example establishes relevant work at comparable scope.", postingQuote: "Lead internal operations", evidenceRefs: ["resume"] }));
const reading = () => ({ competitiveness: dimensions(), summary: "Your operations experience aligns with this executive-partner role, with some scope still to confirm.", lanes: context.laneRoles.map(role => ({ role, alignment: "strong", explanation: "Operations and cross-functional leadership are transferable into this lane.", postingQuote: "Lead internal operations", evidenceRefs: ["resume"] })), requirements: [
  { requirement: "Bachelor's degree", importance: "required", status: "supported", explanation: "Your original resume states the required degree.", postingQuote: "Bachelor's degree required.", evidence: [{ refId: "resume", quote: "Bachelor's degree in business." }] },
  { requirement: "Operations leadership", importance: "required", status: "supported", explanation: "The original resume describes operations leadership.", postingQuote: "Lead internal operations", evidence: [{ refId: "resume", quote: "Led internal operations" }] },
], nextAction: "Compare team scope and decision authority with your goals before investing more effort.", recommendation: "talk_first", confidence: "medium" });
function ai(value: unknown) { vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }), { status: 200 }))); }
beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("personal job-fit analysis", () => {
  it("provides an honest unscored fallback and all three lanes without AI", async () => {
    const fit = await assessImportedJobFitWithAi(job, context, at);
    expect(fit.analysis?.score).toBeNull();
    expect(fit.analysis?.lanes.map(lane => lane.role)).toEqual(context.laneRoles);
    expect(fit.analysis?.requirements[0].status).toBe("supported");
  });
  it("scores grounded comparisons and preserves them through storage", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); ai(reading());
    const fit = await assessImportedJobFitWithAi(job, context, at);
    expect(fit.basis).toBe("ai_assisted");
    expect(fit.analysis?.rubricVersion).toBe(3);
    expect(fit.analysis?.score).toBeGreaterThanOrEqual(7);
    expect(fit.analysis?.score).toBeLessThanOrEqual(9);
    expect(parseImportedJobFit(JSON.stringify(importedJobFitPayload(fit)), at)?.analysis).toEqual(fit.analysis);
  });
  it("rejects invented posting or profile quotes and missing or invented lanes", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const badReadings = [
      { ...reading(), lanes: reading().lanes.slice(0, 2) },
      { ...reading(), lanes: reading().lanes.map(lane => ({ ...lane, role: "Invented lane" })) },
      { ...reading(), requirements: reading().requirements.map(item => ({ ...item, postingQuote: "Must have 20 years of fabricated experience" })) },
      { ...reading(), requirements: reading().requirements.map(item => ({ ...item, evidence: [{ refId: "resume", quote: "I have a PhD in veterinary medicine." }] })) },
    ];
    for (const value of badReadings) { ai(value); expect((await assessImportedJobFitWithAi(job, context, at)).basis).toBe("deterministic"); }
  });
  it("does not treat inferred career positioning as proof of a requirement", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const value = reading(); value.requirements[0].evidence = [{ refId: "strategy", quote: "A technology leadership lane may suit the user's goals." }]; ai(value);
    const result = await assessImportedJobFitWithAi(job, context, at);
    expect(result.basis).toBe("ai_assisted");
    expect(result.analysis?.requirements[0].status).toBe("unknown");
    expect(result.analysis?.score).toBeLessThanOrEqual(6);
  });
  it("keeps missing mandatory education unknown and caps the score", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const value = reading(); value.requirements[0].status = "gap"; value.requirements[0].evidence = [{ refId: "resume", quote: "Led internal operations" }]; ai(value);
    const fit = await assessImportedJobFitWithAi(job, context, at);
    expect(fit.analysis?.requirements[0].status).toBe("unknown");
    expect(fit.analysis?.score).toBeLessThanOrEqual(6);
    expect(fit.confidence).toBe("low");
  });
  it("does not let a model omit a required credential to inflate the score", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); const value = reading(); value.requirements.shift(); ai(value);
    const fit = await assessImportedJobFitWithAi(job, { ...context, profileEvidence: [{ refId: "resume", kind: "user", detail: "Led internal operations and managed a remote team for a software company." }] }, at);
    expect(fit.analysis?.requirements.some(item => /bachelor/i.test(item.requirement))).toBe(true);
    expect(fit.analysis?.score).toBeLessThanOrEqual(6);
  });
  it("falls back for empty personal context, missing descriptions, and provider failures", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); const network = vi.fn(async () => { throw Error("timeout"); }); vi.stubGlobal("fetch", network);
    expect((await assessImportedJobFitWithAi(job, { ...context, profileEvidence: [] }, at)).analysis?.score).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect((await assessImportedJobFitWithAi(job, context, at)).basis).toBe("deterministic");
    expect((await assessImportedJobFitWithAi({ ...job, sourceLinks: [], originalMaterial: "" }, context, at)).analysis?.score).toBeNull();
  });
});
describe("1–10 scoring rubric", () => {
  const lanes = reading().lanes as DetailedFit["lanes"];
  const requirements = reading().requirements as DetailedFit["requirements"];
  it("gives a known mandatory barrier precedence over strong lane matches", () => {
    expect(scoreFit(lanes, [{ ...requirements[0], status: "gap" }], true, false).score).toBe(2);
  });
  it("reserves ten for strong alignment with substantial support and no unknowns", () => {
    expect(scoreFit(lanes, [...requirements, { ...requirements[0], requirement: "Cross-functional execution" }, { ...requirements[1], requirement: "Process improvement" }], true, false, dimensions()).score).toBe(10);
    expect(scoreFit(lanes, [...requirements, { ...requirements[0], status: "unknown" }], true, false, dimensions()).score).toBeLessThanOrEqual(6);
    expect(scoreFit(lanes, requirements, false, false).score).toBeNull();
    expect(scoreFit(lanes, requirements, true, true, dimensions()).score).toBe(scoreFit(lanes, requirements, true, false, dimensions()).score);
  });
});

describe("required versus preferred qualifications", () => {
  it("does not treat a missing preferred degree as a mandatory barrier", () => {
    const lanes = reading().lanes as DetailedFit["lanes"];
    const requirements = reading().requirements as DetailedFit["requirements"];
    const result = scoreFit(lanes, [...requirements, { ...requirements[0], requirement: "Preferred doctorate", importance: "preferred", status: "unknown" }], true, false, dimensions());
    expect(result.score).toBeGreaterThanOrEqual(7);
  });
});

it("constrains generated lane identities, evidence references and posting quotations", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only"); ai(reading());
  await assessImportedJobFitWithAi(job, context, at);
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  const schema = request.text.format.schema.properties;
  expect(schema.lanes.items.properties.role.enum).toEqual(["lane-0", "lane-1", "lane-2"]);
  expect(request.text.format.schema.$defs.profileRef.enum).toEqual(["resume", "strategy"]);
  const input = JSON.parse(request.input[1].content);
  for (const id of request.text.format.schema.$defs.postingQuote.enum) expect(description).toContain(input.postingExcerpts.find((item: { id: string }) => item.id === id).text);
  expect(request.text.format.schema.$defs.profileRef.enum).toEqual(["resume", "strategy"]);
});
it("does not present title-keyword heuristics as a completed lane assessment after failure", async () => {
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.findings.some(item => item.source === "your career lanes")).toBe(false);
  expect(fit.nextAction).toContain("could not be completed");
});

it("retains grounded analysis when one lane lacks supporting evidence", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const value = reading(); value.lanes[0].evidenceRefs = []; ai(value);
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.basis).toBe("ai_assisted");
  expect(fit.analysis?.score).not.toBeNull();
  expect(fit.analysis?.lanes[0].alignment).toBe("unknown");
  expect(fit.analysis?.lanes[1].alignment).toBe("strong");
  expect(fit.analysis?.requirements[0].status).toBe("supported");
});

it("attaches original evidence excerpts when the model selects references without copying quotes", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const value = reading();
  ai({ ...value, requirements: value.requirements.map(item => ({ ...item, evidence: item.evidence.map(ref => ({ refId: ref.refId })) })) });
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.basis).toBe("ai_assisted");
  expect(fit.analysis?.score).not.toBeNull();
  expect(fit.analysis?.requirements[0].evidence[0].quote).toBe(context.profileEvidence![0].detail);
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(request.text.format.schema.properties.requirements.items.properties.evidence.items.properties.quote).toBeUndefined();
});

it("uses safe citation IDs and restores original job quotes and lane names", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, options: RequestInit) => {
    const request = JSON.parse(options.body as string);
    const input = JSON.parse(request.input[1].content);
    const value = reading();
    const quoteId = input.postingExcerpts.find((item: { text: string }) => item.text.includes("Lead internal operations")).id;
    const generated = { ...value, lanes: value.lanes.map((lane, index) => ({ ...lane, role: "lane-" + index, postingQuote: quoteId })), requirements: value.requirements.map(item => ({ ...item, postingQuote: quoteId, evidence: [{ refId: "resume" }] })), competitiveness: value.competitiveness.map(item => ({ ...item, postingQuote: quoteId })) };
    return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(generated) }] }] }));
  }));
  const result = await assessImportedJobFitWithAi(job, context, at);
  expect(result.basis).toBe("ai_assisted");
  expect(result.analysis?.lanes.map(item => item.role)).toEqual(context.laneRoles);
  expect(result.analysis?.lanes[0].postingQuote).toContain("Lead internal operations");
});

it("retains the complete resume portfolio and technical expertise alongside citation excerpts", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only"); ai(reading());
  const first = "Agency developer: responsible for many client websites. Expert in WordPress. " + "Original resume evidence. ".repeat(30);
  const second = "Portfolio: client-one.example, client-two.example. Primary developer for replatforming multiple websites.";
  await assessImportedJobFitWithAi(job, { ...context, profileEvidence: [{ refId: "intake-resume_text-0", kind: "user", detail: first }, { refId: "intake-resume_text-1", kind: "user", detail: second }] }, at);
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  const input = JSON.parse(request.input[1].content);
  expect(input.originalResume).toBe(first + second);
  expect(input.profileEvidence.map((item: { detail: string }) => item.detail).join("")).toBe(first + second);
});

it("does not mistake nonprofit work for a negation of WordPress and HTML/CSS expertise", async () => {
  expect(isUnestablishedPersonalClaim("Built websites for businesses and not-for-profit entities using WordPress and HTML/CSS.")).toBe(false);
  expect(isUnestablishedPersonalClaim("I do not have a nursing license.")).toBe(true);
  expect(isUnestablishedPersonalClaim("I want to become a WordPress developer.")).toBe(true);
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const detail = "Built websites for businesses and not-for-profit entities. Built templates using WordPress and HTML/CSS.";
  const value = reading(); value.requirements[1].evidence = [{ refId: "resume", quote: detail }]; ai(value);
  const fit = await assessImportedJobFitWithAi(job, { ...context, profileEvidence: [{ refId: "resume", kind: "user", detail: "Bachelor's degree in business. " + detail }] }, at);
  expect(fit.analysis?.requirements[1].status).toBe("supported");
});
it("does not promote a posting's named tools into personal experience", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const value = reading(); value.summary = "You have extensive Screaming Frog expertise. Your operations experience is relevant.";
  value.requirements[1].explanation = "You have extensive Screaming Frog expertise in this work."; ai(value);
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.analysis?.summary).not.toContain("extensive Screaming Frog expertise");
  expect(fit.analysis?.requirements[1].status).toBe("unknown");
});

it("preserves a complete summary longer than the old 600-character ceiling", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const value = reading();
  value.summary = "Your documented operations leadership supports several duties in this role. ".repeat(10).trim();
  expect(value.summary.length).toBeGreaterThan(600);
  ai(value);
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.basis).toBe("ai_assisted");
  expect(fit.analysis?.summary).toBe(value.summary);
  expect(parseImportedJobFit(JSON.stringify(importedJobFitPayload(fit)), at)?.analysis?.summary).toBe(value.summary);
  const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(request.text.format.schema.properties.summary.maxLength).toBeUndefined();
  expect(request.max_output_tokens).toBe(4200);
});

it("does not score a response flagged incomplete even if its partial JSON parses", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
    output: [{ content: [{ type: "output_text", text: JSON.stringify(reading()) }] }],
  }))));
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.basis).toBe("deterministic");
  expect(fit.analysis?.score).toBeNull();
  expect(fit.analysis?.limitations.join(" ")).toContain("did not complete");
});

it("rejects the old boundary-cutoff symptom instead of saving it as a complete new assessment", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  const value = reading();
  value.summary = "Grounded experience is relevant. " + "x".repeat(600 - "Grounded experience is relevant. ".length);
  ai(value);
  const fit = await assessImportedJobFitWithAi(job, context, at);
  expect(fit.basis).toBe("deterministic");
  expect(fit.analysis?.score).toBeNull();
  expect(fit.analysis?.limitations.join(" ")).toContain("appears cut off");
});
