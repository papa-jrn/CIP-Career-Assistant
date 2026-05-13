import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeForm } from "@/lib/cip/intake";
import { profileText } from "@/lib/cip/profile";

export interface EmployerCandidate {
  name: string;
  region: string;
  category: string;
  location: string;
  estimated_size: string;
  priority: "critical" | "high" | "medium" | "low";
  target_roles: string[];
  source_url: string;
  careers_url: string;
  adapter_status: "supported" | "needs_adapter" | "manual_review";
  confidence: "high" | "medium" | "low";
  source_notes: Array<{ label: string; value: string; url: string }>;
}

export interface ScoredEmployer extends EmployerCandidate {
  fit_score: number;
  fit_summary: string;
}

export const watchedEmployerPresets: EmployerCandidate[] = [
  {
    name: "Dartmouth Health",
    region: "upper_valley",
    category: "anchor healthcare system",
    location: "Lebanon, NH / Northern New England",
    estimated_size: "16,000+ employees",
    priority: "critical",
    target_roles: ["operations", "program management", "communications", "IT", "research administration", "AI workflow improvement"],
    source_url: "https://www.dartmouth-health.org/about/who-is-dartmouth-health",
    careers_url: "https://careers.dartmouth-health.org/",
    adapter_status: "needs_adapter",
    confidence: "high",
    source_notes: [
      { label: "Scale", value: "Dartmouth Health reports 16,000+ employees.", url: "https://www.dartmouth-health.org/about/who-is-dartmouth-health" },
    ],
  },
  {
    name: "Dartmouth College",
    region: "upper_valley",
    category: "higher education",
    location: "Hanover, NH",
    estimated_size: "5,000-10,000 employees",
    priority: "critical",
    target_roles: ["communications", "IT", "program management", "research administration", "advancement", "operations"],
    source_url: "https://home.dartmouth.edu/about",
    careers_url: "https://searchjobs.dartmouth.edu/",
    adapter_status: "needs_adapter",
    confidence: "high",
    source_notes: [
      { label: "Employer type", value: "Large Ivy League research university and Upper Valley anchor employer.", url: "https://home.dartmouth.edu/about" },
    ],
  },
  {
    name: "Hypertherm Associates",
    region: "upper_valley",
    category: "advanced manufacturing / technology",
    location: "Hanover, NH",
    estimated_size: "1,800+ employees worldwide",
    priority: "high",
    target_roles: ["operations", "product enablement", "software-adjacent roles", "communications", "customer success"],
    source_url: "https://www.hyperthermassociates.com/careers/who-we-are/",
    careers_url: "https://www.hyperthermassociates.com/careers/",
    adapter_status: "manual_review",
    confidence: "high",
    source_notes: [
      { label: "Scale", value: "Hypertherm says it employs more than 1,800 people worldwide.", url: "https://www.hyperthermassociates.com/careers/who-we-are/" },
    ],
  },
  {
    name: "FUJIFILM Dimatix",
    region: "upper_valley",
    category: "advanced manufacturing / technology",
    location: "Lebanon and West Lebanon, NH",
    estimated_size: "677 employees",
    priority: "high",
    target_roles: ["operations", "technical communications", "product support", "manufacturing systems", "IT"],
    source_url: "https://www.fujifilm.com/fdmx/en/about/company-profile",
    careers_url: "https://www.fujifilm.com/fdmx/en/careers",
    adapter_status: "manual_review",
    confidence: "high",
    source_notes: [
      { label: "Scale", value: "Company profile lists 677 employees as of June 1, 2025.", url: "https://www.fujifilm.com/fdmx/en/about/company-profile" },
    ],
  },
  {
    name: "Kimball Union Academy",
    region: "upper_valley",
    category: "independent school",
    location: "Meriden, NH",
    estimated_size: "100-200 employees",
    priority: "medium",
    target_roles: ["communications", "marketing", "advancement", "technology", "operations", "student systems"],
    source_url: "https://www.kua.org/contact-us",
    careers_url: "https://www.kua.org/",
    adapter_status: "manual_review",
    confidence: "medium",
    source_notes: [
      { label: "Scale", value: "Nonprofit/business sources estimate roughly 100+ employees.", url: "https://www.kua.org/contact-us" },
    ],
  },
  {
    name: "King Arthur Baking Company",
    region: "upper_valley",
    category: "food / ecommerce / mission-driven consumer brand",
    location: "Norwich, VT",
    estimated_size: "201-500 employees",
    priority: "high",
    target_roles: ["web/ecommerce", "content strategy", "community", "marketing", "operations", "customer education"],
    source_url: "https://www.kingarthurbaking.com/jobs",
    careers_url: "https://www.kingarthurbaking.com/jobs",
    adapter_status: "needs_adapter",
    confidence: "high",
    source_notes: [
      { label: "Scale", value: "Public company profiles commonly list King Arthur Baking in the 201-500 employee range.", url: "https://www.kingarthurbaking.com/jobs" },
      { label: "Fit signal", value: "Local employee-owned brand with ecommerce, education, community, content, and operations needs.", url: "https://www.kingarthurbaking.com/jobs" },
    ],
  },
  {
    name: "White River Junction VA Healthcare System",
    region: "upper_valley",
    category: "public healthcare / federal",
    location: "White River Junction, VT",
    estimated_size: "large regional system",
    priority: "high",
    target_roles: ["IT", "program management", "communications", "research support", "operations"],
    source_url: "https://www.va.gov/white-river-junction-health-care/about-us/",
    careers_url: "https://www.usajobs.gov/",
    adapter_status: "needs_adapter",
    confidence: "high",
    source_notes: [
      { label: "Scope", value: "VA White River Junction serves Vermont and northwestern New Hampshire across 8 locations.", url: "https://www.va.gov/white-river-junction-health-care/about-us/" },
    ],
  },
  {
    name: "Lebanon School District / SAU 88",
    region: "upper_valley",
    category: "public school system",
    location: "Lebanon, NH",
    estimated_size: "100+ likely",
    priority: "medium",
    target_roles: ["IT", "web communications", "operations", "student systems", "community engagement"],
    source_url: "https://www.sau88.net/",
    careers_url: "https://www.sau88.net/",
    adapter_status: "manual_review",
    confidence: "medium",
    source_notes: [
      { label: "Municipal/school target", value: "School systems are relevant for IT, communications, and operations roles.", url: "https://www.sau88.net/" },
    ],
  },
  {
    name: "City of Lebanon",
    region: "upper_valley",
    category: "municipality",
    location: "Lebanon, NH",
    estimated_size: "100+ likely",
    priority: "medium",
    target_roles: ["communications", "IT", "community programs", "public administration", "operations"],
    source_url: "https://lebanonnh.gov/",
    careers_url: "https://lebanonnh.gov/",
    adapter_status: "manual_review",
    confidence: "medium",
    source_notes: [
      { label: "Municipal target", value: "City government can surface IT, web, communications, and program roles.", url: "https://lebanonnh.gov/" },
    ],
  },
  {
    name: "Northeastern Vermont Regional Hospital",
    region: "northeast_kingdom",
    category: "regional healthcare",
    location: "St. Johnsbury, VT",
    estimated_size: "large regional hospital",
    priority: "critical",
    target_roles: ["operations", "communications", "IT", "program management", "patient systems"],
    source_url: "https://nvrh.org/careers/culture/",
    careers_url: "https://nvrh.org/careers/",
    adapter_status: "manual_review",
    confidence: "high",
    source_notes: [
      { label: "Regional anchor", value: "NVRH describes itself as one of the top places to work in the Northeast Kingdom.", url: "https://nvrh.org/careers/culture/" },
    ],
  },
  {
    name: "North Country Hospital",
    region: "northeast_kingdom",
    category: "regional healthcare",
    location: "Newport, VT",
    estimated_size: "501-1,000 employees",
    priority: "high",
    target_roles: ["operations", "clinical systems", "IT", "communications", "program management"],
    source_url: "https://www.northcountryhospital.org/",
    careers_url: "https://www.northcountryhospital.org/careers/",
    adapter_status: "manual_review",
    confidence: "medium",
    source_notes: [
      { label: "Scale", value: "Employer directories commonly place North Country Hospital in the 501-1,000 employee range.", url: "https://www.northcountryhospital.org/" },
    ],
  },
  {
    name: "Northeast Kingdom Human Services",
    region: "northeast_kingdom",
    category: "human services nonprofit",
    location: "St. Johnsbury and Newport, VT",
    estimated_size: "100+ likely",
    priority: "high",
    target_roles: ["program management", "communications", "operations", "data/reporting", "community systems"],
    source_url: "https://nkhs.org/about-nkhs/",
    careers_url: "https://nkhs.org/careers/",
    adapter_status: "manual_review",
    confidence: "medium",
    source_notes: [
      { label: "Regional scope", value: "NKHS serves Caledonia, Essex, and Orleans counties.", url: "https://nkhs.org/about-nkhs/" },
    ],
  },
  {
    name: "Northeastern Vermont Development Association",
    region: "northeast_kingdom",
    category: "regional development / planning",
    location: "St. Johnsbury and Newport, VT",
    estimated_size: "small team, high network value",
    priority: "medium",
    target_roles: ["economic development", "planning", "grant programs", "communications", "community data"],
    source_url: "https://www.nvda.net/about-nvda.php",
    careers_url: "https://www.nvda.net/",
    adapter_status: "manual_review",
    confidence: "high",
    source_notes: [
      { label: "Strategic value", value: "NVDA is both the regional planning commission and development corporation for the NEK.", url: "https://www.nvda.net/about-nvda.php" },
    ],
  },
  {
    name: "St. Johnsbury School District / municipal ecosystem",
    region: "northeast_kingdom",
    category: "municipality / public school system",
    location: "St. Johnsbury, VT",
    estimated_size: "100+ likely across municipal/school functions",
    priority: "medium",
    target_roles: ["IT", "web communications", "operations", "community programs", "education technology"],
    source_url: "https://www.stjsd.org/",
    careers_url: "https://www.stjsd.org/",
    adapter_status: "manual_review",
    confidence: "medium",
    source_notes: [
      { label: "Public-sector target", value: "School and municipal systems often need IT, communications, and operations support.", url: "https://www.stjsd.org/" },
    ],
  },
];

