import { describe, expect, it, vi } from "vitest";
import { FIXTURE_NOW, fixtureArea, fixtureStrategicState } from "@/lib/cip/__fixtures__/search-fixtures";
import {
  addUsage,
  checkBudget,
  DEFAULT_LIMITS,
  EMPTY_USAGE,
  estimateCost,
  loadJobSearchConfig,
  parsePricing,
} from "@/lib/cip/job-search-config";
import {
  buildStepRequest,
  createOpenAiProvider,
  dedupeWithinRun,
  parseStepPayload,
  planSearchSteps,
  retryDelayMs,
} from "@/lib/cip/job-search-engine";
import {
  findPassedDeadline,
  htmlToText,
  judgeVerification,
  pageContainsRequisition,
  pageContainsTitle,
  verificationFetchUrl,
  verifyPosting,
  verifyPostings,
} from "@/lib/cip/job-verifier";
import { assembleSearchBrief, toOutboundFacets } from "@/lib/cip/search-brief";

const NOW = "2026-09-23T12:00:00.000Z";

function facets(extra = {}) {
  return toOutboundFacets(
    assembleSearchBrief({
      strategicState: fixtureStrategicState(),
      preferences: { anchors: [fixtureArea], workModes: ["hybrid", "remote"], ...extra },
      now: FIXTURE_NOW,
    }),
  );
}

describe("job search config", () => {
  it("defaults to a reasoning model and never invents pricing", () => {
    const config = loadJobSearchConfig(() => undefined);
    expect(config.model).toBe("gpt-5.4");
    expect(config.pricing).toBeNull();
    expect(config.configured).toBe(false);
    expect(config.limits).toMatchObject({ maxScopes: 12, maxPostings: 25, maxRunCostUsd: 1 });
  });

  it("reads the model, key presence, and a spend ceiling from the environment", () => {
    const env: Record<string, string> = { JOB_SEARCH_MODEL: "gpt-5.4-mini", OPENAI_API_KEY: "sk-test", JOB_SEARCH_MAX_RUN_COST_USD: "0.5" };
    const config = loadJobSearchConfig((name) => env[name]);
    expect(config).toMatchObject({ model: "gpt-5.4-mini", configured: true });
    expect(config.limits.maxRunCostUsd).toBe(0.5);
  });

  it("treats malformed pricing as not configured", () => {
    expect(parsePricing("not json")).toBeNull();
    expect(parsePricing('{"inputPerMillionTokensUsd":1}')).toBeNull();
    expect(parsePricing('{"inputPerMillionTokensUsd":1,"outputPerMillionTokensUsd":2,"perWebSearchCallUsd":0.01}')).not.toBeNull();
  });

  it("reports cost as unavailable without pricing, and computes it with pricing", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000, reasoningTokens: 0, webSearchCalls: 10 };
    expect(estimateCost(usage, null)).toEqual({ usd: null, basis: "unavailable" });
    const pricing = { inputPerMillionTokensUsd: 2, outputPerMillionTokensUsd: 8, perWebSearchCallUsd: 0.01 };
    expect(estimateCost(usage, pricing)).toEqual({ usd: 6.1, basis: "estimated" });
  });

  it("stops on step, token, call, or spend limits", () => {
    const base = { limits: DEFAULT_LIMITS, pricing: null };
    expect(checkBudget(EMPTY_USAGE, 0, base).ok).toBe(true);
    expect(checkBudget(EMPTY_USAGE, DEFAULT_LIMITS.maxSteps, base)).toMatchObject({ ok: false });
    expect(checkBudget({ ...EMPTY_USAGE, inputTokens: 500_000 }, 1, base)).toMatchObject({ ok: false });
    expect(checkBudget({ ...EMPTY_USAGE, webSearchCalls: 61 }, 1, base)).toMatchObject({ ok: false });
    const priced = { limits: DEFAULT_LIMITS, pricing: { inputPerMillionTokensUsd: 10, outputPerMillionTokensUsd: 10, perWebSearchCallUsd: 0 } };
    expect(checkBudget({ ...EMPTY_USAGE, inputTokens: 100_001 }, 1, priced)).toMatchObject({ ok: false });
    expect(checkBudget(addUsage(EMPTY_USAGE, { ...EMPTY_USAGE, inputTokens: 1000 }), 1, priced).ok).toBe(true);
  });
});

