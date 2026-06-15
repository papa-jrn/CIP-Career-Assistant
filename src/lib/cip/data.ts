// Top navigation follows the step-by-step product journey. Steps 4-8 are the
// repeating weekly cycle: map advisors (Network), work the relationship queue
// (Follow Up), research employers, translate conversations into role research,
// then brief and feed what was learned back into the next pass.
export interface NavStep {
  href: string;
  label: string;
  step?: number;
  cycle?: boolean;
}

export const navItems: NavStep[] = [
  { href: "/", label: "Workbench" },
  { href: "/intake", label: "Intake", step: 1 },
  { href: "/evidence", label: "Evidence", step: 2 },
  { href: "/assets", label: "Assets", step: 3 },
  { href: "/network", label: "Network", step: 4, cycle: true },
  { href: "/follow-up", label: "Follow Up", step: 5, cycle: true },
  { href: "/employers", label: "Employers", step: 6, cycle: true },
  { href: "/opportunities", label: "Roles", step: 7, cycle: true },
  { href: "/briefing", label: "Briefing", step: 8, cycle: true },
];

export const pathwaySteps = [
  {
    step: "01",
    title: "Turn analysis into career assets",
    outcome: "Update the resume, LinkedIn profile, portfolio notes, and interview stories from verified evidence.",
    detail:
      "Start here when the analysis is solid. The user needs usable public-facing language before outreach or applications scale up.",
    href: "/assets",
    cta: "Prepare assets",
  },
  {
    step: "02",
    title: "Define ideal work, then map network",
    outcome: "Combine LinkedIn/profile data with work preferences, compensation needs, and stretch goals before ranking warm paths.",
    detail:
      "Relationship data should be interpreted through the user's desired workplace, role, pay floor, remote/hybrid needs, dealbreakers, and learning goals.",
    href: "/network",
    cta: "Map network",
  },
  {
    step: "03",
    title: "Review and work warm introductions",
    outcome: "Turn AI-suggested and user-added people into a human-reviewed follow-up queue.",
    detail:
      "Mark who to use now, park, remove, or revisit; capture conversation status, reasons, market signals, new leads, and next actions.",
    href: "/follow-up",
    cta: "Work follow-ups",
  },
  {
    step: "04",
    title: "Find employers by fit",
    outcome: "Search local, regional, remote-first, and national employers that match the ideal work profile.",
    detail:
      "Geography is a user-selected constraint, not the default cage. Local anchors need compensation and seniority evidence before becoming priorities.",
    href: "/employers",
    cta: "Find businesses",
  },
  {
    step: "05",
    title: "Choose job-board search lanes",
    outcome: "Translate the profile into specific LinkedIn, Indeed, Monster, Greenhouse, Lever, and company-careers searches.",
    detail:
      "The goal is not one generic keyword search. The app should produce role families, filters, exclusion terms, and review rules.",
    href: "/opportunities",
    cta: "Research roles",
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

export const profileSignals = [
  { label: "Leadership", value: "High", detail: "Founder/operator background, cross-functional communication, systems building." },
  { label: "Technical Trajectory", value: "Growing", detail: "AI-enabled product work, modern development workflow, applied experimentation." },
  { label: "Narrative Edge", value: "Strong", detail: "Media, communications, community systems, and strategic positioning." },
  { label: "Target Path", value: "$120K+", detail: "Remote or hybrid roles with AI operations, product, customer intelligence, or enablement scope." },
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
