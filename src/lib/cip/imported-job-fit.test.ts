import { describe, expect, it, vi } from "vitest";
import { buildImportedJob, importedJobInput } from "./imported-jobs";
import {
  assessImportedJobFit,
  assessImportedJobFitWithAi,
  importedJobFitPayload,
  latestFitFor,
  parseImportedJobFit,
  readableRecommendation,
  statedSalary,
  statedWorkModel,
  type FitContext,
} from "./imported-job-fit";

const AT = "2026-10-22T12:00:00.000Z";

const context = (over: Partial<FitContext> = {}): FitContext => ({
  salaryFloorUsd: 95_000,
  workModes: ["remote", "hybrid"],
  exclusions: { industries: [], roles: [], employers: [] },
  laneRoles: ["Clinical operations leadership", "Nonprofit operations"],
  ...over,
});

function job(over: Record<string, string> = {}) {
  return buildImportedJob(
    importedJobInput.parse({
      title: "Director of Clinical Operations",
      employer: "Riverside Health",
      sourceUrl: "https://careers.riverside.org/jobs/1234",
      ...over,
    }),
    { importId: "imp-1", capturedAt: "2026-10-01T12:00:00.000Z" },
  );
}

describe("reading what the posting states", () => {
  it("finds a salary the posting actually states", () => {
    expect(statedSalary("Salary range $105,000 - $125,000 per year")).toBe(105_000);
    expect(statedSalary("Compensation: $98000 annually")).toBe(98_000);
  });

  it("returns nothing when no salary is stated, rather than guessing one", () => {
    expect(statedSalary("Competitive salary and excellent benefits")).toBeNull();
    expect(statedSalary("")).toBeNull();
    // A number that is not a salary must not be read as one.
    expect(statedSalary("Serving $500 meals a week")).toBeNull();
  });

  it("reads a stated work model and admits when none is stated", () => {
    expect(statedWorkModel("This is a fully remote position")).toBe("remote");
    expect(statedWorkModel("Hybrid schedule, three days on site")).toBe("hybrid");
    expect(statedWorkModel("This role is on-site at our main campus")).toBe("onsite");
    expect(statedWorkModel("Join our growing team")).toBeNull();
  });
});

describe("the assessment never invents what the posting does not say", () => {
  it("reports missing pay as unknown, not as a problem", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Lead the operations team." }), context(), AT);
    const pay = fit.findings.find((f) => f.label.includes("Pay"));
    expect(pay?.kind).toBe("unknown");
    expect(pay?.detail).toMatch(/nothing is assumed/i);
  });

  it("reports a missing work model as unknown", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Lead the operations team." }), context(), AT);
    expect(fit.findings.find((f) => f.label.includes("Work model"))?.kind).toBe("unknown");
  });

  it("says plainly when only a link was saved, so nothing could be compared", () => {
    const fit = assessImportedJobFit(job(), context(), AT);
    const finding = fit.findings.find((f) => f.label.includes("No posting text"));
    expect(finding?.kind).toBe("unknown");
    expect(finding?.detail).toMatch(/paste the posting text/i);
  });

  it("attributes every finding to a source the reader can check", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Remote. $120,000." }), context(), AT);
    for (const finding of fit.findings) {
      expect(["your preferences", "your career lanes", "the posting text", "the posting link"]).toContain(finding.source);
    }
  });
});

