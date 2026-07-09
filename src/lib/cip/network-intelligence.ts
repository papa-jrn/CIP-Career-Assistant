import { inflateRawSync } from "node:zlib";
import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";

export interface NetworkContact {
  name: string;
  company: string;
  title: string;
  profileUrl: string;
  email: string;
  connectedOn: string;
  source: string;
  notes: string;
}

// Import abuse limits: cap files per import, bytes per file, inflated bytes
// per ZIP entry (zip-bomb defense - enforced DURING decompression), and
// entries read per archive.
const MAX_IMPORT_FILES = 10;
const MAX_IMPORT_FILE_BYTES = 25_000_000;
const MAX_ZIP_ENTRY_BYTES = 25_000_000;
const MAX_ZIP_ENTRIES = 40;

function looksLikeZip(bytes: Buffer) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export interface NetworkImportSummary {
  fileName: string;
  kind: "zip" | "csv" | "xlsx" | "txt" | "pdf" | "unsupported";
  status: "parsed" | "recorded" | "skipped";
  detail: string;
  contactCount: number;
  rowCount: number;
}

export interface NetworkContactMatch {
  contact: NetworkContact;
  score: number;
  confidence: "high" | "medium" | "low";
  laneMatches: string[];
  matchReasons: string[];
  recommendedFirstAsk: string;
  outreachStory: string;
  relationshipContext: string[];
  clarifyingQuestions: string[];
}

export interface CareerLaneValidation {
  lane: string;
  status: "validated" | "promising" | "needs_research";
  score: number;
  namedPeople: string[];
  signals: string[];
  recommendedValidationAsk: string;
  missingEvidence: string[];
}

export interface ContextPoolSignal {
  label: string;
  type: "community" | "alumni" | "former_employer" | "group" | "other";
  reason: string;
  namedPeople: string[];
  nextStep: string;
}

export interface NetworkAnalysis {
  mode: "ai" | "deterministic";
  summary: string;
  sourceInventory: string[];
  laneValidations: CareerLaneValidation[];
  contextPools: ContextPoolSignal[];
  reconnectCandidates: string[];
  reconnectQuestions: string[];
  topPaths: string[];
  employerOverlaps: string[];
  adjacentNetworkSignals: string[];
  weeklyMoves: string[];
  followUpQuestions: string[];
  confidenceNotes: string[];
  relationshipCoaching?: string[];
  contactMatches: NetworkContactMatch[];
}

export interface EmployerContext {
  name: string;
  category?: string | null;
  location?: string | null;
  priority?: string | null;
  fit_score?: number | null;
  target_roles?: string[] | null;
  fit_summary?: string | null;
}

export interface NetworkFeedback {
  contactName: string;
  feedbackType:
    | "remove"
    | "deceased"
    | "current_involvement"
    | "context"
    | "park"
    | "use_now"
    | "follow_up"
    | "active_relationship"
    | "no_memory"
    | "retired"
    | "too_cold"
    | "ethical_concern";
  note: string;
}

export interface IdealWorkProfile {
  targetRoles: string;
  compensationFloor: string;
  workModel: string;
  geographyScope: string;
  idealWorkplace: string;
  stretchGoals: string;
  dealbreakers: string;
  localAnchorNotes: string;
}

export async function parseNetworkImport(form: FormData) {
  const contacts: NetworkContact[] = [];
  const files: NetworkImportSummary[] = [];
  const notes = getText(form, "relationship_notes");
  const warmConnectionNotes = getAllText(form, "warm_connection_notes");
  const feedbackNotes = getText(form, "network_feedback");
  const idealWorkProfile = parseIdealWorkProfile(form);
  const noteHints = parseRelationshipHints([notes, warmConnectionNotes, feedbackNotes].filter(Boolean).join("\n"));

  let acceptedFiles = 0;
  for (const value of form.getAll("network_files")) {
    if (!(value instanceof File) || !value.name) continue;
    if (acceptedFiles >= MAX_IMPORT_FILES) {
      files.push({
        fileName: value.name,
        kind: "unsupported",
        status: "skipped",
        detail: `File limit reached (${MAX_IMPORT_FILES} per import). Upload this one in a separate import.`,
        contactCount: 0,
        rowCount: 0,
      });
      continue;
    }
    if (value.size > MAX_IMPORT_FILE_BYTES) {
      files.push({
        fileName: value.name,
        kind: "unsupported",
        status: "skipped",
        detail: `File exceeds the ${Math.floor(MAX_IMPORT_FILE_BYTES / 1_000_000)} MB per-file limit.`,
        contactCount: 0,
        rowCount: 0,
      });
      continue;
    }
    acceptedFiles += 1;
    const parsed = await parseNetworkFile(value);
    contacts.push(...parsed.contacts);
    files.push(...parsed.files);
  }

  if (notes) {
    const parsedNotes = parseContactText(notes, "Pasted relationship notes");
    contacts.push(...parsedNotes);
    files.push({
      fileName: "Pasted relationship notes",
      kind: "txt",
      status: parsedNotes.length ? "parsed" : "recorded",
      detail: parsedNotes.length
        ? "Parsed pasted contacts or notes into reviewable relationship records."
        : "Captured pasted notes but did not find contact-like rows.",
      contactCount: parsedNotes.length,
      rowCount: 0,
    });
  }

  if (warmConnectionNotes) {
    const parsedWarmConnections = parseStructuredWarmConnectionText(warmConnectionNotes);
    contacts.push(...parsedWarmConnections);
    files.push({
      fileName: "Structured warm connections",
      kind: "txt",
      status: parsedWarmConnections.length ? "parsed" : "recorded",
      detail: parsedWarmConnections.length
        ? "Parsed user-added warm connections with links, relationship context, and conversation status."
        : "Captured warm connection rows but did not find reviewable people.",
      contactCount: parsedWarmConnections.length,
      rowCount: 0,
    });
  }

  const enrichedContacts = enrichContactsWithNarrativeNotes(dedupeContacts(contacts), noteHints);

  return {
    contacts: enrichedContacts.slice(0, 500),
    files,
    notes,
    warmConnectionNotes,
    feedbackNotes,
    noteHints,
    idealWorkProfile,
  };
}