describe("verification judgment", () => {
  const posting = { title: "Director, Office of Community Outreach and Engagement", requisitionId: "1012314", sourceUrl: "https://example.org/postings/1" };
  const livePage = (body: string) => ({ status: 200, text: `<html><body><h1>${body}</h1><p>${"Job description text. ".repeat(40)}</p></body></html>` });

  it("verifies only when the page shows the title and the requisition ID", () => {
    const result = judgeVerification(livePage("Director, Office of Community Outreach and Engagement - Req 1012314"), posting, NOW);
    expect(result.state).toBe("verified_open");
  });

  it("does not verify a live-looking page that lacks the title (the removed-posting shell)", () => {
    const shell = { status: 200, text: `<html><body>${"Welcome to our careers site. Search jobs. ".repeat(40)}</body></html>` };
    expect(judgeVerification(shell, posting, NOW).state).toBe("discovered_unverified");
  });

  it("does not verify a title match when the reported requisition ID is missing from the page", () => {
    const result = judgeVerification(livePage("Director, Office of Community Outreach and Engagement"), posting, NOW);
    expect(result.state).toBe("discovered_unverified");
    expect(result.note).toMatch(/requisition ID/);
  });

  it("verifies on title alone when no requisition ID was reported", () => {
    const result = judgeVerification(livePage("Director, Office of Community Outreach and Engagement"), { ...posting, requisitionId: null }, NOW);
    expect(result.state).toBe("verified_open");
  });

  it("ignores a requisition ID too short to be distinctive and lets the title decide", () => {
    const short = { ...posting, requisitionId: "R-1" };
    expect(judgeVerification(livePage("Director, Office of Community Outreach and Engagement"), short, NOW).state).toBe("verified_open");
  });

  it("does not verify a posting whose own page lists a deadline that has passed", () => {
    const page = livePage("Director, Office of Community Outreach and Engagement. Application Deadline: September 18, 2026");
    const result = judgeVerification(page, posting, NOW);
    expect(result.state).toBe("source_reports_closed");
    expect(result.note).toMatch(/deadline \(September 18, 2026\).*passed/);
  });

  it("also reads deadline text the search reported, not only the page", () => {
    const result = judgeVerification(
      livePage("Director, Office of Community Outreach and Engagement"),
      { ...posting, statedDates: "Published 19 days ago; Application Deadline: September 18, 2026" },
      NOW,
    );
    expect(result.state).toBe("source_reports_closed");
  });

  it("finds passed deadlines in several formats and ignores future, mixed, and rolling ones", () => {
    const today = "2026-09-23T12:00:00.000Z";
    expect(findPassedDeadline("Deadline: 9/18/2026", today)).toBe("9/18/2026");
    expect(findPassedDeadline("Closing date - Sept 1, 2026", today)).toBe("Sept 1, 2026");
    expect(findPassedDeadline("Applications due October 15, 2026", today)).toBeNull();
    expect(findPassedDeadline("Deadline: September 23, 2026", today)).toBeNull(); // the deadline day itself is still open
    expect(findPassedDeadline("Deadline: Sep 1, 2026. Final deadline: Oct 30, 2026", today)).toBeNull();
    expect(findPassedDeadline("Posted 12/19/2025. Open Until Filled. Deadline: 1/5/2026", today)).toBeNull();
    expect(findPassedDeadline("Posted 12/19/2025 Hiring range $129,500", today)).toBeNull();
  });

  it("recognizes an explicit closure statement", () => {
    const page = livePage("Director, Office of Community Outreach and Engagement. This position is no longer accepting applications.");
    expect(judgeVerification(page, posting, NOW).state).toBe("source_reports_closed");
  });

  it("calls only 404/410 'no longer visible', and treats blocks, login walls, and errors as unavailable", () => {
    expect(judgeVerification({ status: 404, text: "" }, posting, NOW).state).toBe("no_longer_visible");
    expect(judgeVerification({ status: 410, text: "" }, posting, NOW).state).toBe("no_longer_visible");
    for (const status of [401, 403, 429, 500, 503]) {
      expect(judgeVerification({ status, text: "" }, posting, NOW).state).toBe("verification_unavailable");
    }
    expect(judgeVerification(null, posting, NOW).state).toBe("verification_unavailable");
  });

  it("flags a nearly empty page as possibly script-rendered rather than concluding anything", () => {
    const result = judgeVerification({ status: 200, text: "<html><body><div id='app'></div><script>load()</script></body></html>" }, posting, NOW);
    expect(result.state).toBe("discovered_unverified");
    expect(result.note).toMatch(/script/);
  });

  it("matches titles by whole phrase or nearly all meaningful words, and ignores markup and scripts", () => {
    expect(htmlToText("<script>var title='Executive Director'</script><b>Hello</b>&nbsp;world &amp; more")).toBe("Hello world & more");
    expect(htmlToText("Pediatrician &ndash; Elliot Health &#8211; &#x2013; it&rsquo;s &lt;ok&gt; &amp;amp;")).toBe("Pediatrician – Elliot Health – – it’s <ok> &amp;");
    expect(pageContainsTitle("Senior Media Relations Officer at the College", "Senior Media Relations Officer")).toBe(true);
    expect(pageContainsTitle("Media Relations Assistant", "Senior Media Relations Officer")).toBe(false);
    expect(pageContainsRequisition("Requisition: REQ-1012314", "1012314")).toBe(true);
    expect(pageContainsRequisition("Requisition: REQ-999", "1012314")).toBe(false);
  });

  it("fetches iCIMS job pages with in_iframe=1 (the plain address is an empty wrapper) and leaves other URLs alone", async () => {
    expect(verificationFetchUrl("https://careers-x.icims.com/jobs/41685/some-title/job")).toBe("https://careers-x.icims.com/jobs/41685/some-title/job?in_iframe=1");
    expect(verificationFetchUrl("https://careers-x.icims.com/jobs/41685/some-title/job?in_iframe=1")).toBe("https://careers-x.icims.com/jobs/41685/some-title/job?in_iframe=1");
    expect(verificationFetchUrl("https://careers-x.icims.com/jobs/search?ss=1")).toBe("https://careers-x.icims.com/jobs/search?ss=1");
    expect(verificationFetchUrl("https://example.org/jobs/41685/x/job")).toBe("https://example.org/jobs/41685/x/job");
    expect(verificationFetchUrl("not a url")).toBe("not a url");
    const seen: string[] = [];
    await verifyPosting({ title: "T", sourceUrl: "https://careers-x.icims.com/jobs/1/t/job" }, async (url) => (seen.push(url), { status: 200, text: "" }));
    expect(seen).toEqual(["https://careers-x.icims.com/jobs/1/t/job?in_iframe=1"]);
  });

  it("verifies many postings with bounded concurrency and preserves order", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetcher = vi.fn(async (url: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((done) => setTimeout(done, 5));
      inFlight -= 1;
      return url.endsWith("/gone") ? { status: 404, text: "" } : { status: 200, text: `Executive Director ${"x ".repeat(300)}` };
    });
    const postings = ["a", "gone", "b", "c", "d"].map((slug) => ({ title: "Executive Director", sourceUrl: `https://example.org/${slug}` }));
    const results = await verifyPostings(postings, 2, fetcher);
    expect(results.map((result) => result.state)).toEqual(["verified_open", "no_longer_visible", "verified_open", "verified_open", "verified_open"]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("planSearchSteps", () => {
  it("checks target career pages first, then preferred sources, then general scopes", () => {
    const steps = planSearchSteps(facets({ preferredSources: ["higheredjobs.com"] }), DEFAULT_LIMITS);
    expect(steps[0]).toMatchObject({ tier: "target_page", index: 0 });
    expect(steps[0].targets).toEqual(["Riverbend Health", "Granite Community Trust", "Valley Arts Council"]);
    expect(steps.map((step) => step.tier)).toEqual(["target_page", "preferred_source", "general", "general", "general"].slice(0, steps.length));
    expect(steps.find((step) => step.tier === "preferred_source")?.domains).toEqual(["higheredjobs.com"]);
  });

  it("omits the preferred-source step when none are configured, and is capped by maxSteps", () => {
    expect(planSearchSteps(facets(), DEFAULT_LIMITS).some((step) => step.tier === "preferred_source")).toBe(false);
    expect(planSearchSteps(facets(), { ...DEFAULT_LIMITS, maxSteps: 2 })).toHaveLength(2);
  });

  it("plans no local search when there are no anchors, and no remote", () => {
    const noWhere = toOutboundFacets(assembleSearchBrief({ strategicState: fixtureStrategicState(), preferences: {}, now: FIXTURE_NOW }));
    expect(planSearchSteps(noWhere, DEFAULT_LIMITS).every((step) => step.tier === "target_page")).toBe(true);
  });
});

describe("buildStepRequest (privacy and shape)", () => {
  const private_ = { exclusions: { industries: ["Tobacco"], employers: ["Blocked Corp"] }, remoteLimits: "secret limit", salaryFloorUsd: 87_400 };
  const outbound = facets(private_);
  const step = planSearchSteps(outbound, DEFAULT_LIMITS)[0];
  const request = buildStepRequest(step, outbound, { model: "gpt-5.4", limits: DEFAULT_LIMITS });
  const text = JSON.stringify(request);

  it("never sends exclusions or private constraints", () => {
    for (const secret of ["Tobacco", "Blocked Corp", "secret limit", "87400"]) expect(text).not.toContain(secret);
    expect(text).toContain("85000");
  });

  it("uses the configured model, a strict schema, a tool-call cap, and forbids gated sites", () => {
    expect(request.model).toBe("gpt-5.4");
    expect(request.max_tool_calls).toBe(DEFAULT_LIMITS.maxToolCallsPerStep);
    expect(request.text.format.strict).toBe(true);
    expect(text).toMatch(/Do not use LinkedIn or Indeed/);
    expect(text).toMatch(/untrusted data/);
    expect(text).toContain("Riverbend Health");
  });
});

function payload(overrides: { postings?: unknown[]; status?: string; text?: string } = {}) {
  const body = {
    summary: "ok",
    employers_checked: [{ name: "Riverbend Health", careers_page_url: "https://jobs.example.org/", status: "read_openings", note: "" }],
    postings: overrides.postings ?? [
      {
        title: "Program Operations Lead",
        employer: "Riverbend Health",
        worksite_text: "Lebanon, NH",
        source_url: "https://jobs.example.org/postings/42",
        requisition_id: "R-42",
        posted_or_closing_date: null,
        salary_text: null,
        remote_status: "hybrid",
        matched_role_term: "Program Operations Lead",
        evidence_excerpt: "Program Operations Lead",
      },
    ],
  };
  return {
    status: overrides.status ?? "completed",
    usage: { input_tokens: 30_000, output_tokens: 1_300, output_tokens_details: { reasoning_tokens: 378 } },
    output: [
      { type: "web_search_call", action: { type: "search", query: "riverbend health careers" } },
      { type: "web_search_call", action: { type: "open_page", url: "https://jobs.example.org/" } },
      { type: "message", content: [{ type: "output_text", text: overrides.text ?? JSON.stringify(body) }] },
    ],
  };
}

describe("parseStepPayload", () => {
  it("validates a good answer and records usage and the searches/pages the model used", () => {
    const result = parseStepPayload(payload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.postings).toHaveLength(1);
    expect(result.usage).toEqual({ inputTokens: 30_000, outputTokens: 1_300, reasoningTokens: 378, webSearchCalls: 2 });
    expect(result.actions).toEqual(["search: riverbend health careers", "open_page: https://jobs.example.org/"]);
    expect(result.incomplete).toBe(false);
  });

  it("fails clearly on missing text, bad JSON, and schema violations, but still reports usage", () => {
    expect(parseStepPayload({ output: [] })).toMatchObject({ ok: false });
    expect(parseStepPayload(payload({ text: "not json" }))).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) });
    const bad = parseStepPayload(payload({ text: JSON.stringify({ summary: 1 }) }));
    expect(bad).toMatchObject({ ok: false, error: expect.stringMatching(/validation/) });
    expect(bad.usage.webSearchCalls).toBe(2);
  });

  it("drops postings with unusable URLs before verification and says why", () => {
    const base = {
      title: "Some Role",
      employer: "X",
      worksite_text: null,
      requisition_id: null,
      posted_or_closing_date: null,
      salary_text: null,
      remote_status: "not_stated",
      matched_role_term: "",
      evidence_excerpt: "",
    };
    const result = parseStepPayload(
      payload({
        postings: [
          { ...base, source_url: "https://jobs.example.org/" },
          { ...base, source_url: "javascript:alert(1)" },
          { ...base, source_url: "not a url" },
          { ...base, source_url: "https://jobs.example.org/p/1" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.postings).toHaveLength(1);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      expect.stringMatching(/home page/),
      expect.stringMatching(/http/),
      expect.stringMatching(/valid URL/),
    ]);
  });

  it("flags an answer cut off by the output cap", () => {
    const result = parseStepPayload(payload({ status: "incomplete" }));
    expect(result.ok && result.incomplete).toBe(true);
  });
});

describe("dedupeWithinRun", () => {
  it("collapses repeats by URL (ignoring fragments and www) and by employer + requisition", () => {
    const item = (source_url: string, requisition_id: string | null, employer = "Acme") => ({ source_url, requisition_id, employer });
    const result = dedupeWithinRun([
      item("https://www.example.org/postings/87308", "1012314"),
      item("https://example.org/postings/87308#apply", "1012314"),
      item("https://example.org/postings/other-url", "1012314"),
      item("https://example.org/postings/2", null),
      item("https://example.org/postings/3", "1012314", "Other Employer"),
    ]);
    expect(result.map((entry) => entry.source_url)).toEqual([
      "https://www.example.org/postings/87308",
      "https://example.org/postings/2",
      "https://example.org/postings/3",
    ]);
  });
});

describe("provider retries", () => {
  const ok = () => new Response(JSON.stringify({ output: [] }), { status: 200 });
  const rateLimited = () =>
    new Response(JSON.stringify({ error: { message: "Rate limit reached. Please try again in 1.497s." } }), { status: 429 });

  it("honors the server's suggested wait, capped, with a floor", () => {
    expect(retryDelayMs("Please try again in 7.118s.", 1)).toBe(7_618);
    expect(retryDelayMs("try again in 250ms", 1)).toBe(750);
    expect(retryDelayMs("try again in 999s", 1)).toBe(20_000);
    expect(retryDelayMs("no hint", 2)).toBe(4_000);
  });

  it("retries a 429 and then succeeds, waiting between attempts", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValueOnce(ok());
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await createOpenAiProvider("k", { fetchImpl: fetchImpl as never, sleep }).runStep({ model: "m" });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_997);
  });

  it("gives up after bounded attempts instead of looping", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => rateLimited());
    const result = await createOpenAiProvider("k", { fetchImpl: fetchImpl as never, sleep: async () => {} }).runStep({});
    expect(result).toMatchObject({ ok: false, status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries once without max_tool_calls when a model rejects it, and does not retry other errors", async () => {
    const reject = () => new Response("Unsupported parameter: max_tool_calls", { status: 400 });
    const fetchImpl = vi.fn().mockResolvedValueOnce(reject()).mockResolvedValueOnce(ok());
    const provider = createOpenAiProvider("k", { fetchImpl: fetchImpl as never, sleep: async () => {} });
    expect((await provider.runStep({ model: "m", max_tool_calls: 5 })).ok).toBe(true);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).not.toHaveProperty("max_tool_calls");

    const failing = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const result = await createOpenAiProvider("k", { fetchImpl: failing as never }).runStep({});
    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