describe("AI-assisted fit uses broader CIP context with deterministic guardrails", () => {
  it("cites only supplied CIP evidence and keeps the assessment label explicit", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const evidence = JSON.parse(body.input[1].content).careerEvidence;
      expect(evidence).toContainEqual({ refId: "conversation-1", detail: "A prior market conversation said this team hires through a long internal process." });
      return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
        recommendation: "monitor", confidence: "medium", nextAction: "Compare the posting duties with the market-read evidence before investing time.", evidenceRefs: ["conversation-1"],
      }) }] }] }), { status: 200 });
    }) as typeof fetch);
    const fit = await assessImportedJobFitWithAi(job(), context({ careerEvidence: [
      { refId: "conversation-1", detail: "A prior market conversation said this team hires through a long internal process." },
    ] }), AT);
    expect(fit.basis).toBe("ai_assisted");
    expect(fit.findings.at(-1)).toMatchObject({
      label: "CIP context considered",
      detail: "A prior market conversation said this team hires through a long internal process.",
      source: "CIP analysis and saved evidence",
    });
  });

  it("keeps a concrete deterministic mismatch and recommendation when AI disagrees", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
      recommendation: "talk_first", confidence: "high", nextAction: "This is a perfect match; apply today.", evidenceRefs: [],
    }) }] }] }), { status: 200 })) as typeof fetch);
    const constrained = context({ salaryFloorUsd: 120_000, workModes: ["remote"], laneRoles: [] });
    const input = job({ originalMaterial: "On-site role paying $75,000 per year." });
    const expected = assessImportedJobFit(input, constrained, AT);
    const fit = await assessImportedJobFitWithAi(input, constrained, AT);
    expect(fit).toEqual(expected);
    expect(fit.findings.some((item) => item.kind === "mismatch")).toBe(true);
  });
});

describe("comparing against what the user asked for", () => {
  it("notices stated pay below the user's floor", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Remote role. Salary $72,000 per year." }), context(), AT);
    const pay = fit.findings.find((f) => f.label.includes("below your floor"));
    expect(pay?.kind).toBe("mismatch");
  });

  it("notices stated pay that clears the floor", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Remote role. Salary $120,000 per year." }), context(), AT);
    expect(fit.findings.find((f) => f.label.includes("clears your floor"))?.kind).toBe("match");
  });

  it("notices a work model the user did not ask for", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "This role is on-site five days a week. $120,000." }), context(), AT);
    expect(fit.findings.find((f) => f.label.includes("Work model differs"))?.kind).toBe("mismatch");
  });

  it("recognises a title that overlaps a lane the user is pursuing", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Remote. $120,000." }), context(), AT);
    expect(fit.findings.find((f) => f.label.includes("direction you are pursuing"))?.kind).toBe("match");
  });

  it("treats no lane overlap as unexplained rather than wrong", () => {
    const fit = assessImportedJobFit(job({ title: "Warehouse Supervisor", originalMaterial: "Remote. $120,000." }), context(), AT);
    const finding = fit.findings.find((f) => f.label.includes("No obvious overlap"));
    expect(finding?.kind).toBe("unknown");
    expect(finding?.detail).toMatch(/does not make it wrong/i);
  });
});

describe("the recommendation", () => {
  it("skips what the user explicitly excluded, and says they can change it", () => {
    const fit = assessImportedJobFit(
      job({ originalMaterial: "Remote. $120,000." }),
      context({ exclusions: { industries: [], roles: ["director"], employers: [] } }),
      AT,
    );
    expect(fit.recommendation).toBe("skip");
    expect(fit.confidence).toBe("high");
    expect(fit.nextAction).toMatch(/change the exclusion/i);
  });

  it("asks for research when too much is unknown, instead of guessing", () => {
    const fit = assessImportedJobFit(job(), context({ laneRoles: [] }), AT);
    expect(fit.recommendation).toBe("check_funding");
    expect(fit.confidence).toBe("low");
    expect(fit.nextAction).toMatch(/too much is unknown/i);
  });

  it("suggests a conversation when the job lines up", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Fully remote. Salary $130,000 per year." }), context(), AT);
    expect(fit.recommendation).toBe("talk_first");
    expect(fit.nextAction).toMatch(/conversation tells you more/i);
  });

  it("explains the next action in words rather than a score", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Fully remote. $130,000." }), context(), AT);
    expect(fit.nextAction.length).toBeGreaterThan(20);
    expect(JSON.stringify(fit)).not.toMatch(/"score"|matchPercent|fitScore/);
  });

  it("uses the app's existing recommendation vocabulary", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Fully remote. $130,000." }), context(), AT);
    expect(["talk_first", "check_funding", "apply", "monitor", "skip"]).toContain(fit.recommendation);
  });

  it("never recommends applying on its own", () => {
    // Nothing the deterministic path can see is enough to tell someone to
    // apply; that needs a judgement it cannot make from a pasted posting.
    for (const material of ["Fully remote. $300,000.", "Remote. $120,000. Perfect match.", ""]) {
      expect(assessImportedJobFit(job({ originalMaterial: material }), context(), AT).recommendation).not.toBe("apply");
    }
  });

  it("marks itself as the app's own reading, not a verified conclusion", () => {
    expect(assessImportedJobFit(job(), context(), AT).basis).toBe("deterministic");
  });
});

