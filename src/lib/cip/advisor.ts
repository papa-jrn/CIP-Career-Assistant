import type { IntakeForm } from "@/lib/cip/intake";

export interface AdvisorAnalysis {
  mode: "ai" | "deterministic";
  summary: string;
  positioning: string[];
  followUpQuestions: string[];
  skillGaps: string[];
  roleBriefs: RoleBrief[];
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

export async function buildAdvisorAnalysis(
  intake: IntakeForm,
  draft: {
    strengths: string[];
    possibleRoles: string[];
    evidenceChecklist: string[];
    nextQuestions: string[];
  },
): Promise<AdvisorAnalysis> {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const ai = await tryBuildAiAnalysis(intake, draft, openAiKey);
    if (ai) return ai;
  }

  return buildDeterministicAnalysis(intake, draft);
}

async function tryBuildAiAnalysis(
  intake: IntakeForm,
  draft: Parameters<typeof buildAdvisorAnalysis>[1],
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
            "You are a careful career intelligence analyst. Do not invent credentials, employers, metrics, or live job listings. Produce concise, evidence-aware JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Analyze this career intake and produce strategic follow-up questions, positioning, skill gaps, and role briefs.",
            output_schema: {
              summary: "One concise paragraph.",
              positioning: ["3-5 source-grounded positioning points."],
              followUpQuestions: ["4-6 questions that would improve analysis quality."],
              skillGaps: ["3-5 likely gaps or proof gaps to verify."],
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
            required: ["summary", "positioning", "followUpQuestions", "skillGaps", "roleBriefs"],
            properties: {
              summary: { type: "string" },
              positioning: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
              followUpQuestions: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 6 },
              skillGaps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
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
      roleBriefs: Array<Omit<RoleBrief, "searchTargets">>;
    };
    return {
      mode: "ai" as const,
      summary: parsed.summary,
      positioning: parsed.positioning,
      followUpQuestions: parsed.followUpQuestions,
      skillGaps: parsed.skillGaps,
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
      "This draft points toward roles where leadership, operations, communication, and applied AI work can be framed as business value. The next analysis pass should verify proof, compensation fit, and which role families are strongest in the live market.",
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
    roleBriefs,
  };
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
