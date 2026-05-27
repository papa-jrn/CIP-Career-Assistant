export const navItems = [
  { href: "/", label: "Workbench" },
  { href: "/intake", label: "Intake" },
  { href: "/evidence", label: "Evidence" },
  { href: "/#pathway", label: "Action plan" },
  { href: "/network", label: "Network" },
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
    title: "Bring in relationship data",
    outcome: "Add LinkedIn connections, alumni lists, or manually entered contacts to identify warm-introduction paths.",
    detail:
      "This should be user-supplied data only. CIP can coach the export/paste workflow and map relationships without scraping private networks.",
    href: "/network",
    cta: "Map network",
  },
  {
    step: "03",
    title: "Find employers by geography",
    outcome: "Search a target area for businesses, institutions, and regional anchors that match the opportunity criteria.",
    detail:
      "Employer discovery should follow the user's target role families, location preferences, compensation needs, and relationship paths.",
    href: "/employers",
    cta: "Find businesses",
  },
  {
    step: "04",
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