describe("storage and correction", () => {
  it("round-trips through storage", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Remote. $120,000." }), context(), AT);
    const read = parseImportedJobFit(JSON.stringify(importedJobFitPayload(fit)), "now");
    expect(read).toMatchObject({ importId: "imp-1", recommendation: fit.recommendation, basis: "deterministic" });
  });

  it("refuses a record with no job or an unknown recommendation", () => {
    expect(parseImportedJobFit(null, "now")).toBeNull();
    expect(parseImportedJobFit("not json", "now")).toBeNull();
    expect(parseImportedJobFit(JSON.stringify({ importedJobFit: { importId: "x", recommendation: "invent" } }), "now")).toBeNull();
  });

  it("lets the user's own correction stand as the newest assessment", () => {
    const appsOwn = assessImportedJobFit(job({ originalMaterial: "Remote. $120,000." }), context(), AT);
    const correction = { ...appsOwn, recommendation: "skip" as const, basis: "user" as const, assessedAt: "2026-10-23T12:00:00.000Z", userNote: "Commute is impossible." };
    const latest = latestFitFor("imp-1", [appsOwn, correction]);
    expect(latest?.basis).toBe("user");
    expect(latest?.recommendation).toBe("skip");
    expect(latest?.userNote).toBe("Commute is impossible.");
  });

  it("keeps assessments for other jobs out of it", () => {
    const mine = assessImportedJobFit(job(), context(), AT);
    const theirs = { ...mine, importId: "imp-2", assessedAt: "2026-10-24T12:00:00.000Z" };
    expect(latestFitFor("imp-1", [mine, theirs])?.importId).toBe("imp-1");
  });

  it("returns nothing when the job has never been assessed", () => {
    expect(latestFitFor("imp-9", [])).toBeNull();
  });
});

describe("wording", () => {
  it("describes each recommendation in plain words", () => {
    expect(readableRecommendation("apply")).toBe("Apply");
    expect(readableRecommendation("talk_first")).toBe("Talk to someone first");
    expect(readableRecommendation("check_funding")).toBe("Research before investing effort");
    expect(readableRecommendation("monitor")).toBe("Hold and watch");
    expect(readableRecommendation("skip")).toBe("Skip");
  });
});

describe("the summary never hides a conflict", () => {
  it("names every conflict when the job is a mixed picture", () => {
    // Previously this said "worth keeping an eye on" while two real conflicts
    // sat unmentioned underneath it.
    const fit = assessImportedJobFit(job({ originalMaterial: "On-site role. Salary $72,000 per year." }), context(), AT);
    expect(fit.nextAction).toMatch(/below your floor/i);
    expect(fit.nextAction).toMatch(/work model differs/i);
    expect(fit.nextAction).toMatch(/whether that trade is worth it/i);
  });

  it("does not claim the job fits a direction when the lane overlap is unknown", () => {
    const fit = assessImportedJobFit(
      job({ title: "Warehouse Supervisor", originalMaterial: "Fully remote. Salary $130,000 per year." }),
      context(),
      AT,
    );
    expect(fit.nextAction).toMatch(/not a direction you are currently pursuing/i);
    expect(fit.nextAction).not.toMatch(/lines up with the direction/i);
    expect(fit.confidence).toBe("low");
  });

  it("still speaks plainly when everything lines up", () => {
    const fit = assessImportedJobFit(job({ originalMaterial: "Fully remote. Salary $130,000 per year." }), context(), AT);
    expect(fit.nextAction).toMatch(/lines up with the direction you are pursuing/i);
  });
});
