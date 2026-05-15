import type { IntakeForm } from "@/lib/cip/intake";

export interface AdvisorAnalysis {
  mode: "ai" | "deterministic";
  summary: string;
  positioning: string[];
  followUpQuestions: string[];
  skillGaps: string[];
  evidenceLedger: EvidenceLedgerItem[];
  explorationAreas: ExplorationArea[];
  claimSafetyNotes: string[];
  roleBriefs: RoleBrief[];
}

export interface EvidenceLedgerItem {
  claim: string;
  status: "verified_from_resume" | "stated_by_user" | "inferred_medium_confidence" | "needs_user_confirmation" | "not_enough_evidence";
  evidence: string;
  whyItMatters: string;
  nextValidationStep: string;
}

export interface ExplorationArea {
  area: string;
  whyExplore: string;
  evidenceToFind: string[];
  firstExperiment: string;
}

export interface RoleBrief {
  role: string;
  whyItFits: string;
  evidenceNeeded: string;
  searchTargets: SearchTarget[];
}

export interface SearchTarget {
  label: string;
  href: string;
}

export interface AdvisorEvidenceResponse {
  question: string;
  answer: string;
  confidence: string;
  proofUrl?: string;
  sourceNote?: string;
}

export async function buildAdvisorAnalysis(
  intake: IntakeForm,
  draft: {
    strengths: string[];
    possibleRoles: string[];
    evidenceChecklist: string[];
    nextQuestions: string[];
  },
  evidenceResponses: AdvisorEvidenceResponse[] = [],
): Promise<AdvisorAnalysis> {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const ai = await tryBuildAiAnalysis(intake, draft, evidenceResponses, openAiKey);
    if (ai) return ai;
  }

  return buildDeterministicAnalysis(intake, draft, evidenceResponses);
}

