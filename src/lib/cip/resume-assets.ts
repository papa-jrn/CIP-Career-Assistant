import type { AdvisorAnalysis, AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";

export interface ResumeAssetDraft {
  mode: "ai" | "deterministic";
  fullName: string;
  contact: string;
  targetTitle: string;
  headline: string;
  summary: string;
  skills: string;
  selectedImpact: string;
  experience: string;
  education: string;
  additional: string;
  internalNotes: string;
}

export interface ResumeAssetContext {
  intake: Partial<IntakeForm>;
  advisor: Partial<AdvisorAnalysis> | null;
  targetLanes: Array<{
    label: string;
    role: string;
    rationale: string;
    missing: string;
  }>;
  positioning: Array<{
    label: string;
    detail: string;
  }>;
  proofItems: Array<{
    claim: string;
    evidence: string;
  }>;
  evidenceResponses?: AdvisorEvidenceResponse[];
  sourceEvidence?: AdvisorEvidenceResponse[];
  analysisReviews?: string[];
}

/**
 * The specific career lane a resume draft is being written for. Defaults to
 * the primary lane (targetLanes[0]) when a caller omits it, preserving the
 * pre-multi-lane behavior.
 */
export type ResumeTargetLane = {
  role: string;
  label: string;
  rationale: string;
};

export function isAiResumeDraftAvailable(context: ResumeAssetContext): boolean {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  return Boolean(openAiKey && context.intake.resume_text);
}

// AI synthesis is slow (an OpenAI Responses round trip), so it must only run
// from the on-demand API endpoint, never during a page render. Returns null
// when the key is missing, there is no resume text, or the call fails. Pass a
// `lane` to target a specific career lane; omit it to default to the primary.
export async function buildAiMasterResumeDraft(
  context: ResumeAssetContext,
  lane?: ResumeTargetLane,
): Promise<ResumeAssetDraft | null> {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!openAiKey || !context.intake.resume_text) return null;
  const targetLane = resolveLane(context, lane);
  const ai = await tryBuildAiMasterResume(context, openAiKey, targetLane);
  return ai ? normalizeResumeDraft(ai) : null;
}

export function buildDeterministicResumeDraft(
  context: ResumeAssetContext,
  lane?: ResumeTargetLane,
): ResumeAssetDraft {
  return normalizeResumeDraft(buildDeterministicCoachingDraft(context, resolveLane(context, lane)));
}

function resolveLane(context: ResumeAssetContext, lane?: ResumeTargetLane): ResumeTargetLane {
  if (lane && lane.role) return lane;
  const primary = context.targetLanes[0];
  return {
    role: primary?.role ?? "target role",
    label: primary?.label ?? "Primary lane",
    rationale: primary?.rationale ?? "Evidence-backed career positioning",
  };
}

