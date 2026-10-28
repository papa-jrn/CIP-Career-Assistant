import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "@/lib/cip/conversation-outcomes";
import { scoreLanes } from "@/lib/cip/strategic-state";

/**
 * Guards for the three defects the Morgan Ellis acceptance fixture exposed on 2026-10-28.
 * See test-data/phase5-mountain-view/08-AFTER-target-lanes-OBSERVED.md.
 */

const brief = (role: string, whyItFits: string, evidenceNeeded: string) => ({
  role,
  whyItFits,
  evidenceNeeded,
  searchTargets: [],
});

const changeLog = (over: Partial<{ strengthened: string[]; weakened: string[] }> = {}) => ({
  hasChanges: true,
  summary: "",
  strengthened: over.strengthened ?? [],
  weakened: over.weakened ?? [],
  newlyAnswered: [],
});

const laneBy = (lanes: ReturnType<typeof scoreLanes>, pattern: RegExp) =>
  lanes.find((lane) => pattern.test(lane.lane));

describe("the research cap depends on evidence, not on how the model worded the lane", () => {
  // The same two lanes, same evidence, described once tentatively and once confidently.
  // Before the fix the hedged wording was capped and the confident wording was not, so a user who
  // answered the advisor's questions honestly - which made the model write more confidently about a
  // narrower role - silently removed the cap holding an unsupported lane down.
  const hedged = {
    roleBriefs: [
      brief("Senior Technical Program Manager", "Supported by current delivery evidence.", "Refresh metrics."),
      brief("Product Operations Lead", "Preliminary experience suggests potential to move into product operations.", "Needs validation."),
    ],
  };
  const confident = {
    roleBriefs: [
      brief("Senior Technical Program Manager", "Supported by current delivery evidence.", "Refresh metrics."),
      brief("Product Enablement Lead", "Experience synthesizing customer feedback fits a supportive product role.", "Demonstrated impact of feedback work on product decisions."),
    ],
  };

  it("caps a non-primary lane the same way whichever wording it got", () => {
    const hedgedSecondary = scoreLanes({ latestAdvisor: hedged })[1];
    const confidentSecondary = scoreLanes({ latestAdvisor: confident })[1];

    expect(hedgedSecondary.score).toBe(confidentSecondary.score);
    expect(hedgedSecondary.reasons.join(" ")).toMatch(/Capped as research/);
    expect(confidentSecondary.reasons.join(" ")).toMatch(/Capped as research/);
  });

  it("does not let confident prose alone promote a lane", () => {
    // Removing hedging words from the rationale must not raise the ceiling.
    const secondary = scoreLanes({ latestAdvisor: confident })[1];
    expect(secondary.score).toBeLessThanOrEqual(58);
  });

  it("never caps the top-ranked lane by this rule, even when its prose hedges", () => {
    const primaryHedges = {
      roleBriefs: [
        brief("Senior Technical Program Manager", "A potential direction worth exploring.", "Needs validation."),
        brief("Product Enablement Lead", "Experience fits a supportive product role.", "Needs impact evidence."),
      ],
    };
    const primary = scoreLanes({ latestAdvisor: primaryHedges })[0];
    expect(primary.reasons.join(" ")).not.toMatch(/Capped as research/);
    expect(primary.score).toBeGreaterThan(58);
  });

  it("still lifts the cap for a real external signal", () => {
    const lanes = scoreLanes({
      latestAdvisor: confident,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "A Real Person",
          relatedLane: "Product Enablement Lead",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
        }),
      ],
    });
    const secondary = laneBy(lanes, /Product Enablement/);
    expect(secondary?.reasons.join(" ")).not.toMatch(/Capped as research/);
  });
});

describe("one re-analysis phrase adjusts one lane", () => {
  // The observed bug: the tertiary lane's strategic read cited the primary's and the secondary's
  // phrases, because a single shared distinctive token ("liaison") was enough to match.
  const advisor = {
    roleBriefs: [
      brief("Senior Technical Manager", "Strong delivery leadership, cross-team coordination and liaison strengths.", "Team-size examples."),
      brief("Product Enablement Lead", "Supporting product managers without roadmap ownership authority.", "Impact evidence."),
      brief("Platform Program Manager (Technical Liaison)", "Coordination with security engineers and extensive liaison work.", "Scope of liaison activities."),
    ],
  };

  it("scores only the lane a phrase fits best, not every lane sharing a word", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        ...advisor,
        changeLog: changeLog({
          strengthened: ["Senior Technical Manager role alignment with delivery and liaison strengths"],
        }),
      },
    });

    const primary = laneBy(lanes, /Senior Technical Manager/);
    const tertiary = laneBy(lanes, /Platform Program Manager/);
    expect(primary?.reasons.join(" ")).toMatch(/strengthened this direction/);
    expect(tertiary?.reasons.join(" ")).not.toMatch(/strengthened this direction/);
  });

  it("keeps a product phrase on the product lane", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        ...advisor,
        changeLog: changeLog({ strengthened: ["Focus on supportive product roles without roadmap authority"] }),
      },
    });
    expect(laneBy(lanes, /Product Enablement/)?.reasons.join(" ")).toMatch(/strengthened this direction/);
    expect(laneBy(lanes, /Platform Program Manager/)?.reasons.join(" ")).not.toMatch(/strengthened this direction/);
  });

  it("adjusts no lane at all when a phrase matches none of them", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        ...advisor,
        changeLog: changeLog({ strengthened: ["Veterinary radiology accreditation improved"] }),
      },
    });
    expect(lanes.every((lane) => !/strengthened this direction/.test(lane.reasons.join(" ")))).toBe(true);
  });

  it("counts a weakened phrase against one lane only", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        ...advisor,
        changeLog: changeLog({
          weakened: ["Product Enablement Lead as a strategic leadership role, lacking roadmap or pricing ownership"],
        }),
      },
    });
    const weakened = lanes.filter((lane) => /weakened this direction/.test(lane.reasons.join(" ")));
    expect(weakened).toHaveLength(1);
    expect(weakened[0]?.lane).toMatch(/Product Enablement/);
  });
});

