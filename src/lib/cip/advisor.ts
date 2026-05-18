import type { IntakeForm } from "@/lib/cip/intake";
import { calculateEvidenceSufficiency, type EvidenceSufficiencyScore } from "@/lib/cip/evidence-sufficiency";

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

export interface AdvisorAnalysisContext {
  evidenceRound?: number;
  sourceEvidenceCount?: number;
  sufficiency?: EvidenceSufficiencyScore;
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
  context: AdvisorAnalysisContext = {},
): Promise<AdvisorAnalysis> {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const ai = await tryBuildAiAnalysis(intake, draft, evidenceResponses, context, openAiKey);
    if (ai) return ai;
  }

  return buildDeterministicAnalysis(intake, draft, evidenceResponses, context);
}

async function tryBuildAiAnalysis(
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
  evidenceResponses: AdvisorEvidenceResponse[],
  context: AdvisorAnalysisContext,
  openAiKey: string,
) {
  const sufficiency = context.sufficiency ?? calculateEvidenceSufficiency(intake, evidenceResponses, context);
  const shouldPivotToOpportunityMapping = shouldMoveToOpportunityMapping(sufficiency);
  const shouldAskEnhancementQuestions = sufficiency.phase === "enhancement";
  const isComplete = sufficiency.phase === "complete";
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
            "You are a careful career intelligence analyst and strategic thought partner. Your job is not to flatter the user. Dig for underused strengths, hidden career adjacencies, and proof gaps. Do not invent credentials, employers, metrics, or live job listings. Treat resume text, intake answers, saved evidence, and linked-source analysis as evidence. Cross-check them before asking follow-up questions. If a resume plus source analysis already establishes a role or contribution, do not ask the user to clarify that same involvement; ask only for missing metrics, outcomes, scope, or permission to use it publicly. Respect explicit exclusions and preferences already stated by the user. Produce concise, evidence-aware JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: shouldPivotToOpportunityMapping
              ? isComplete
                ? "The evidence phase is complete. Do not ask for more proof. Produce a final evidence-phase analysis and make follow-up questions about opportunity mapping only: target roles, target industries, geography/remote preferences, employer categories, network data the user can provide, and next search strategy."
                : "The evidence score is saturated. Produce one final enhancement-oriented re-analysis. Follow-up questions must ask whether the user can strengthen already-promising positioning angles; do not ask generic proof questions, tiny metrics, or repeated involvement questions."
              : evidenceResponses.length
              ? "Re-analyze this career intake using saved evidence responses and linked-source analysis. Retire stale proof gaps and follow-up questions that are already answered by the resume, evidence, or source analysis. Promote stronger claims when the evidence supports them. Keep only genuinely unresolved gaps as follow-up questions."
              : "Analyze this career intake and produce strategic follow-up questions, positioning, skill gaps, and role briefs.",
            output_schema: {
              summary: "One concise paragraph.",
              positioning: ["3-5 source-grounded positioning points."],
              followUpQuestions: shouldPivotToOpportunityMapping
                ? shouldAskEnhancementQuestions
                  ? ["3-5 final enhancement questions that ask whether anything would sharpen the strongest positioning angles before final analysis."]
                  : ["4-6 opportunity-mapping questions about target roles, industries, geography/remote, target employer types, and network data. Do not ask for more proof."]
                : ["4-6 questions that would improve analysis quality and are not already answered by supplied evidence."],
              skillGaps: shouldPivotToOpportunityMapping
                ? ["3-5 remaining go-to-market gaps such as target industries, geography, employer list, networking map, or LinkedIn data access."]
                : ["3-5 genuinely remaining gaps; do not list exclusions, roles, tools, or projects already stated in evidence."],
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
            analysisContext: context,
            evidenceSufficiency: sufficiency,
            stale_question_guardrails: [
              "Do not ask the user to clarify involvement with an organization if the resume names a leadership role there and source evidence supports related work.",
              "Do not ask for industries to exclude if exclusions already appear in intake or saved evidence.",
              "Do not ask what AI tools/projects the user can discuss if GitHub/source analysis already lists AI coding projects. Instead ask which project has the strongest outcome, user impact, or technical depth.",
              "For video/story production links, use metadata as evidence of a public artifact, but ask for transcript, role, audience, reach, or production responsibility if those are missing.",
              "After 3 evidence rounds or many saved evidence answers, do not keep asking increasingly narrow proof questions such as exact budgets or team sizes unless they are crucial to a target role.",
              "Late-stage questions should help the user move toward connections: target industries, target geography, remote/hybrid filters, likely employers, LinkedIn connections, alumni networks, and warm introductions.",
              "When evidence sufficiency is saturated, follow-up questions must shift from 'prove this' to 'can anything strengthen this already useful positioning angle?'",
              "When evidence sufficiency is complete, do not produce evidence-gathering questions. Produce opportunity-mapping next steps instead.",
            ],
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
  context: AdvisorAnalysisContext = {},
): AdvisorAnalysis {
  const strongest = draft.strengths.slice(0, 4);
  const evidenceText = evidenceResponses.map((response) => `${response.question}\n${response.answer}\n${response.sourceNote}`).join("\n").toLowerCase();
  const sufficiency = context.sufficiency ?? calculateEvidenceSufficiency(intake, evidenceResponses, context);
  const shouldPivot = shouldMoveToOpportunityMapping(sufficiency);
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
        ? shouldPivot
          ? sufficiency.phase === "enhancement"
            ? `This profile has an evidence sufficiency score of ${sufficiency.score}. The evidence base is strong enough for one final enhancement pass focused on sharpening the best positioning angles before opportunity mapping.`
            : `This profile has an evidence sufficiency score of ${sufficiency.score}. Standard proof gathering is now diminishing returns; the next useful work is opportunity and connection mapping.`
          : `This re-analysis includes ${evidenceResponses.length} saved evidence answer${evidenceResponses.length === 1 ? "" : "s"}. The strongest next move is to separate answers that are ready for public positioning from answers that still need metrics, sources, or narrower follow-up.`
        : "This draft points toward roles where leadership, operations, communication, and applied AI work can be framed as business value. The next analysis pass should verify proof, compensation fit, and which role families are strongest in the live market.",
    positioning: [
      `Lead with ${strongest.slice(0, 2).join(" and ") || "transferable operating strengths"} as the through-line.`,
      "Treat role hypotheses as research lanes until real postings and salary ranges are compared.",
      "Keep every public-facing claim tied to resume evidence, public links, or user-confirmed examples.",
    ],
    followUpQuestions: shouldPivot
      ? sufficiency.phase === "enhancement"
        ? buildEnhancementQuestions(intake, evidenceText, strongest)
        : buildOpportunityMappingQuestions(intake, evidenceText)
      : buildRemainingFollowUpQuestions(draft.nextQuestions, intake, evidenceText),
    skillGaps: shouldPivot
      ? buildOpportunityMappingGaps(intake, evidenceText)
      : buildRemainingSkillGaps(intake, evidenceText),
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

function shouldMoveToOpportunityMapping(
  sufficiency: EvidenceSufficiencyScore,
) {
  return sufficiency.phase === "enhancement" || sufficiency.phase === "complete";
}

function buildEnhancementQuestions(intake: IntakeForm, evidenceText: string, strongest: string[]) {
  const lead = strongest.slice(0, 2).join(" and ") || intake.target_title || "your strongest career direction";
  const questions = [
    `Can you think of anything that would make the ${lead} positioning even stronger before final analysis?`,
    "Is there one accomplishment, project, or result that the analysis has underweighted so far?",
    "Which already-proven story should become the anchor for resume, LinkedIn, outreach, and interviews?",
    "Is there a career direction, industry, or employer type the app should explicitly avoid before opportunity mapping?",
    "Is there anything impressive but private that should influence strategy without being used in public career materials?",
  ];

  if (evidenceText.includes("github") || evidenceText.includes("ai")) {
    questions.push("Among the AI, GitHub, or technical projects already supplied, which one best shows judgment, usefulness, or technical depth?");
  }

  return questions.slice(0, 6);
}

function buildOpportunityMappingQuestions(intake: IntakeForm, evidenceText: string) {
  const questions = [
    "Which 3-5 industries should we actively target first, and which should remain excluded?",
    "Which geographies should we search: local commuting radius, specific metro areas, regional employers, and remote-only options?",
    "Which employer types feel most promising now: universities, workforce organizations, media/communications teams, SaaS/product teams, nonprofits, healthcare, or local/regional institutions?",
    "Can you provide LinkedIn connection data, alumni network leads, or a short list of people/organizations where a warm introduction may exist?",
    "Which proof-backed project examples should anchor outreach conversations and interview positioning?",
  ];

  if (!evidenceText.includes("linkedin")) {
    questions.push("Can you export or summarize LinkedIn connections so the app can map warm-introduction paths without scraping LinkedIn?");
  }

  return questions.slice(0, 6);
}

function buildOpportunityMappingGaps(intake: IntakeForm, evidenceText: string) {
  return [
    "Target industry shortlist and explicit exclusions for the first search pass.",
    "Geography/remote/hybrid search rules, including commute radius and preferred regions.",
    "A network dataset the app is allowed to use: LinkedIn export, pasted connections, alumni contacts, or manually curated leads.",
    "A first list of target employers to compare against the evidence-backed profile.",
    "Outreach story angle: which verified project examples should open conversations.",
  ];
}

function buildRemainingFollowUpQuestions(
  baseQuestions: string[],
  intake: IntakeForm,
  evidenceText: string,
) {
  const questions = [...baseQuestions];
  if (evidenceText.includes("github") || evidenceText.includes("ai") || evidenceText.includes("automation")) {
    questions.push("Which AI or coding project has the clearest outcome, user impact, or technical depth?");
  }
  if (evidenceText.includes("video") || evidenceText.includes("story") || evidenceText.includes("production")) {
    questions.push("Which video/story projects best prove production responsibility, audience reach, or narrative judgment?");
  }
  if (!intake.claim_boundaries && !evidenceText.includes("do not use publicly")) {
    questions.push("Which strong claims are safe to use publicly, and which should remain private or contextual?");
  }

  return questions
    .filter((question) => !isAnsweredGenericQuestion(question, intake, evidenceText))
    .slice(0, 6);
}

function buildRemainingSkillGaps(intake: IntakeForm, evidenceText: string) {
  const gaps = [
    "Hard metrics from past work that can be used safely.",
    "Specific outcomes, audience reach, usage, or before/after results for public project evidence.",
    "Which project examples should anchor resume, LinkedIn, and interview positioning.",
    "Compensation floor, target, and tradeoffs by remote or hybrid work.",
  ];
  if (!evidenceText.includes("github") && !evidenceText.includes("ai")) {
    gaps.push("Concrete AI, automation, or technical workflow examples.");
  }
  if (!intake.industry_preferences.toLowerCase().includes("military") && !evidenceText.includes("military")) {
    gaps.push("Preferred industries and deal-breaker industries.");
  }
  return gaps.slice(0, 5);
}

function isAnsweredGenericQuestion(question: string, intake: IntakeForm, evidenceText: string) {
  const normalized = question.toLowerCase();
  const combined = `${intake.resume_text}\n${intake.industry_preferences}\n${intake.career_constraints}\n${intake.public_evidence}\n${evidenceText}`.toLowerCase();
  if (normalized.includes("industry") && combined.includes("military")) return true;
  if ((normalized.includes("ai") || normalized.includes("tool")) && (combined.includes("github") || combined.includes("ai"))) return true;
  if (normalized.includes("involvement") && combined.includes("executive director")) return true;
  return false;
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