async function tryBuildAiAnalysis(
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
  evidenceResponses: AdvisorEvidenceResponse[],
  openAiKey: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: import.meta.env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a careful career intelligence analyst and strategic thought partner. Your job is not to flatter the user. Dig for underused strengths, hidden career adjacencies, and proof gaps. Do not invent credentials, employers, metrics, or live job listings. Treat resume text and intake answers as evidence, but clearly separate verified facts, user-stated preferences, inferences, and open questions. Produce concise, evidence-aware JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: evidenceResponses.length
              ? "Re-analyze this career intake using the saved evidence responses. Promote stronger claims only when the evidence supports them. Keep weak or vague answers as follow-up questions."
              : "Analyze this career intake and produce strategic follow-up questions, positioning, skill gaps, and role briefs.",
            output_schema: {
              summary: "One concise paragraph.",
              positioning: ["3-5 source-grounded positioning points."],
              followUpQuestions: ["4-6 questions that would improve analysis quality."],
              skillGaps: ["3-5 likely gaps or proof gaps to verify."],
              evidenceLedger: [
                {
                  claim: "Specific career claim or hypothesis.",
                  status: "verified_from_resume | stated_by_user | inferred_medium_confidence | needs_user_confirmation | not_enough_evidence",
                  evidence: "Brief source text or intake field behind the claim.",
                  whyItMatters: "Why this matters for positioning or search.",
                  nextValidationStep: "What the user should confirm, quantify, or source next.",
                },
              ],
              explorationAreas: [
                {
                  area: "Underexplored career direction or value proposition.",
                  whyExplore: "Why this may unlock a stronger path.",
                  evidenceToFind: ["Proof needed before trusting this direction."],
                  firstExperiment: "Small research or portfolio action.",
                },
              ],
              claimSafetyNotes: ["Claims that should not be used publicly until verified."],
              roleBriefs: [
                {
                  role: "Role hypothesis from the provided list.",
                  whyItFits: "Evidence-aware rationale.",
                  evidenceNeeded: "What proof is needed before recommending this path strongly.",
                },
              ],
            },
            intake,
            draft,
            evidenceResponses,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "career_advisor_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "summary",
              "positioning",
              "followUpQuestions",
              "skillGaps",
              "evidenceLedger",
              "explorationAreas",
              "claimSafetyNotes",
              "roleBriefs",
            ],
            properties: {
              summary: { type: "string" },
              positioning: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
              followUpQuestions: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 6 },
              skillGaps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
              evidenceLedger: {
                type: "array",
                minItems: 5,
                maxItems: 10,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["claim", "status", "evidence", "whyItMatters", "nextValidationStep"],
                  properties: {
                    claim: { type: "string" },
                    status: {
                      type: "string",
                      enum: [
                        "verified_from_resume",
                        "stated_by_user",
                        "inferred_medium_confidence",
                        "needs_user_confirmation",
                        "not_enough_evidence",
                      ],
                    },
                    evidence: { type: "string" },
                    whyItMatters: { type: "string" },
                    nextValidationStep: { type: "string" },
                  },
                },
              },
              explorationAreas: {
                type: "array",
                minItems: 3,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["area", "whyExplore", "evidenceToFind", "firstExperiment"],
                  properties: {
                    area: { type: "string" },
                    whyExplore: { type: "string" },
                    evidenceToFind: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
                    firstExperiment: { type: "string" },
                  },
                },
              },
              claimSafetyNotes: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
              roleBriefs: {
                type: "array",
                minItems: 1,
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["role", "whyItFits", "evidenceNeeded"],
                  properties: {
                    role: { type: "string" },
                    whyItFits: { type: "string" },
                    evidenceNeeded: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Omit<RoleBrief, "searchTargets"> & {
      summary: string;
      positioning: string[];
      followUpQuestions: string[];
      skillGaps: string[];
      evidenceLedger?: EvidenceLedgerItem[];
      explorationAreas?: ExplorationArea[];
      claimSafetyNotes?: string[];
      roleBriefs: Array<Omit<RoleBrief, "searchTargets">>;
    };
    return {
      mode: "ai" as const,
      summary: parsed.summary,
      positioning: parsed.positioning,
      followUpQuestions: parsed.followUpQuestions,
      skillGaps: parsed.skillGaps,
      evidenceLedger: normalizeEvidenceLedger(parsed.evidenceLedger, intake, draft),
      explorationAreas: normalizeExplorationAreas(parsed.explorationAreas, intake, draft),
      claimSafetyNotes: normalizeClaimSafetyNotes(parsed.claimSafetyNotes),
      roleBriefs: parsed.roleBriefs.map((brief) => ({
        ...brief,
        searchTargets: buildSearchTargets(brief.role, intake),
      })),
    };
  } catch {
    return null;
  }
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return null;
}

function buildDeterministicAnalysis(
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
  evidenceResponses: AdvisorEvidenceResponse[] = [],
): AdvisorAnalysis {
  const strongest = draft.strengths.slice(0, 4);
  const roleBriefs = draft.possibleRoles.slice(0, 5).map((role) => ({
    role,
    whyItFits: buildRoleRationale(role, strongest),
    evidenceNeeded: buildEvidenceNeed(role),
    searchTargets: buildSearchTargets(role, intake),
  }));

  return {
    mode: "deterministic",
    summary:
      evidenceResponses.length
        ? `This re-analysis includes ${evidenceResponses.length} saved evidence answer${evidenceResponses.length === 1 ? "" : "s"}. The strongest next move is to separate answers that are ready for public positioning from answers that still need metrics, sources, or narrower follow-up.`
        : "This draft points toward roles where leadership, operations, communication, and applied AI work can be framed as business value. The next analysis pass should verify proof, compensation fit, and which role families are strongest in the live market.",
    positioning: [
      `Lead with ${strongest.slice(0, 2).join(" and ") || "transferable operating strengths"} as the through-line.`,
      "Treat role hypotheses as research lanes until real postings and salary ranges are compared.",
      "Keep every public-facing claim tied to resume evidence, public links, or user-confirmed examples.",
    ],
    followUpQuestions: draft.nextQuestions,
    skillGaps: [
      "Hard metrics from past work that can be used safely.",
      "Concrete AI, automation, or technical workflow examples.",
      "Preferred industries and deal-breaker industries.",
      "Compensation floor, target, and tradeoffs by remote or hybrid work.",
    ],
    evidenceLedger: buildDeterministicEvidenceLedger(intake, draft, evidenceResponses),
    explorationAreas: buildDeterministicExplorationAreas(intake, draft),
    claimSafetyNotes: [
      "Do not use salary, leadership scope, or AI/technical maturity claims publicly until the user confirms specific examples.",
      "Do not turn interests into experience. Label AI, product, or labor-market directions as exploration lanes unless backed by projects or work history.",
      "Resume and LinkedIn rewrites should preserve the user's actual accomplishments and avoid invented metrics.",
    ],
    roleBriefs,
  };
}