describe("the strategic read reads as English", () => {
  const advisor = {
    roleBriefs: [brief("Senior Technical Program Manager", "Supported by delivery evidence.", "Refresh metrics.")],
  };

  it("no longer splices a sentence into a noun phrase", () => {
    // Was: "promising score based on Evidence re-analysis strengthened this direction: ...".
    const lane = scoreLanes({
      latestAdvisor: {
        ...advisor,
        changeLog: changeLog({ strengthened: ["Senior Technical Program Manager delivery evidence improved"] }),
      },
    })[0];

    expect(lane.explanation).not.toMatch(/score based on/);
    expect(lane.explanation).toMatch(/^(high-confidence|promising|watch|low-priority) score\./);
  });

  it("ends in exactly one full stop, so a caller appending one cannot produce '..'", () => {
    for (const changes of [
      changeLog(),
      changeLog({ strengthened: ["Senior Technical Program Manager delivery evidence improved"] }),
      changeLog({
        strengthened: [
          "Senior Technical Program Manager delivery evidence improved",
          "Senior Technical Program Manager coordination clarified",
        ],
      }),
    ]) {
      const lane = scoreLanes({ latestAdvisor: { ...advisor, changeLog: changes } })[0];
      expect(lane.explanation).not.toMatch(/\.\s*\.$/);
      expect(lane.explanation.endsWith(".")).toBe(true);
      expect(lane.explanation).not.toMatch(/\.\./);
    }
  });

  it("still says something when there is nothing but a baseline", () => {
    const lane = scoreLanes({ latestAdvisor: advisor })[0];
    expect(lane.explanation.length).toBeGreaterThan(0);
    expect(lane.explanation).toMatch(/score\./);
  });
});

describe("the cap explains the reason that actually applied", () => {
  it("does not claim a light new-target signal when there is no signal at all", () => {
    // One hardcoded sentence used to serve both cap branches, telling a user with no
    // conversations that their support was "only a light new-target signal".
    const lanes = scoreLanes({
      latestAdvisor: {
        roleBriefs: [
          brief("Senior Technical Program Manager", "Supported by delivery evidence.", "Refresh metrics."),
          brief("Product Enablement Lead", "Experience fits a supportive product role.", "Impact evidence."),
        ],
      },
    });
    const capped = lanes[1].reasons.find((reason) => /Capped as research/.test(reason)) ?? "";
    expect(capped).toMatch(/nothing outside your own records/);
    expect(capped).not.toMatch(/light new-target signal/);
  });

  it("still uses the new-target wording when that is the reason", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        roleBriefs: [
          brief("Senior Technical Program Manager", "Supported by delivery evidence.", "Refresh metrics."),
          brief("Product Enablement Lead", "Experience fits a supportive product role.", "Impact evidence."),
        ],
      },
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "A Light Mention",
          relatedLane: "Product Enablement Lead",
          signalDirection: "strengthens",
          signalType: "new_target",
          confidence: "medium",
        }),
      ],
    });
    const capped = laneBy(lanes, /Product Enablement/)?.reasons.find((r) => /Capped as research/.test(r)) ?? "";
    expect(capped).toMatch(/light new-target signal/);
  });
});