export async function buildNetworkAnalysis({
  contacts,
  files,
  intake,
  latestAnalysis,
  employers,
  feedback = [],
  idealWorkProfile,
  conversationNotes = [],
}: {
  contacts: NetworkContact[];
  files: NetworkImportSummary[];
  intake: Partial<IntakeForm> | null;
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  employers: EmployerContext[];
  feedback?: NetworkFeedback[];
  idealWorkProfile?: IdealWorkProfile;
  conversationNotes?: string[];
}): Promise<NetworkAnalysis> {
  const deterministic = buildDeterministicNetworkAnalysis({ contacts, files, intake, latestAnalysis, employers, feedback, idealWorkProfile });
  if (conversationNotes.length) {
    deterministic.sourceInventory = [
      ...deterministic.sourceInventory,
      `${conversationNotes.length} loop-back conversation note record(s) from prior advisor/market-read conversations.`,
    ];
  }
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!openAiKey) return deterministic;

  const ai = await tryBuildAiNetworkAnalysis({
    contacts: contacts.slice(0, 150),
    files,
    intake,
    latestAnalysis,
    employers: employers.slice(0, 80),
    feedback,
    idealWorkProfile,
    conversationNotes: conversationNotes.slice(0, 10).map((note) => note.slice(0, 4_000)),
    deterministic,
    openAiKey,
  });

  return ai ?? deterministic;
}

async function parseNetworkFile(file: File) {
  const name = file.name;
  const lower = name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());

  // ZIP-based formats must actually start with the ZIP local-file-header
  // magic ("PK"); extension alone is not proof of content.
  if ((lower.endsWith(".zip") || lower.endsWith(".xlsx")) && !looksLikeZip(bytes)) {
    return {
      contacts: [],
      files: [{
        fileName: name,
        kind: "unsupported" as const,
        status: "skipped" as const,
        detail: "File content does not match its extension (not a real ZIP/Excel file).",
        contactCount: 0,
        rowCount: 0,
      }],
    };
  }

  if (lower.endsWith(".zip")) {
    const entries = readZipEntries(bytes);
    const contacts: NetworkContact[] = [];
    const files: NetworkImportSummary[] = [{
      fileName: name,
      kind: "zip",
      status: entries.length ? "recorded" : "skipped",
      detail: entries.length
        ? `Found ${entries.length} readable ZIP entries. Parsed CSV/TXT entries that looked like connection data.`
        : "Could not find readable CSV/TXT entries in this ZIP.",
      contactCount: 0,
      rowCount: entries.length,
    }];

    for (const entry of entries) {
      const entryName = entry.name.toLowerCase();
      if (entryName.endsWith(".csv")) {
        const parsed = parseCsvContacts(entry.text, entry.name);
        const rowCount = countContactRows(entry.text);
        contacts.push(...parsed);
        files.push({
          fileName: `${name} / ${entry.name}`,
          kind: "csv",
          status: parsed.length ? "parsed" : "recorded",
          detail: parsed.length ? "Parsed CSV contact rows from the archive." : "Read CSV but did not find LinkedIn-style contact rows.",
          contactCount: parsed.length,
          rowCount,
        });
      } else if (entryName.endsWith(".xlsx")) {
        const parsed = parseXlsxContacts(entry.bytes, entry.name);
        contacts.push(...parsed.contacts);
        files.push({
          fileName: `${name} / ${entry.name}`,
          kind: "xlsx",
          status: parsed.contacts.length ? "parsed" : "recorded",
          detail: parsed.contacts.length ? "Parsed Excel contact rows from the archive." : "Read Excel workbook but did not find contact-like rows.",
          contactCount: parsed.contacts.length,
          rowCount: parsed.rowCount,
        });
      } else if (entryName.endsWith(".txt")) {
        const parsed = parseContactText(entry.text, entry.name);
        contacts.push(...parsed);
        files.push({
          fileName: `${name} / ${entry.name}`,
          kind: "txt",
          status: parsed.length ? "parsed" : "recorded",
          detail: parsed.length ? "Parsed text contact rows from the archive." : "Read text file but did not find contact-like rows.",
          contactCount: parsed.length,
          rowCount: entry.text.split(/\r?\n/).filter((line) => line.trim()).length,
        });
      }
    }

    files[0].contactCount = contacts.length;
    return { contacts, files };
  }

  if (lower.endsWith(".csv")) {
    const text = bytes.toString("utf8");
    const contacts = parseCsvContacts(text, name);
    return {
      contacts,
      files: [{
        fileName: name,
        kind: "csv" as const,
        status: contacts.length ? "parsed" as const : "recorded" as const,
        detail: contacts.length ? "Parsed CSV contact rows." : "Read CSV but did not find LinkedIn-style contact rows.",
        contactCount: contacts.length,
        rowCount: countContactRows(text),
      }],
    };
  }

  if (lower.endsWith(".xlsx")) {
    const parsed = parseXlsxContacts(bytes, name);
    return {
      contacts: parsed.contacts,
      files: [{
        fileName: name,
        kind: "xlsx" as const,
        status: parsed.contacts.length ? "parsed" as const : "recorded" as const,
        detail: parsed.contacts.length ? "Parsed Excel contact rows." : "Read Excel workbook but did not find contact-like rows.",
        contactCount: parsed.contacts.length,
        rowCount: parsed.rowCount,
      }],
    };
  }

  if (lower.endsWith(".txt")) {
    const text = bytes.toString("utf8");
    const contacts = parseContactText(text, name);
    return {
      contacts,
      files: [{
        fileName: name,
        kind: "txt" as const,
        status: contacts.length ? "parsed" as const : "recorded" as const,
        detail: contacts.length ? "Parsed text contact rows." : "Read text but did not find contact-like rows.",
        contactCount: contacts.length,
        rowCount: text.split(/\r?\n/).filter((line) => line.trim()).length,
      }],
    };
  }

  if (lower.endsWith(".pdf")) {
    return {
      contacts: [],
      files: [{
        fileName: name,
        kind: "pdf" as const,
        status: "recorded" as const,
        detail: "Profile PDF received. Text extraction is not active in this first import pass, so this file is recorded as supplied context.",
        contactCount: 0,
        rowCount: 0,
      }],
    };
  }

  return {
    contacts: [],
    files: [{
      fileName: name,
      kind: "unsupported" as const,
      status: "skipped" as const,
      detail: "Unsupported file type.",
      contactCount: 0,
      rowCount: 0,
    }],
  };
}

function parseCsvContacts(text: string, source: string): NetworkContact[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headerIndex = findContactHeaderRow(rows);
  if (headerIndex < 0) return [];

  const header = rows[headerIndex].map((cell) => normalizeHeader(cell));
  return rows.slice(headerIndex + 1).map((row) => {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ""]));
    const firstName = pick(record, ["firstname", "firstname"]);
    const lastName = pick(record, ["lastname", "lastname"]);
    const fullName = pick(record, ["name", "fullname"]) || [firstName, lastName].filter(Boolean).join(" ");
    return cleanContact({
      name: fullName,
      company: pick(record, ["company", "companyname", "companies", "organization", "organizationname", "employer"]),
      title: pick(record, ["position", "positions", "title", "jobtitle", "occupation", "headline"]),
      profileUrl: pick(record, ["url", "profileurl", "linkedinurl", "publicprofileurl"]),
      email: pick(record, ["emailaddress", "email"]),
      connectedOn: pick(record, ["connectedon", "connecteddate", "date"]),
      source,
      notes: "",
    });
  }).filter(isUsefulContact);
}

