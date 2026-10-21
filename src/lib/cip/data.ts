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
    blurb: "Run the weekly search: verified openings at your target employers and trusted job sources.",
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