function normalizeEvidenceLedger(
  items: EvidenceLedgerItem[] | undefined,
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
) {
  return items?.length ? items : buildDeterministicEvidenceLedger(intake, draft);
}

function normalizeExplorationAreas(
  items: ExplorationArea[] | undefined,
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
) {
  return items?.length ? items : buildDeterministicExplorationAreas(intake, draft);
}

function normalizeClaimSafetyNotes(items: string[] | undefined) {
  return items?.length
    ? items
    : [
        "Keep public claims tied to verified resume text, user-confirmed facts, or public links.",
        "Use inferred strengths for research and questioning first, not final resume copy.",
      ];
}

function buildDeterministicEvidenceLedger(
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
  evidenceResponses: AdvisorEvidenceResponse[] = [],
): EvidenceLedgerItem[] {
  const items: EvidenceLedgerItem[] = [
    {
      claim: "Resume/work history is the primary verified source.",
      status: "verified_from_resume",
      evidence: excerpt(intake.resume_text),
      whyItMatters: "Career recommendations should start from what can be defended in source material.",
      nextValidationStep: "Highlight role titles, dates, scope, tools, and measurable results in the resume text.",
    },
  ];

  if (intake.target_title) {
    items.push({
      claim: `The user is considering ${intake.target_title}.`,
      status: "stated_by_user",
      evidence: intake.target_title,
      whyItMatters: "This gives the search a directional hypothesis, not a proven fit.",
      nextValidationStep: "Compare this direction against live roles, compensation, and required evidence.",
    });
  }

  for (const strength of draft.strengths.slice(0, 3)) {
    items.push({
      claim: `${titleCase(strength)} may be a reusable career strength.`,
      status: "inferred_medium_confidence",
      evidence: findEvidenceSnippet(strength, intake),
      whyItMatters: "Repeated strengths can become the through-line for positioning and employer targeting.",
      nextValidationStep: `Find one specific story, metric, artifact, or public example proving ${strength}.`,
    });
  }

  if (intake.hidden_achievements) {
    items.push({
      claim: "There may be high-value achievements not visible in the resume.",
      status: "stated_by_user",
      evidence: excerpt(intake.hidden_achievements),
      whyItMatters: "Hidden achievements often contain the strongest differentiation if they can be verified.",
      nextValidationStep: "Turn each achievement into scope, action, result, and proof.",
    });
  } else {
    items.push({
      claim: "Hidden achievements are not documented yet.",
      status: "not_enough_evidence",
      evidence: "The hidden achievements field is empty.",
      whyItMatters: "The system may miss unusual strengths if it only sees standard resume language.",
      nextValidationStep: "Add 3-5 hard problems, turnarounds, quiet wins, or projects that never fit cleanly on a resume.",
    });
  }

  if (intake.public_evidence || intake.linkedin_url || intake.portfolio_urls) {
    items.push({
      claim: "Public evidence is available for inspection.",
      status: "stated_by_user",
      evidence: excerpt([intake.linkedin_url, intake.portfolio_urls, intake.public_evidence].filter(Boolean).join("\n")),
      whyItMatters: "Public proof can make positioning more credible and reduce reliance on self-report.",
      nextValidationStep: "Review links and tag each as portfolio, GitHub, LinkedIn, writing, business, or community proof.",
    });
  } else {
    items.push({
      claim: "Public proof is missing.",
      status: "needs_user_confirmation",
      evidence: "No LinkedIn, portfolio, GitHub, writing, or public project links were supplied.",
      whyItMatters: "Higher-trust recommendations need evidence beyond pasted resume text.",
      nextValidationStep: "Add public links or explicitly confirm that no public evidence exists yet.",
    });
  }

  for (const response of evidenceResponses.slice(0, 3)) {
    items.push({
      claim: response.question,
      status: response.confidence === "known" ? "stated_by_user" : "needs_user_confirmation",
      evidence: excerpt(response.answer),
      whyItMatters: "This saved answer can strengthen the profile if it has enough scope, result, and proof to be used safely.",
      nextValidationStep: response.proofUrl || response.confidence === "known"
        ? "Review this answer for resume, LinkedIn, interview, or portfolio use."
        : "Add a metric, proof link, source note, or narrower follow-up before using publicly.",
    });
  }

  return items.slice(0, 10);
}