async function tryBuildAiMasterResume(context: ResumeAssetContext, openAiKey: string, lane: ResumeTargetLane) {
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
            "You are CIP's senior career strategist and resume writer. Create a new master resume from the user's original resume, intake, advisor analysis, evidence answers, linked-source evidence, and review notes. Do not paste old resume sections wholesale. Preserve true employers, titles, dates, education, tools, and accomplishments, but rewrite the resume through the specified target career lane. Every public claim must be supported by supplied evidence or marked as needing confirmation in internal notes. Do not invent metrics, credentials, employers, dates, degrees, job titles, or technologies. If the evidence is thin, write a stronger truthful version and name the missing proof in internal notes.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: `Generate a refreshed master resume draft written for the "${lane.role}" lane (${lane.label}). Treat the original resume as source material, not copy to append. Rewrite summary, impact, skills, and experience bullets so they support THIS lane and answer likely hiring-manager concerns for ${lane.role}.`,
            lane: {
              role: lane.role,
              label: lane.label,
              rationale: lane.rationale,
              instruction: `This resume is one of up to three lane-specific variants the user will generate. Tailor the angle, de-emphasized details, headline, and skills ordering to ${lane.role}. A different variant will be generated separately for the other lanes, so do not try to hedge across all of them here.`,
            },
            required_behavior: [
              "Synthesize across the full context; do not merely summarize advisor paragraphs.",
              "selectedImpact must be polished resume-caliber accomplishment bullets rewritten for this lane. Never copy proofItems claim/evidence text, evidence answers, or intake phrasing verbatim - the evidence is source material written informally, not resume copy.",
              "Rewrite experience bullets around situation, action, scope, result, and proof.",
              "Keep real role chronology and recognizable user voice.",
              "De-emphasize old details that do not support the target lane.",
              "Use placeholders only for missing metrics or claims needing user confirmation.",
              "Put private/sensitive/uncertain claims only in internalNotes.",
              "Do not duplicate education, credentials, projects, or accomplishments across sections. If a detail belongs in Education, do not repeat it in Additional.",
              "Return each school, degree, certification, employer, project, and bullet only once unless the repeated mention adds a genuinely new fact.",
            ],
            context,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cip_master_resume_draft",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "fullName",
              "contact",
              "targetTitle",
              "headline",
              "summary",
              "skills",
              "selectedImpact",
              "experience",
              "education",
              "additional",
              "internalNotes",
            ],
            properties: {
              fullName: { type: "string" },
              contact: { type: "string" },
              targetTitle: { type: "string" },
              headline: { type: "string" },
              summary: { type: "string" },
              skills: { type: "string" },
              selectedImpact: { type: "string" },
              experience: { type: "string" },
              education: { type: "string" },
              additional: { type: "string" },
              internalNotes: { type: "string" },
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
    const parsed = JSON.parse(text) as Omit<ResumeAssetDraft, "mode">;
    return { mode: "ai" as const, ...parsed };
  } catch {
    return null;
  }
}

function buildDeterministicCoachingDraft(context: ResumeAssetContext, lane: ResumeTargetLane): ResumeAssetDraft {
  const intake = context.intake;
  const fullName = textValue(intake.full_name) || "Your Name";
  const email = textValue(intake.email);
  const linkedin = textValue(intake.linkedin_url);
  const targetTitle = textValue(intake.target_title) || lane.role || "Target Role";
  const workModes = Array.isArray(intake.work_modes) ? intake.work_modes.map(String).filter(Boolean).join(", ") : "";
  const salary = intake.salary_target ? `$${Number(intake.salary_target).toLocaleString()} target` : "";
  const proofBullets = context.proofItems.length
    ? context.proofItems.map((item) => `- ${item.claim}\n  Evidence: ${item.evidence}`).join("\n")
    : "- Add 3-5 verified accomplishments that support this lane.";
  const originalRoles = extractRoleSignals(textValue(intake.resume_text));

  return {
    mode: "deterministic",
    fullName,
    contact: [email, linkedin, workModes, salary].filter(Boolean).join(" | "),
    targetTitle,
    headline: `${targetTitle} | ${lane.rationale}`,
    summary: [
      context.positioning[0]?.detail ?? `Write a 3-4 line summary around the ${lane.role} (${lane.label}) lane.`,
      context.positioning[1]?.detail ?? "Anchor the summary in verified accomplishments, not broad traits.",
      "This worksheet cannot safely rewrite the full resume. Use the Generate AI master resume button to create a synthesized draft for this lane (requires OPENAI_API_KEY and saved resume text).",
    ].join("\n\n"),
    skills: buildSkills(context),
    selectedImpact: proofBullets,
    experience: buildExperienceRewriteWorksheet(originalRoles, lane.role || targetTitle),
    education: inferEducation(textValue(intake.resume_text)),
    additional: [textValue(intake.portfolio_urls), textValue(intake.public_evidence)].filter(Boolean).join("\n"),
    internalNotes: [
      `Resume generation is in deterministic coaching mode for the ${lane.label} (${lane.role}) lane, so CIP is showing a rewrite worksheet instead of pretending it can synthesize a finished resume.`,
      "Run the Generate AI master resume button for the career-coach rewrite pass (requires OPENAI_API_KEY).",
      ...context.proofItems.map((item) => `Traceable claim: ${item.claim} | ${item.evidence}`),
    ].join("\n"),
  };
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

function normalizeResumeDraft(draft: ResumeAssetDraft): ResumeAssetDraft {
  const education = dedupeLines(draft.education);
  return {
    ...draft,
    summary: dedupeParagraphs(draft.summary),
    selectedImpact: dedupeLines(draft.selectedImpact),
    experience: dedupeRoleBlocks(draft.experience),
    education,
    additional: removeDuplicateLines(dedupeLines(draft.additional), education),
    internalNotes: dedupeLines(draft.internalNotes),
  };
}

function dedupeParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(uniqueNormalized())
    .join("\n\n");
}

function dedupeLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(uniqueNormalized((line) => line.replace(/^[-*]\s*/, "")))
    .join("\n");
}

function dedupeRoleBlocks(value: string) {
  return value
    .split(/\n{2,}/)
    .map((block) => dedupeLines(block))
    .filter(uniqueNormalized())
    .join("\n\n");
}

function removeDuplicateLines(value: string, duplicateSource: string) {
  const duplicates = new Set(
    duplicateSource
      .split(/\r?\n/)
      .map((line) => normalizeForDedupe(line))
      .filter(Boolean),
  );
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !duplicates.has(normalizeForDedupe(line)))
    .join("\n");
}

function uniqueNormalized(mapper: (value: string) => string = (value) => value) {
  const seen = new Set<string>();
  return (value: string) => {
    const normalized = normalizeForDedupe(mapper(value));
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  };
}

function normalizeForDedupe(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSkills(context: ResumeAssetContext) {
  const source = [
    ...(context.advisor?.positioning ?? []),
    ...context.proofItems.map((item) => item.claim),
    context.intake.resume_text,
  ].join(" ");
  const fallbacks = [
    "Leadership",
    "Operations",
    "AI adoption",
    "Product strategy",
    "Research",
    "Communication",
    "Automation",
    "Program management",
    "Stakeholder alignment",
    "Market analysis",
    "Portfolio storytelling",
    "Process design",
  ];
  const normalized = source.toLowerCase();
  const matches = fallbacks.filter((item) => normalized.includes(item.toLowerCase().split(" ")[0]));
  return [...new Set(matches.length ? matches : fallbacks.slice(0, 8))].join(" | ");
}

function buildExperienceRewriteWorksheet(roleSignals: string[], primaryLane: string) {
  const sourceRoles = roleSignals.length ? roleSignals : ["Most relevant prior role", "Additional relevant role"];
  return sourceRoles
    .slice(0, 6)
    .map((role) =>
      [
        role,
        `- Rewrite this role for ${primaryLane}: name the problem, scope, stakeholders, actions, and result.`,
        "- Add only metrics the user can defend; otherwise mark the missing number in internal notes.",
        "- Keep details that prove the target lane and remove duties that dilute the story.",
      ].join("\n"),
    )
    .join("\n\n");
}

function extractRoleSignals(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (line.length < 8 || line.length > 120) return false;
      if (/^[-*]/.test(line)) return false;
      return /\b(director|manager|lead|specialist|coordinator|consultant|founder|owner|analyst|developer|engineer|producer|writer|teacher|assistant|associate|president|officer)\b/i.test(line);
    })
    .slice(0, 8);
}

function inferEducation(text: string) {
  const educationLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\b(dartmouth|bachelor|b\.a\.|ba\b|b\.s\.|bs\b|master|m\.a\.|mba|university|college|degree)\b/i.test(line));
  return educationLines.slice(0, 5).join("\n");
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