export function scoreEmployer(candidate: EmployerCandidate, intake: Partial<IntakeForm>): ScoredEmployer {
  const candidateText = normalize([
    candidate.name,
    candidate.category,
    candidate.location,
    candidate.target_roles.join(" "),
    candidate.source_notes.map((note) => note.value).join(" "),
  ].join(" "));
  const userText = normalize(profileText(intake));
  const preferredTerms = tokenize(userText);
  const hits = preferredTerms.filter((term) => candidateText.includes(term));
  let score = priorityBase(candidate.priority) + Math.min(28, hits.length * 4);

  if (candidate.region === "upper_valley" && userText.includes("dartmouth")) score += 10;
  if (candidate.category.includes("healthcare") && /health|care|research|operations|program/.test(userText)) score += 8;
  if (candidate.category.includes("school") && /education|community|communication|media|technology|it/.test(userText)) score += 7;
  if (candidate.category.includes("municipality") && /community|public|program|communications|operations/.test(userText)) score += 7;
  if (candidate.category.includes("manufacturing") && /product|operations|systems|automation|ai/.test(userText)) score += 7;

  score = Math.max(35, Math.min(98, score));

  return {
    ...candidate,
    fit_score: score,
    fit_summary: buildFitSummary(candidate, hits),
  };
}