function parseContactText(text: string, source: string): NetworkContact[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^name\s*[|,]/i.test(line))
    .map((line) => {
      const parts = line.includes("|") ? line.split("|").map((part) => part.trim()) : parseCsvLine(line).map((part) => part.trim());
      return cleanContact({
        name: parts[0] ?? "",
        company: parts[1] ?? "",
        title: parts[2] ?? "",
        profileUrl: parts.find((part) => /^https?:\/\//i.test(part)) ?? "",
        email: parts.find((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) ?? "",
        connectedOn: "",
        source,
        notes: parts.slice(3).filter((part) => !/^https?:\/\//i.test(part)).join(" | "),
      });
    })
    .filter(isUsefulContact);
}

function parseStructuredWarmConnectionText(text: string): NetworkContact[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.split("|").length >= 4)
    .map((line) => {
      const parts = line.split("|").map((part) => part.replace(/\s+/g, " ").trim());
      return cleanContact({
        name: parts[0] ?? "",
        company: parts[1] ?? "",
        title: parts[2] ?? "",
        profileUrl: parts.find((part) => /^https?:\/\//i.test(part)) ?? "",
        email: parts.find((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) ?? "",
        connectedOn: "",
        source: "Structured warm connections",
        notes: parts.slice(3).filter((part) => !/^https?:\/\//i.test(part)).join(" | "),
      });
    })
    .filter((contact) => isUsefulContact(contact) && isSpecificPerson(contact));
}

function parseXlsxContacts(bytes: Buffer, source: string): { contacts: NetworkContact[]; rowCount: number } {
  const entries = readZipEntries(bytes, /\.(xml)$/i);
  if (!entries.length) return { contacts: [], rowCount: 0 };

  const sharedStrings = parseSharedStrings(entries.find((entry) => entry.name === "xl/sharedStrings.xml")?.text ?? "");
  const worksheets = entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  let totalRows = 0;

  for (const worksheet of worksheets) {
    const rows = parseWorksheetRows(worksheet.text, sharedStrings);
    totalRows += rows.length;
    const contacts = parseRowsAsContacts(rows, source);
    if (contacts.length) return { contacts, rowCount: Math.max(0, countContactRowsFromRows(rows)) };
  }

  return { contacts: [], rowCount: totalRows };
}

function parseRowsAsContacts(rows: string[][], source: string) {
  const text = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  return parseCsvContacts(text, source);
}

function findContactHeaderRow(rows: string[][]) {
  return rows.slice(0, 30).findIndex((row) => {
    const header = row.map((cell) => normalizeHeader(cell));
    const hasName = header.some((key) => ["name", "fullname", "firstname", "lastname"].includes(key));
    const hasContactSignal = header.some((key) => [
      "company",
      "companyname",
      "companies",
      "organization",
      "organizationname",
      "position",
      "positions",
      "title",
      "jobtitle",
      "headline",
      "url",
      "profileurl",
      "linkedinurl",
      "publicprofileurl",
      "email",
      "emailaddress",
      "connectedon",
    ].includes(key));
    return hasName && hasContactSignal;
  });
}

function countContactRows(text: string) {
  const rows = parseCsv(text);
  return countContactRowsFromRows(rows);
}

function countContactRowsFromRows(rows: string[][]) {
  const headerIndex = findContactHeaderRow(rows);
  if (headerIndex < 0) return Math.max(0, rows.length - 1);
  return rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim())).length;
}

function buildDeterministicNetworkAnalysis({
  contacts,
  files,
  intake,
  latestAnalysis,
  employers,
  feedback,
  idealWorkProfile,
}: {
  contacts: NetworkContact[];
  files: NetworkImportSummary[];
  intake: Partial<IntakeForm> | null;
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  employers: EmployerContext[];
  feedback: NetworkFeedback[];
  idealWorkProfile?: IdealWorkProfile;
}): NetworkAnalysis {
  const careerLanes = deriveCareerLanes(intake, latestAnalysis, idealWorkProfile);
  const sourceInventory = buildSourceInventory(contacts, files, employers, idealWorkProfile);
  const matches = contacts
    .filter((contact) => isSpecificPerson(contact))
    .filter((contact) => !isSelfContact(contact, intake))
    .filter((contact) => !isExcludedByFeedback(contact, feedback))
    .map((contact) => scoreContact(contact, { intake, latestAnalysis, employers, careerLanes, idealWorkProfile }))
    .filter((match) => match.score >= 34 && hasStrategicSignal(match))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const laneValidations = buildLaneValidations(careerLanes, matches);
  const contextPools = buildContextPools(contacts, matches, feedback);
  const employerOverlaps = buildEmployerOverlaps(matches);
  const adjacentSignals = buildAdjacentSignals(matches);
  const reconnectCandidates = matches.slice(0, 5);
  const relationshipCoaching = buildRelationshipCoaching(matches, contextPools, idealWorkProfile);
  const contactCount = contacts.length;
  const parsedFiles = files.filter((file) => file.status === "parsed").length;
  const validatedLaneCount = laneValidations.filter((lane) => lane.status !== "needs_research").length;

  return {
    mode: "deterministic",
    summary: contactCount
      ? `Imported ${contactCount} reviewable network contact${contactCount === 1 ? "" : "s"} from ${parsedFiles} parsed source${parsedFiles === 1 ? "" : "s"}. This pass tested ${careerLanes.length} career lane${careerLanes.length === 1 ? "" : "s"} against named people, saved employers, and relationship notes. It found ${validatedLaneCount} lane${validatedLaneCount === 1 ? "" : "s"} with enough network signal to validate through conversations and ${matches.length} named contact match${matches.length === 1 ? "" : "es"} with strategic relevance.`
      : "The files were received, but no reviewable connection rows were parsed yet. Try adding the Connections.csv from the LinkedIn archive or paste rows with name, company, title, URL, and notes.",
    sourceInventory,
    laneValidations,
    contextPools,
    reconnectCandidates: reconnectCandidates.map(renderReconnectCandidate),
    reconnectQuestions: reconnectCandidates.flatMap(renderReconnectQuestions).slice(0, 10),
    topPaths: matches.slice(0, 6).map((match) => `${match.contact.name} at ${match.contact.company || "unknown company"}: ${renderMatchSummary(match)}.`),
    employerOverlaps,
    adjacentNetworkSignals: adjacentSignals,
    weeklyMoves: [
      idealWorkProfile?.targetRoles || idealWorkProfile?.idealWorkplace
        ? "Review whether each warm path supports the ideal work profile before using it for outreach."
        : "",
      ...laneValidations
        .filter((lane) => lane.status !== "needs_research")
        .slice(0, 2)
        .map((lane) => `${lane.lane}: ${lane.recommendedValidationAsk}`),
      ...matches.slice(0, 3).map((match) => `${match.contact.name}: ${match.recommendedFirstAsk}`),
    ].filter(Boolean).slice(0, 5),
    followUpQuestions: [
      "Which parts of the ideal work profile are hard requirements, and which are stretch preferences?",
      "Should geography be local-only, regional, remote-first, national, or open until compensation and role fit are proven?",
      "Which of these lane validations feel worth testing before building resume variants or applying heavily?",
      "Which of these contacts are people you would feel comfortable reconnecting with this month?",
      "Are any of the high-scoring contacts too cold, sensitive, or inappropriate for outreach?",
      "Which schools, bootcamps, prior employers, or communities should remain context pools until tied to named people?",
      "Which target employers should this network map compare against next?",
    ],
    confidenceNotes: [
      "This pass uses user-supplied files and notes only; it does not scrape LinkedIn.",
      "Warmth alone is not enough for a recommendation; named contacts need lane, employer, or role relevance.",
      "Local anchors are not automatically good targets; compensation, seniority, culture, and remote/hybrid fit should be checked before prioritizing them.",
      "Groups such as Rotary, BNI, alumni communities, and chambers are treated as context pools unless tied to a named person.",
      "Company/title matches are directional until the user reviews relationship strength and current accuracy.",
      "Referral asks should come after relationship review; many contacts are better first used for market reads or reconnection.",
      "Saved removals, deceased-contact notes, and current-involvement notes suppress inappropriate reconnection recommendations.",
    ],
    relationshipCoaching,
    contactMatches: matches,
  };
}

function scoreContact(
  contact: NetworkContact,
  context: {
    intake: Partial<IntakeForm> | null;
    latestAnalysis: Partial<AdvisorAnalysis> | null;
    employers: EmployerContext[];
    careerLanes: string[];
    idealWorkProfile?: IdealWorkProfile;
  },
): NetworkContactMatch {
  const contactText = normalizeText([contact.company, contact.title, contact.notes].join(" "));
  const employerText = normalizeText([contact.company, contact.title].join(" "));
  const noteText = normalizeText(contact.notes);
  const profileText = normalizeText([
    context.intake?.target_title,
    context.intake?.preferred_industries,
    context.intake?.geographic_preferences,
    context.intake?.public_evidence,
    context.latestAnalysis?.summary,
    context.latestAnalysis?.positioning?.join(" "),
    context.latestAnalysis?.explorationAreas?.map((area) => `${area.area} ${area.firstExperiment}`).join(" "),
    context.idealWorkProfile?.targetRoles,
    context.idealWorkProfile?.idealWorkplace,
    context.idealWorkProfile?.stretchGoals,
    context.idealWorkProfile?.dealbreakers,
    context.idealWorkProfile?.workModel,
    context.idealWorkProfile?.geographyScope,
  ].filter(Boolean).join(" "));
  const laneMatches = matchContactToLanes(contactText, context.careerLanes);
  const reasons: string[] = [];
  let score = 18;

  const employer = context.employers.find((item) => {
    const employerName = normalizeText(item.name);
    return employerName && (employerText.includes(employerName) || employerName.includes(normalizeText(contact.company)));
  });
  if (employer) {
    score += 34;
    reasons.push(`Company/title appears to overlap with saved target employer ${employer.name}`);
  } else {
    const mentionedEmployer = context.employers.find((item) => {
      const employerName = normalizeText(item.name);
      return employerName && noteText.includes(employerName);
    });
    if (mentionedEmployer) {
      score += 8;
      reasons.push(`Notes mention ${mentionedEmployer.name}, but this is not treated as employment overlap until confirmed`);
    }
  }

  if (laneMatches.length) {
    score += Math.min(30, laneMatches.length * 15);
    reasons.push(`Lane validation signal: ${laneMatches.slice(0, 3).join(", ")}`);
  }

  const idealWorkText = normalizeText([
    context.idealWorkProfile?.targetRoles,
    context.idealWorkProfile?.idealWorkplace,
    context.idealWorkProfile?.stretchGoals,
  ].filter(Boolean).join(" "));
  const idealHits = idealWorkText
    ? ["remote", "hybrid", "senior", "management", "strategy", "product", "operations", "ai", "automation", "enablement", "customer", "education", "healthcare", "workforce", "technology"]
        .filter((term) => contactText.includes(term) && idealWorkText.includes(term))
    : [];
  if (idealHits.length) {
    score += Math.min(18, idealHits.length * 6);
    reasons.push(`Ideal-work overlap: ${idealHits.slice(0, 3).join(", ")}`);
  }

  const roleTerms = ["product", "program", "operations", "communications", "marketing", "healthcare", "education", "technology", "it", "data", "research", "community", "customer", "success", "ai"];
  const hits = roleTerms.filter((term) => contactText.includes(term) && profileText.includes(term));
  if (hits.length) {
    score += Math.min(22, hits.length * 6);
    reasons.push(`Role/industry overlap: ${hits.slice(0, 4).join(", ")}`);
  }

  if (contact.profileUrl) {
    score += 5;
    reasons.push("Has a profile URL for user review");
  }
  if (contact.email) score += 4;
  if (contact.connectedOn) score += 5;
  const relationshipContext = extractRelationshipContext(contact.notes);
  if (/(alumni|classmate|coworker|worked|contractor|friend|mentor|school|teacher|partner|bootcamp|former|birthday|invited|wife|spouse|reconnected|discussing|best coder|top coder|bni)/i.test(contact.notes)) {
    score += 8;
    reasons.push("User notes suggest warm context, but warmth is supporting evidence rather than a standalone recommendation");
  }
  if (/(reconnected|discussing|invited|birthday|partner|hired|worked with|contractor|best coder|top coder)/i.test(contact.notes)) {
    score += 6;
    reasons.push("Relationship context suggests a stronger-than-ordinary reconnection path");
  }
  if (/(web developer|tv executive|world 2 systems|zapdot|guiding good|lyndon institute|codex|ai tools)/i.test(contact.notes)) {
    score += 6;
    reasons.push("Notes identify a specific shared work story or conversation angle");
  }
  if (/\bbni\b|business networking international/i.test(contact.notes)) {
    reasons.push("BNI is treated as a context pool unless tied to a named person, company, and lane");
  }
  if (/\brotary\b|rotarian/i.test(contact.notes)) {
    reasons.push("Rotary is treated as civic/community context unless tied to a named person, company, and lane");
  }

  if (!reasons.length && contact.company) reasons.push("Company can be checked against future employer targets");
  if (!reasons.length && contact.title) reasons.push("Title may be useful for a market-read conversation");

  const boundedScore = Math.max(20, Math.min(98, score));
  const firstAsk = buildFirstAsk(contact, employer?.name, hits, laneMatches);
  return {
    contact,
    score: boundedScore,
    confidence: boundedScore >= 70 ? "high" : boundedScore >= 50 ? "medium" : "low",
    laneMatches,
    matchReasons: reasons,
    recommendedFirstAsk: firstAsk,
    outreachStory: employer
      ? `Reconnect around their perspective on ${employer.name} or similar ${employer.category ?? "employers"} before asking about roles.`
      : laneMatches.length
        ? `Ask for a market read on the ${laneMatches[0]} lane and what titles, expectations, or employers are worth understanding.`
      : hits.length
        ? `Ask for a market read on ${hits.slice(0, 2).join(" / ")} roles or organizations.`
        : "Use this as a light reconnection or context-gathering path before making any career ask.",
    relationshipContext,
    clarifyingQuestions: buildClarifyingQuestions(contact, employer?.name, hits),
  };
}

function buildFirstAsk(contact: NetworkContact, employerName: string | undefined, hits: string[], laneMatches: string[]) {
  if (employerName) {
    return `Ask for a brief perspective on ${employerName} and what kinds of roles or teams are worth understanding there.`;
  }
  if (laneMatches.length) {
    return `Ask for a 15-minute market read on the ${laneMatches[0]} lane before discussing referrals or applications.`;
  }
  if (hits.length) {
    return `Ask for a 15-minute market read on ${hits.slice(0, 2).join(" / ")} work before mentioning applications.`;
  }
  if (contact.notes) {
    return "Reconnect using the relationship context in your notes, then ask one low-pressure career-context question.";
  }
  return "Review the relationship first; if appropriate, start with a short reconnection rather than a referral ask.";
}

function hasStrategicSignal(match: NetworkContactMatch) {
  return match.matchReasons.some((reason) =>
    reason.startsWith("Company/title appears")
    || reason.startsWith("Lane validation signal")
    || reason.startsWith("Role/industry overlap")
    || reason.startsWith("Ideal-work overlap"),
  );
}

function buildSourceInventory(contacts: NetworkContact[], files: NetworkImportSummary[], employers: EmployerContext[], idealWorkProfile?: IdealWorkProfile) {
  const parsedFiles = files.filter((file) => file.status === "parsed");
  const totalRows = files.reduce((sum, file) => sum + (file.rowCount || 0), 0);
  const companies = [...new Set(contacts.map((contact) => contact.company).filter(Boolean))];
  const formerCoworkerCount = contacts.filter((contact) => /former|coworker|worked with|colleague/i.test(contact.notes)).length;
  const messageRows = files
    .filter((file) => /message|conversation|inmail/i.test(file.fileName))
    .reduce((sum, file) => sum + (file.rowCount || 0), 0);
  const xlsxFiles = files.filter((file) => file.kind === "xlsx").length;
  const csvFiles = files.filter((file) => file.kind === "csv").length;

  return [
    `Saw ${files.length} supplied file record${files.length === 1 ? "" : "s"} and parsed ${parsedFiles.length} source${parsedFiles.length === 1 ? "" : "s"}.`,
    `Read ${totalRows} tabular row${totalRows === 1 ? "" : "s"} across CSV/XLSX/TXT sources.`,
    `Normalized ${contacts.length} reviewable contact${contacts.length === 1 ? "" : "s"} from the supplied data.`,
    `Detected ${companies.length} distinct compan${companies.length === 1 ? "y" : "ies"} or organizations from contact rows.`,
    `Compared contacts against ${employers.length} saved employer target${employers.length === 1 ? "" : "s"}.`,
    formerCoworkerCount ? `Found ${formerCoworkerCount} contact${formerCoworkerCount === 1 ? "" : "s"} with former-coworker or worked-with context in notes.` : "",
    messageRows ? `Saw ${messageRows} message/conversation row${messageRows === 1 ? "" : "s"} as source context; message content is not yet deeply analyzed.` : "",
    xlsxFiles || csvFiles ? `Parsed ${xlsxFiles} Excel workbook entr${xlsxFiles === 1 ? "y" : "ies"} and ${csvFiles} CSV entr${csvFiles === 1 ? "y" : "ies"}.` : "",
    idealWorkProfile?.targetRoles || idealWorkProfile?.idealWorkplace || idealWorkProfile?.compensationFloor
      ? "Captured an ideal work profile before analysis so contacts can be filtered through role fit, compensation, work model, geography, stretch goals, and dealbreakers."
      : "",
  ].filter(Boolean);
}

function isSelfContact(contact: NetworkContact, intake: Partial<IntakeForm> | null) {
  const contactName = normalizeText(contact.name);
  const intakeName = normalizeText(intake?.full_name ?? "");
  const intakeEmail = normalizeText(intake?.email ?? "");
  const contactEmail = normalizeText(contact.email);
  return Boolean(
    (intakeName && contactName === intakeName)
    || (intakeEmail && contactEmail && contactEmail === intakeEmail),
  );
}

function renderMatchSummary(match: NetworkContactMatch) {
  const strategicReasons = match.matchReasons.filter((reason) =>
    reason.startsWith("Company/title appears")
    || reason.startsWith("Lane validation signal")
    || reason.startsWith("Role/industry overlap")
    || reason.startsWith("Ideal-work overlap"),
  );
  return (strategicReasons.length ? strategicReasons : match.matchReasons).slice(0, 2).join("; ");
}

function deriveCareerLanes(intake: Partial<IntakeForm> | null, latestAnalysis: Partial<AdvisorAnalysis> | null, idealWorkProfile?: IdealWorkProfile) {
  const lanes = [
    idealWorkProfile?.targetRoles,
    intake?.target_title,
    ...(latestAnalysis?.roleBriefs?.map((brief) => brief.role) ?? []),
    ...(latestAnalysis?.explorationAreas?.map((area) => area.area) ?? []),
  ]
    .filter(Boolean)
    .map((lane) => String(lane).trim())
    .filter((lane) => lane.length > 2);

  return [...new Set(lanes)].slice(0, 6).length
    ? [...new Set(lanes)].slice(0, 6)
    : [
        "AI Operations Strategist",
        "Product Enablement Lead",
        "Career Technology Program Manager",
      ];
}

function matchContactToLanes(contactText: string, lanes: string[]) {
  return lanes.filter((lane) => {
    const terms = laneTerms(lane);
    const hits = terms.filter((term) => contactText.includes(term));
    return hits.length >= Math.min(2, terms.length);
  });
}

function laneTerms(lane: string) {
  const normalized = normalizeText(lane);
  const terms = normalized.split(/\s+/).filter((term) => term.length > 2);
  const expanded = new Set(terms);
  if (normalized.includes("ai") || normalized.includes("automation")) {
    ["ai", "automation", "workflow", "operations", "technical", "technology"].forEach((term) => expanded.add(term));
  }
  if (normalized.includes("product") || normalized.includes("enablement")) {
    ["product", "enablement", "adoption", "training", "customer", "success"].forEach((term) => expanded.add(term));
  }
  if (normalized.includes("career") || normalized.includes("workforce") || normalized.includes("education")) {
    ["career", "workforce", "education", "program", "community", "training"].forEach((term) => expanded.add(term));
  }
  if (normalized.includes("research") || normalized.includes("market")) {
    ["research", "market", "data", "analysis", "strategy"].forEach((term) => expanded.add(term));
  }
  if (normalized.includes("operations") || normalized.includes("program")) {
    ["operations", "program", "project", "strategy", "systems"].forEach((term) => expanded.add(term));
  }
  return [...expanded].slice(0, 12);
}

function buildLaneValidations(lanes: string[], matches: NetworkContactMatch[]): CareerLaneValidation[] {
  return lanes.map((lane) => {
    const laneMatches = matches.filter((match) => match.laneMatches.includes(lane));
    const namedPeople = laneMatches.slice(0, 5).map((match) => `${match.contact.name}${match.contact.company ? ` (${match.contact.company})` : ""}`);
    const signals = [
      ...laneMatches.flatMap((match) => match.matchReasons.filter((reason) => reason.startsWith("Lane validation") || reason.startsWith("Role/industry") || reason.startsWith("Company/title"))),
    ];
    const score = Math.min(100, laneMatches.reduce((sum, match) => sum + Math.max(10, Math.round(match.score / 4)), 0));
    const status: CareerLaneValidation["status"] = score >= 55 && namedPeople.length >= 2
      ? "validated"
      : score >= 25 && namedPeople.length >= 1
        ? "promising"
        : "needs_research";

    return {
      lane,
      status,
      score,
      namedPeople,
      signals: [...new Set(signals)].slice(0, 5),
      recommendedValidationAsk: namedPeople.length
        ? `Ask ${namedPeople[0]} for a market read on whether ${lane} is a real, reachable direction and which titles or employers to study.`
        : `Add named contacts, alumni leads, or employer targets related to ${lane} before treating this as outreach-ready.`,
      missingEvidence: [
        namedPeople.length ? "" : "No named contact currently validates this lane.",
        signals.length ? "" : "No strong company/title/industry signal appears in the imported data yet.",
        "Confirm whether this lane deserves resume positioning before generating targeted variants.",
      ].filter(Boolean),
    };
  });
}

function buildContextPools(contacts: NetworkContact[], matches: NetworkContactMatch[], feedback: NetworkFeedback[]): ContextPoolSignal[] {
  const activeNames = new Set(matches.map((match) => normalizeText(match.contact.name)));
  const pools = [
    {
      label: "BNI",
      type: "group" as const,
      pattern: /\bbni\b|business networking international/i,
      reason: "Small-business and referral-network context; useful only when tied to named people, companies, or lane-specific market questions.",
    },
    {
      label: "Rotary",
      type: "community" as const,
      pattern: /\brotary\b|rotarian/i,
      reason: "Civic/community context; potentially useful for local employer intelligence when tied to a named person and current role.",
    },
    {
      label: "Alumni networks",
      type: "alumni" as const,
      pattern: /\balumni\b|dartmouth|college|university|school/i,
      reason: "Warm-context pool for market reads and introductions, not automatic referral permission.",
    },
    {
      label: "Former coworkers",
      type: "former_employer" as const,
      pattern: /former|coworker|worked with|colleague/i,
      reason: "Relationship-strength signal that still needs lane, employer, or role relevance before becoming an outreach recommendation.",
    },
  ];

  return pools.map((pool) => {
    const namedPeople = contacts
      .filter((contact) => isSpecificPerson(contact))
      .filter((contact) => !isExcludedByFeedback(contact, feedback))
      .filter((contact) => pool.pattern.test([contact.company, contact.title, contact.notes, contact.source].join(" ")))
      .filter((contact) => !activeNames.has(normalizeText(contact.name)))
      .map((contact) => `${contact.name}${contact.company ? ` (${contact.company})` : ""}`)
      .slice(0, 5);

    return {
      label: pool.label,
      type: pool.type,
      reason: pool.reason,
      namedPeople,
      nextStep: namedPeople.length
        ? `Review these named people for lane relevance before recommending outreach: ${namedPeople.slice(0, 3).join(", ")}.`
        : "Keep this as context only until the user supplies named people with company, title, and relationship notes.",
    };
  }).filter((pool) => pool.namedPeople.length);
}

function buildEmployerOverlaps(matches: NetworkContactMatch[]) {
  const overlaps = matches
    .filter((match) => match.matchReasons.some((reason) => reason.includes("Company/title appears to overlap")))
    .map((match) => `${match.contact.company}: ${match.contact.name} (${match.contact.title || "title unknown"})`);
  return [...new Set(overlaps)].slice(0, 10);
}

function buildAdjacentSignals(matches: NetworkContactMatch[]) {
  const signals = matches
    .filter((match) => match.matchReasons.some((reason) => reason.includes("Role/industry overlap") || reason.includes("Ideal-work overlap")))
    .map((match) => `${match.contact.name}: ${match.matchReasons.find((reason) => reason.includes("Role/industry overlap") || reason.includes("Ideal-work overlap"))}`);
  return [...new Set(signals)].slice(0, 10);
}

function buildRelationshipCoaching(matches: NetworkContactMatch[], contextPools: ContextPoolSignal[], idealWorkProfile?: IdealWorkProfile) {
  const hasLocalAnchorCluster = matches.some((match) => /dartmouth|upper valley|hanover|lebanon/i.test([match.contact.company, match.contact.title, match.contact.notes].join(" ")))
    || contextPools.some((pool) => /dartmouth|alumni/i.test([pool.label, pool.reason, pool.namedPeople.join(" ")].join(" ")));
  const hasIdealFilter = Boolean(
    idealWorkProfile?.targetRoles
    || idealWorkProfile?.compensationFloor
    || idealWorkProfile?.workModel
    || idealWorkProfile?.geographyScope
    || idealWorkProfile?.idealWorkplace,
  );

  return [
    hasIdealFilter
      ? "Sort the list against the ideal work profile first: use contacts who can answer role, compensation, work-model, culture, or seniority questions before chasing referrals."
      : "Before using this list, define the ideal role, pay floor, work model, geography scope, and dealbreakers so warm contacts do not pull the search off strategy.",
    "Start with market reads: ask for perspective on titles, pay bands, teams, hiring reality, work model, and proof points before asking anyone for an introduction.",
    "Assign each person an intent before outreach: market read, reconnection, employer context, role translation, introduction later, referral later, or park.",
    "Group people into three buckets: use now for a low-pressure conversation, research later because the fit is unclear, and park because warmth exists but strategy does not.",
    "Limit each weekly batch to three to five people. Review relationship warmth, sensitivity, and the specific question before sending anything.",
    hasLocalAnchorCluster
      ? "If the list is Dartmouth-heavy, treat that as a real network-density signal, not a mandate. Use Dartmouth-affiliated contacts to learn about local hiring, compensation ceilings, and adjacent paths; prioritize Dartmouth roles only when pay, scope, and work model are credible."
      : "If many contacts cluster around one familiar employer or community, use the cluster for labor-market intelligence but keep searching for better-fit remote, regional, or national paths.",
    "After each conversation, record what changed: confirmed lane, rejected lane, salary evidence, remote/hybrid evidence, new employer lead, suggested person, or asset gap.",
  ];
}

function renderReconnectCandidate(match: NetworkContactMatch) {
  const context = match.relationshipContext.length
    ? ` Context: ${match.relationshipContext.slice(0, 2).join(" ")}`
    : "";
  return `${match.contact.name}: ${match.recommendedFirstAsk}${context}`;
}

function renderReconnectQuestions(match: NetworkContactMatch) {
  return match.clarifyingQuestions.map((question) => `${match.contact.name}: ${question}`);
}

function buildClarifyingQuestions(contact: NetworkContact, employerName: string | undefined, hits: string[]) {
  const questions = [
    `How warm is this relationship today: active, friendly-but-dormant, distant, or sensitive?`,
    `What version of your work does ${contact.name} know best?`,
  ];
  if (employerName) {
    questions.push(`Does ${contact.name} actually work at ${employerName}, or is that only adjacent context?`);
  } else if (hits.length) {
    questions.push(`Would ${contact.name} be better for a market-read conversation about ${hits.slice(0, 2).join(" / ")} or for a specific introduction?`);
  } else if (/\bbni\b|business networking international/i.test(contact.notes)) {
    questions.push("Is this person a small-business/entrepreneur lead, a client-history lead, or a path to someone inside a target employer?");
  } else if (/\brotary\b|rotarian/i.test(contact.notes)) {
    questions.push("What organization or civic role makes this Rotarian worth reconnecting with?");
  } else {
    questions.push("What is the respectful first topic for reconnecting?");
  }
  return questions.slice(0, 3);
}

async function tryBuildAiNetworkAnalysis({
  contacts,
  files,
  intake,
  latestAnalysis,
  employers,
  feedback,
  idealWorkProfile,
  conversationNotes = [],
  deterministic,
  openAiKey,
}: {
  contacts: NetworkContact[];
  files: NetworkImportSummary[];
  intake: Partial<IntakeForm> | null;
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  employers: EmployerContext[];
  feedback: NetworkFeedback[];
  idealWorkProfile?: IdealWorkProfile;
  conversationNotes?: string[];
  deterministic: NetworkAnalysis;
  openAiKey: string;
}): Promise<NetworkAnalysis | null> {
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
            "You are a rigorous career coach analyzing user-supplied networking data. Do not scrape or imply access to private LinkedIn. First interpret the user's LinkedIn/profile data and contacts through the supplied ideal work profile: target roles, compensation floor, remote/hybrid/geography preferences, workplace traits, stretch goals, and dealbreakers. Validate career lanes before recommending outreach: test the user's role hypotheses against named people, companies, titles, relationship notes, saved employers, ideal-work fit, and market-read potential. Geography is a user-selected constraint, not a default cage; local anchor employers should not be prioritized unless compensation, seniority, work model, and culture fit are plausible. Pick specific named living people only when they have lane, employer, role, or ideal-work relevance; warmth alone is not enough. Never recommend the user themself as a contact. Never pick organizations, clubs, chapters, or generic channels such as BNI, Rotary, alumni groups, or chambers as contacts. If feedback says remove, deceased, or current involvement, do not recommend that contact or organization. Treat BNI as primarily small-business/referral-network context, not automatic access to large employers. Treat Rotary as civic/community context that may include larger-business members, but still require named-person evidence. Prior coworkers are relationship-strength signals, not automatically strategic matches. Only claim employer overlap when the contact's company/title supports it; if an employer appears only in notes, ask a clarifying question. Avoid spammy referral advice. Prefer market-read and lane-validation asks before referral asks. Name uncertainty and ask relationship-strength questions. loopBackConversationNotes contain the user's own reports of past advisor/market-read conversations: treat them as first-hand market evidence that can confirm or weaken lanes, employers, pay bands, and contacts, and update recommendations accordingly instead of repeating advice those conversations already answered.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a network intelligence analysis from user-supplied LinkedIn/contact data.",
            files,
            contacts,
            intake,
            latestAnalysis,
            employers,
            feedback,
            idealWorkProfile,
            loopBackConversationNotes: conversationNotes,
            deterministicContactMatches: deterministic.contactMatches.slice(0, 20),
            deterministicLaneValidations: deterministic.laneValidations,
            deterministicContextPools: deterministic.contextPools,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "network_intelligence_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "sourceInventory", "laneValidations", "contextPools", "reconnectCandidates", "reconnectQuestions", "topPaths", "employerOverlaps", "adjacentNetworkSignals", "weeklyMoves", "followUpQuestions", "confidenceNotes", "relationshipCoaching"],
            properties: {
              summary: { type: "string" },
              sourceInventory: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
              laneValidations: {
                type: "array",
                minItems: 0,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["lane", "status", "score", "namedPeople", "signals", "recommendedValidationAsk", "missingEvidence"],
                  properties: {
                    lane: { type: "string" },
                    status: { type: "string", enum: ["validated", "promising", "needs_research"] },
                    score: { type: "number" },
                    namedPeople: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 5 },
                    signals: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 5 },
                    recommendedValidationAsk: { type: "string" },
                    missingEvidence: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 4 },
                  },
                },
              },
              contextPools: {
                type: "array",
                minItems: 0,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "type", "reason", "namedPeople", "nextStep"],
                  properties: {
                    label: { type: "string" },
                    type: { type: "string", enum: ["community", "alumni", "former_employer", "group", "other"] },
                    reason: { type: "string" },
                    namedPeople: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 5 },
                    nextStep: { type: "string" },
                  },
                },
              },
              reconnectCandidates: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 5 },
              reconnectQuestions: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 10 },
              topPaths: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 8 },
              employerOverlaps: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 10 },
              adjacentNetworkSignals: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 10 },
              weeklyMoves: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 8 },
              followUpQuestions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
              confidenceNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
              relationshipCoaching: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
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
    const parsed = JSON.parse(text) as Omit<NetworkAnalysis, "mode" | "contactMatches">;
    return {
      mode: "ai",
      ...parsed,
      contactMatches: deterministic.contactMatches,
    };
  } catch {
    return null;
  }
}