function buildDeterministicExplorationAreas(
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
): ExplorationArea[] {
  const primaryRole = draft.possibleRoles[0] ?? "career strategy";
  return [
    {
      area: primaryRole,
      whyExplore: "This is the strongest current role hypothesis, but it should be tested against real job descriptions before being treated as the target.",
      evidenceToFind: [
        "Three postings that match the user's actual experience",
        "Required skills that appear repeatedly",
        "Compensation and work-model fit",
      ],
      firstExperiment: `Collect 10 ${primaryRole} postings and mark which requirements are proven, plausible, or missing.`,
    },
    {
      area: "Underused operating strengths",
      whyExplore: "Mid-career candidates often undersell operational judgment, cross-functional coordination, and problem framing.",
      evidenceToFind: [
        "Examples of decisions that changed outcomes",
        "Stakeholder groups managed",
        "Processes improved or systems built",
      ],
      firstExperiment: "Write three short case notes using problem, action, result, and proof.",
    },
    {
      area: "AI-enabled workflow proof",
      whyExplore: "If the user wants AI-enabled work, the market will need visible proof of practical workflow design, not just interest.",
      evidenceToFind: [
        "Tools used",
        "Before/after workflow examples",
        "Artifacts, demos, automations, or repositories",
      ],
      firstExperiment: "Create one portfolio artifact that shows an AI-assisted workflow solving a real operational problem.",
    },
  ].filter((area) => intake.resume_text || area.area !== "Underused operating strengths");
}

function excerpt(value: string, max = 220) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned || "No source text supplied.";
}

function findEvidenceSnippet(term: string, intake: IntakeForm) {
  const sources = [
    intake.resume_text,
    intake.hidden_achievements,
    intake.energizing_problems,
    intake.industry_preferences,
    intake.public_evidence,
  ];
  const normalizedTerm = term.toLowerCase();
  const match = sources.find((source) => source.toLowerCase().includes(normalizedTerm));
  return match ? excerpt(match) : "Term appeared in aggregate intake signals; source needs review.";
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function buildRoleRationale(role: string, strengths: string[]) {
  const signal = strengths.length ? strengths.join(", ") : "the intake signals";
  return `${role} is worth researching because it can translate ${signal} into a role-specific value proposition.`;
}

function buildEvidenceNeed(role: string) {
  if (role.toLowerCase().includes("ai")) {
    return "Add examples of AI workflows, automation decisions, tools used, and measurable before/after results.";
  }
  if (role.toLowerCase().includes("product")) {
    return "Add product-facing examples: adoption, enablement, training, customer insight, or cross-functional delivery.";
  }
  if (role.toLowerCase().includes("program")) {
    return "Add examples of program ownership, stakeholder coordination, reporting cadence, and measurable outcomes.";
  }
  if (role.toLowerCase().includes("research")) {
    return "Add examples of research methods, synthesis, market analysis, and decisions influenced by the work.";
  }
  return "Add verified accomplishments, scope, tools, stakeholders, and measurable results for this direction.";
}

function buildSearchTargets(role: string, intake: IntakeForm): SearchTarget[] {
  const remote = intake.work_modes.includes("remote") ? " remote" : "";
  const query = `${role}${remote}`;
  return [
    { label: "LinkedIn", href: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}` },
    { label: "Indeed", href: `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}` },
    { label: "Wellfound", href: `https://wellfound.com/jobs?keyword=${encodeURIComponent(query)}` },
  ];
}