export async function seedWatchedEmployers(
  supabase: SupabaseClient,
  userId: string,
  intake: Partial<IntakeForm>,
  regions: string[],
) {
  const selected = watchedEmployerPresets.filter((candidate) => regions.includes(candidate.region));
  const scored = selected.map((candidate) => scoreEmployer(candidate, intake));
  let saved = 0;

  for (const employer of scored) {
    const { error } = await supabase.from("watched_employers").upsert(
      {
        user_id: userId,
        name: employer.name,
        region: employer.region,
        category: employer.category,
        location: employer.location,
        estimated_size: employer.estimated_size,
        priority: employer.priority,
        fit_score: employer.fit_score,
        fit_summary: employer.fit_summary,
        target_roles: employer.target_roles,
        source_url: employer.source_url,
        careers_url: employer.careers_url,
        adapter_status: employer.adapter_status,
        confidence: employer.confidence,
        source_notes: employer.source_notes,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name,region" },
    );

    if (!error) saved += 1;
  }

  return { considered: scored.length, saved };
}

function priorityBase(priority: EmployerCandidate["priority"]) {
  return {
    critical: 58,
    high: 50,
    medium: 42,
    low: 34,
  }[priority];
}

function buildFitSummary(candidate: EmployerCandidate, hits: string[]) {
  const hitText = hits.length ? ` Profile overlap: ${hits.slice(0, 5).join(", ")}.` : "";
  return `${candidate.name} is a ${candidate.priority} priority ${candidate.category} target for ${candidate.target_roles.slice(0, 4).join(", ")} roles.${hitText}`;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9+.#\s-]/g, " ");
}

function tokenize(text: string) {
  const stopWords = new Set(["and", "the", "with", "for", "from", "that", "this", "into", "role", "work", "jobs", "have", "been", "will", "would"]);
  return [...new Set(normalize(text).split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)))].slice(0, 60);
}