export function readZipEntries(bytes: Buffer, includePattern = /\.(csv|txt|xlsx)$/i) {
  const centralEntries = readZipEntriesFromCentralDirectory(bytes, includePattern);
  if (centralEntries.length) return centralEntries;

  const entries: Array<{ name: string; text: string; bytes: Buffer }> = [];
  let offset = 0;
  while (offset < bytes.length - 30 && entries.length < MAX_ZIP_ENTRIES) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length || !includePattern.test(name)) {
      offset = Math.max(offset + 30, dataEnd);
      continue;
    }

    try {
      const content = inflateZipEntry(bytes.subarray(dataStart, dataEnd), method);
      if (content) {
        entries.push({ name, text: content.toString("utf8"), bytes: Buffer.from(content) });
      }
    } catch {
      // Keep reading later entries; one bad ZIP entry should not block the import.
    }
    offset = dataEnd;
  }
  return entries;
}

// Decompress a single ZIP entry with the output ceiling enforced DURING
// inflation (maxOutputLength aborts mid-stream), so a zip bomb cannot
// balloon in memory before any size check runs. The header's declared
// uncompressed size is attacker-controlled and deliberately ignored.
function inflateZipEntry(compressed: Buffer, method: number): Buffer | null {
  if (method === 0) {
    return compressed.length <= MAX_ZIP_ENTRY_BYTES ? compressed : null;
  }
  if (method !== 8) return null;
  return inflateRawSync(compressed, { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
}

function readZipEntriesFromCentralDirectory(bytes: Buffer, includePattern = /\.(csv|txt|xlsx)$/i) {
  const entries: Array<{ name: string; text: string; bytes: Buffer }> = [];
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) return entries;

  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd && offset < bytes.length - 46 && entries.length < MAX_ZIP_ENTRIES) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;

    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (includePattern.test(name) && bytes.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;

      try {
        const content = inflateZipEntry(bytes.subarray(dataStart, dataEnd), method);
        if (content) {
          entries.push({ name, text: content.toString("utf8"), bytes: Buffer.from(content) });
        }
      } catch {
        // Keep reading later entries; one bad ZIP entry should not block the import.
      }
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(bytes: Buffer) {
  const minOffset = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseCsvLine(line: string) {
  return parseCsv(line)[0] ?? [line];
}

function parseSharedStrings(xml: string) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const textParts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => decodeXml(textMatch[1]));
    return textParts.join("");
  });
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
      const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const inlineValue = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      const value = type === "s"
        ? sharedStrings[Number(rawValue)] ?? ""
        : type === "inlineStr"
          ? decodeXml(inlineValue)
          : decodeXml(rawValue);
      cells[index] = value.trim();
    }
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function columnIndex(ref: string) {
  return ref.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function csvEscape(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function dedupeContacts(contacts: NetworkContact[]) {
  const seen = new Set<string>();
  const deduped: NetworkContact[] = [];
  for (const contact of contacts) {
    const key = normalizeText([contact.name, contact.company, contact.profileUrl, contact.email].join("|"));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(contact);
  }
  return deduped;
}

function isSpecificPerson(contact: NetworkContact) {
  const nameParts = contact.name.split(/\s+/).filter((part) => part.length > 1);
  const genericNames = /^(bni|rotary|rotarians|dartmouth health|linkedin|connections|alumni|network|unknown)$/i;
  const genericPattern = /\b(bni|business networking international|rotary|rotarians|club|chapter|network|connections|alumni)\b/i;
  return nameParts.length >= 2 && !genericNames.test(contact.name.trim()) && !genericPattern.test(contact.name);
}

function isExcludedByFeedback(contact: NetworkContact, feedback: NetworkFeedback[]) {
  const contactName = normalizeText(contact.name);
  const contactCompany = normalizeText(contact.company);
  return feedback.some((item) => {
    if (!["remove", "deceased", "current_involvement", "no_memory", "retired", "ethical_concern"].includes(item.feedbackType)) return false;
    const feedbackName = normalizeText(item.contactName);
    if (!feedbackName) return false;
    return contactName.includes(feedbackName) || feedbackName.includes(contactName) || (contactCompany && feedbackName.includes(contactCompany));
  });
}

function enrichContactsWithNarrativeNotes(contacts: NetworkContact[], hints: string[]) {
  if (!hints.length) return contacts;

  return contacts.map((contact) => {
    const contactNames = contact.name.toLowerCase().split(/\s+/).filter((part) => part.length > 2);
    const matchingHints = hints.filter((hint) => {
      const normalizedHint = hint.toLowerCase();
      const fullName = contact.name.toLowerCase();
      return (
        (fullName && normalizedHint.includes(fullName)) ||
        contactNames.some((name) => normalizedHint.includes(name)) ||
        (contact.company && normalizedHint.includes(contact.company.toLowerCase()))
      );
    });

    if (!matchingHints.length) return contact;
    return cleanContact({
      ...contact,
      notes: [contact.notes, ...matchingHints].filter(Boolean).join(" | "),
    });
  });
}

function parseRelationshipHints(notes: string) {
  if (!notes) return [];
  return notes
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((hint) => hint.trim())
    .filter((hint) => hint.length > 20)
    .slice(0, 80);
}

function extractRelationshipContext(notes: string) {
  return notes
    .split(/\s+\|\s+|(?<=[.!?])\s+/)
    .map((hint) => hint.trim())
    .filter((hint) => /(reconnected|discussing|invited|birthday|partner|hired|worked|contractor|web developer|tv executive|world 2 systems|zapdot|guiding good|lyndon institute|codex|ai tools|bni|wife|teacher|best coder|top coder)/i.test(hint))
    .slice(0, 4);
}

function cleanContact(contact: NetworkContact): NetworkContact {
  return {
    name: contact.name.replace(/\s+/g, " ").trim(),
    company: contact.company.replace(/\s+/g, " ").trim(),
    title: contact.title.replace(/\s+/g, " ").trim(),
    profileUrl: contact.profileUrl.trim(),
    email: contact.email.trim(),
    connectedOn: contact.connectedOn.trim(),
    source: contact.source.trim(),
    notes: contact.notes.replace(/\s+/g, " ").trim(),
  };
}

function isUsefulContact(contact: NetworkContact) {
  return Boolean(contact.name && (contact.company || contact.title || contact.profileUrl || contact.email || contact.notes));
}

function pick(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (record[key]) return record[key];
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+.#\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getAllText(form: FormData, key: string) {
  return form
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
}

function parseIdealWorkProfile(form: FormData): IdealWorkProfile {
  return {
    targetRoles: getText(form, "ideal_target_roles"),
    compensationFloor: getText(form, "ideal_compensation_floor"),
    workModel: getText(form, "ideal_work_model"),
    geographyScope: getText(form, "ideal_geography_scope"),
    idealWorkplace: getText(form, "ideal_workplace"),
    stretchGoals: getText(form, "ideal_stretch_goals"),
    dealbreakers: getText(form, "ideal_dealbreakers"),
    localAnchorNotes: getText(form, "ideal_local_anchor_notes"),
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
