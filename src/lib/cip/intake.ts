import { z } from "zod";

export const intakeQuestionFields = [
  {
    name: "hidden_achievements",
    label: "Which achievements are you proud of that never fit cleanly on a resume?",
    placeholder: "Awards, hard problems, leadership moments, turnarounds, projects, or quiet wins.",
  },
  {
    name: "energizing_problems",
    label: "Which kinds of problems make you lose track of time?",
    placeholder: "Systems, storytelling, technical puzzles, people operations, research, product ideas...",
  },
  {
    name: "career_constraints",
    label: "What salary range, location, and work model would make a move worthwhile?",
    placeholder: "Target comp, remote/hybrid preferences, geography, travel, schedule, deal breakers.",
  },
  {
    name: "industry_preferences",
    label: "Which industries feel energizing, and which ones are hard no's?",
    placeholder: "AI, media, workforce, education, health, SaaS, local business, public sector...",
  },
  {
    name: "public_evidence",
    label: "What public evidence can we inspect?",
    placeholder: "LinkedIn, GitHub, portfolio, websites, writing, talks, public projects, communities.",
  },
  {
    name: "claim_boundaries",
    label: "What claims are verified, inferred, or aspirational?",
    placeholder: "Separate what is proven from what the app should ask about before using.",
  },
] as const;

const optionalText = z.string().trim().max(8_000).optional().default("");

export const intakeFormSchema = z.object({
  full_name: z.string().trim().max(160).optional().default(""),
  target_title: z.string().trim().max(240).optional().default(""),
  email: z.string().trim().email().or(z.literal("")).optional().default(""),
  salary_target: z.coerce.number().int().positive().max(1_000_000).optional(),
  work_modes: z.array(z.string()).optional().default([]),
  resume_text: z.string().trim().min(40, "Paste at least a short resume, work history, or career note.").max(30_000),
  linkedin_url: z.string().trim().url("LinkedIn must be a valid URL.").or(z.literal("")).optional().default(""),
  portfolio_urls: optionalText,
  hidden_achievements: optionalText,
  energizing_problems: optionalText,
  career_constraints: optionalText,
  industry_preferences: optionalText,
  public_evidence: optionalText,
  claim_boundaries: optionalText,
});

export type IntakeForm = z.infer<typeof intakeFormSchema>;

export function parseIntakeForm(form: FormData) {
  return intakeFormSchema.safeParse({
    full_name: getText(form, "full_name"),
    target_title: getText(form, "target_title"),
    email: getText(form, "email"),
    salary_target: getText(form, "salary_target") || undefined,
    work_modes: form.getAll("work_modes"),
    resume_text: getText(form, "resume_text"),
    linkedin_url: getText(form, "linkedin_url"),
    portfolio_urls: getText(form, "portfolio_urls"),
    hidden_achievements: getText(form, "hidden_achievements"),
    energizing_problems: getText(form, "energizing_problems"),
    career_constraints: getText(form, "career_constraints"),
    industry_preferences: getText(form, "industry_preferences"),
    public_evidence: getText(form, "public_evidence"),
    claim_boundaries: getText(form, "claim_boundaries"),
  });
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function buildIdentityDraft(intake: IntakeForm) {
  const combined = [
    intake.resume_text,
    intake.hidden_achievements,
    intake.energizing_problems,
    intake.industry_preferences,
    intake.public_evidence,
  ].join("\n");

  return {
    strengths: uniqueMatches(combined, [
      "leadership",
      "operations",
      "communication",
      "strategy",
      "research",
      "product",
      "writing",
      "automation",
      "ai",
      "community",
      "media",
      "project management",
    ]),
    possibleRoles: inferRoles(combined, intake.target_title),
    evidenceChecklist: [
      hasAny(intake.linkedin_url) ? "LinkedIn URL captured" : "Add LinkedIn URL",
      hasAny(intake.portfolio_urls) ? "Portfolio or public links captured" : "Add portfolio, GitHub, or public project links",
      hasAny(intake.claim_boundaries) ? "Claim boundaries documented" : "Separate verified, inferred, and aspirational claims",
      intake.resume_text.length > 800 ? "Resume/work history has enough detail for extraction" : "Add more resume detail before deep analysis",
    ],
    nextQuestions: [
      "Which accomplishments have hard numbers that can be safely used?",
      "Which roles would be a clear no even if compensation is strong?",
      "What proof should the app cite before suggesting LinkedIn or resume edits?",
    ],
  };
}

function inferRoles(text: string, targetTitle: string) {
  const roles = new Set<string>();
  const normalized = text.toLowerCase();
  if (targetTitle) roles.add(targetTitle);
  if (normalized.includes("ai") || normalized.includes("automation")) roles.add("AI Operations Strategist");
  if (normalized.includes("media") || normalized.includes("communication")) roles.add("Product Enablement Lead");
  if (normalized.includes("community") || normalized.includes("program")) roles.add("Career Technology Program Manager");
  if (normalized.includes("research") || normalized.includes("market")) roles.add("Labor Market Research Analyst");
  if (roles.size === 0) roles.add("Career Strategy Candidate Profile");
  return [...roles].slice(0, 5);
}

function uniqueMatches(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  const matches = terms.filter((term) => normalized.includes(term));
  return matches.length ? matches : ["career narrative", "transferable experience", "market positioning"];
}

function hasAny(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}