describe("re-reading your own records cannot buy the top band", () => {
  // The Morgan fixture reached 90 / "high-confidence" from six answers that were all documented
  // absences, with no verified posting and no conversation behind it. Analysis strength is not
  // external validation.
  const advisor = {
    roleBriefs: [
      brief("Senior Technical Manager", "Strong delivery leadership and cross-team coordination.", "Team-size examples."),
    ],
  };
  const twoStrengthened = changeLog({
    strengthened: [
      "Senior Technical Manager delivery leadership confirmed",
      "Senior Technical Manager cross-team coordination clarified",
    ],
  });

  it("holds a lane just below high confidence when only re-analysis lifted it", () => {
    const lane = scoreLanes({ latestAdvisor: { ...advisor, changeLog: twoStrengthened } })[0];
    expect(lane.score).toBeLessThan(80);
    expect(lane.explanation).not.toMatch(/high-confidence/);
    expect(lane.reasons.join(" ")).toMatch(/Held just below high confidence/);
  });

  it("allows high confidence when a verified-open posting backs the lane", () => {
    const lane = scoreLanes({
      latestAdvisor: { ...advisor, changeLog: twoStrengthened },
      verifiedPostings: [
        { title: "Senior Technical Manager", employer: "An Employer", matchedRoleTerm: "senior technical manager", tier: "target_page" },
      ],
    })[0];
    expect(lane.score).toBeGreaterThanOrEqual(80);
    expect(lane.reasons.join(" ")).not.toMatch(/Held just below high confidence/);
  });

  it("allows high confidence when a substantive conversation backs the lane", () => {
    const lane = scoreLanes({
      latestAdvisor: { ...advisor, changeLog: twoStrengthened },
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "A Real Person",
          relatedLane: "Senior Technical Manager",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
        }),
      ],
    })[0];
    expect(lane.reasons.join(" ")).not.toMatch(/Held just below high confidence/);
  });

  it("leaves a lane alone when nothing from re-analysis lifted it", () => {
    const lane = scoreLanes({ latestAdvisor: advisor })[0];
    expect(lane.reasons.join(" ")).not.toMatch(/Held just below high confidence/);
  });
});

describe("one conversation adjusts one lane", () => {
  // Observed on the founder's own account: a single new_target signal added +5 to BOTH the
  // Executive Director lane and the Director of Media Innovation lane, which share "director",
  // "media" and "nonprofit".
  const advisor = {
    roleBriefs: [
      brief("Executive Director / Nonprofit Media Leader", "Leads a community media organization.", "Audience growth."),
      brief("Director of Media Innovation / CTO for Nonprofit Organizations", "Technical product leadership for mission-driven media.", "Project impact."),
    ],
  };

  it("scores the lane the conversation was about, not every lane sharing words", () => {
    const lanes = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Christopher Diak",
          relatedLane: "Executive Director / Nonprofit Media Leader",
          signalDirection: "strengthens",
          signalType: "new_target",
          confidence: "medium",
        }),
      ],
    });
    const scored = lanes.filter((lane) => /Christopher Diak/.test(lane.reasons.join(" ")));
    expect(scored).toHaveLength(1);
    expect(scored[0]?.lane).toMatch(/Executive Director/);
  });

  it("still moves a real advisor lane that a conversation-only placeholder would have stolen", () => {
    // conversationOnlyLanes names a placeholder after the outcome's own relatedLane, so it matches
    // exactly and used to outrank the advisor lane that should own the signal.
    const lanes = scoreLanes({
      latestAdvisor: {
        roleBriefs: [brief("Nonprofit operations and workflow modernization", "Matches operations leadership.", "Confirm scope.")],
      },
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Security Friend",
          relatedLane: "nonprofit operations",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
        }),
      ],
    });
    const real = laneBy(lanes, /workflow modernization/);
    expect(real?.reasons.join(" ")).toMatch(/Security Friend/);
    expect(real?.direction).toBe("up");
  });

  it("keeps an unrelated conversation off both advisor lanes", () => {
    // It does not vanish: conversationOnlyLanes deliberately opens a placeholder lane for a
    // direction the advisor has not named. It must not touch the two real lanes.
    const lanes = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Unrelated Person",
          relatedLane: "veterinary radiology",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
        }),
      ],
    });
    const scored = lanes.filter((lane) => /Unrelated Person/.test(lane.reasons.join(" ")));
    expect(scored).toHaveLength(1);
    expect(scored[0]?.lane).toMatch(/veterinary radiology/i);
    expect(laneBy(lanes, /Executive Director/)?.reasons.join(" ")).not.toMatch(/Unrelated Person/);
    expect(laneBy(lanes, /Media Innovation/)?.reasons.join(" ")).not.toMatch(/Unrelated Person/);
  });
});

describe("the changeLog contract is stated to the model", () => {
  // A source assertion, not a behavioural one: the prompt is built inside a function that calls the
  // API, and the suite never calls the real API. This guards the clause against silent deletion. It
  // cannot verify the model obeys it - the high-confidence guard above is the actual enforcement,
  // which is why that guard exists rather than trusting the prompt alone.
  it("tells the model that an absence is never a strengthening", async () => {
    const source = await readFile(new URL("./advisor.ts", import.meta.url), "utf8");
    expect(source).toMatch(/never belongs in strengthened/);
    expect(source).toMatch(/Confirming what somebody cannot do is not evidence/);
    expect(source).toMatch(/those go in weakened or newlyAnswered/);
  });
});
