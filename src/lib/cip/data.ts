// Top navigation follows the step-by-step product journey. Steps 4-8 are the
// repeating weekly cycle: map advisors (Network), work the relationship queue
// (Follow Up), research employers, translate conversations into role research,
// then brief and feed what was learned back into the next pass.
export interface NavStep {
  href: string;
  label: string;
  step?: number;
  cycle?: boolean;
  /** Icon name (see src/components/Icon.astro). Optional. */
  icon?: string;
  /** One-line outcome shown on the Workbench "How CIP works" infographic. */
  blurb?: string;
}

export const navItems: NavStep[] = [
  { href: "/", label: "Workbench", icon: "workbench" },
  {
    href: "/intake",
    label: "Intake",
    step: 1,
    icon: "intake",
    blurb: "Capture the career story, constraints, target pay, work model, and proof sources.",
  },
  {
    href: "/evidence",
    label: "Evidence",
    step: 2,
    icon: "evidence",
    blurb: "Separate verified claims, user-supplied context, inferred strengths, and gaps.",
  },
  {
    href: "/assets",
    label: "Career Lanes",
    step: 3,
    icon: "assets",
    blurb: "Turn verified evidence into resume, LinkedIn, portfolio, and outreach language.",
  },
  {
    href: "/network",
    label: "Network",
    step: 4,
    cycle: true,
    icon: "network",
    blurb: "Map advisors and warm connections against the ideal-work profile.",
  },
  {
    href: "/follow-up",
    label: "Follow Up",
    step: 5,
    cycle: true,
    icon: "followup",
    blurb: "Human-review the queue: use now, park, revisit, or remove.",
  },
  {
    href: "/employers",
    label: "Employers",
    step: 6,
    cycle: true,
    icon: "employers",
    blurb: "Research organizations that fit the lane, geography, and work preferences.",
  },
  {
    href: "/opportunities",
    label: "Opportunities",
    step: 7,
    cycle: true,
    icon: "opportunities",
    blurb: "Translate the profile into role families, filters, and review rules.",
  },
  {
    href: "/briefing",
    label: "Briefing",
    step: 8,
    cycle: true,
    icon: "briefing",
    blurb: "Summarize what was learned and feed it back into the next pass.",
  },
  {
    href: "/report",
    label: "Report",
    step: 9,
    icon: "report",
    blurb: "Generate a fresh, evidence-backed report each pass.",
  },
];

export const intakeQuestions = [
  "Which achievements are you proud of that never fit cleanly on a resume?",
  "Which kinds of problems make you lose track of time?",
  "What salary range, location, and work model would make a move worthwhile?",
  "Which industries feel energizing, and which ones are hard no's?",
  "What public evidence can we inspect: LinkedIn, GitHub, portfolio, talks, writing, or projects?",
  "What claims are verified, inferred, or aspirational?",
];

export const opportunities = [
  {
    role: "AI Operations Strategist",
    company: "Remote SaaS company",
    match: 91,
    confidence: "High",
    evidence: "Combines operations leadership, AI workflow design, and stakeholder communication.",
    gap: "Package two workflow automation case studies.",
  },
  {
    role: "Product Enablement Lead",
    company: "B2B platform team",
    match: 86,
    confidence: "Medium",
    evidence: "Maps communications background to product adoption, training, and customer outcomes.",
    gap: "Show measurable enablement outcomes and technical fluency.",
  },
  {
    role: "Career Technology Program Manager",
    company: "Education or workforce org",
    match: 82,
    confidence: "Medium",
    evidence: "Strong fit for systems thinking, coaching, market research, and user advocacy.",
    gap: "Clarify comfort with data tooling and reporting cadence.",
  },
];

export const recommendations = [
  {
    area: "Resume",
    action: "Reframe experience around operating systems, AI adoption, and measurable communication outcomes.",
    guardrail: "Do not invent metrics; mark missing numbers as follow-up questions.",
  },
  {
    area: "LinkedIn",
    action: "Shift headline toward AI-enabled operations, product strategy, and career intelligence.",
    guardrail: "Keep claims traceable to verified projects and public links.",
  },
  {
    area: "Portfolio",
    action: "Create two proof pages: one AI workflow case study and one strategic communications system.",
    guardrail: "Separate shipped work, prototypes, and learning projects.",
  },
];

export const briefingItems = [
  "Prioritize roles where AI adoption meets operations, enablement, or product communication.",
  "Watch companies hiring for workflow transformation, internal tools, RevOps, customer education, and AI program management.",
  "Add source-backed salary notes before ranking opportunities.",
  "Ask one verification question for every inferred strength before generating asset edits.",
];
