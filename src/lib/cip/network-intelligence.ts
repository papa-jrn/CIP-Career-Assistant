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

export interface NetworkImportSummary {
  fileName: string;
  kind: "zip" | "csv" | "txt" | "pdf" | "unsupported";
  status: "parsed" | "recorded" | "skipped";
  detail: string;
  contactCount: number;
}

export interface NetworkContactMatch {
  contact: NetworkContact;
  score: number;
  confidence: "high" | "medium" | "low";
  matchReasons: string[];
  recommendedFirstAsk: string;
  outreachStory: string;
  relationshipContext: string[];
  clarifyingQuestions: string[];
}

export interface NetworkAnalysis {
  mode: "ai" | "deterministic";
  summary: string;
  reconnectCandidates: string[];
  reconnectQuestions: string[];
  topPaths: string[];
  employerOverlaps: string[];
  adjacentNetworkSignals: string[];
  weeklyMoves: string[];
  followUpQuestions: string[];
  confidenceNotes: string[];
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
  feedbackType: "remove" | "deceased" | "current_involvement" | "context";
  note: string;
}

export async function parseNetworkImport(form: FormData) {
  const contacts: NetworkContact[] = [];
  const files: NetworkImportSummary[] = [];
  const notes = getText(form, "relationship_notes");
  const feedbackNotes = getText(form, "network_feedback");
  const noteHints = parseRelationshipHints([notes, feedbackNotes].filter(Boolean).join("\n"));

  for (const value of form.getAll("network_files")) {
    if (!(value instanceof File) || !value.name) continue;
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
    });
  }

  const enrichedContacts = enrichContactsWithNarrativeNotes(dedupeContacts(contacts), noteHints);

  return {
    contacts: enrichedContacts.slice(0, 500),
    files,
    notes,
    feedbackNotes,
    noteHints,
  };
}

export async function buildNetworkAnalysis({
  contacts,
  files,
  intake,
  latestAnalysis,
  employers,
  feedback = [],
}: {
  contacts: NetworkContact[];
  files: NetworkImportSummary[];
  intake: Partial<IntakeForm> | null;
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  employers: EmployerContext[];
  feedback?: NetworkFeedback[];
}): Promise<NetworkAnalysis> {
  const deterministic = buildDeterministicNetworkAnalysis({ contacts, files, intake, latestAnalysis, employers, feedback });
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!openAiKey) return deterministic;

  const ai = await tryBuildAiNetworkAnalysis({
    contacts: contacts.slice(0, 150),
    files,
    intake,
    latestAnalysis,
    employers: employers.slice(0, 80),
    feedback,
    deterministic,
    openAiKey,
  });

  return ai ?? deterministic;
}

async function parseNetworkFile(file: File) {
  const name = file.name;
  const lower = name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());

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
    }];

    for (const entry of entries) {
      const entryName = entry.name.toLowerCase();
      if (entryName.endsWith(".csv")) {
        const parsed = parseCsvContacts(entry.text, entry.name);
        contacts.push(...parsed);
        files.push({
          fileName: `${name} / ${entry.name}`,
          kind: "csv",
          status: parsed.length ? "parsed" : "recorded",
          detail: parsed.length ? "Parsed CSV contact rows from the archive." : "Read CSV but did not find LinkedIn-style contact rows.",
          contactCount: parsed.length,
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
    }],
  };
}

function parseCsvContacts(text: string, source: string): NetworkContact[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((cell) => normalizeHeader(cell));
  return rows.slice(1).map((row) => {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index]?.trim() ?? ""]));
    const firstName = pick(record, ["firstname", "firstname"]);
    const lastName = pick(record, ["lastname", "lastname"]);
    const fullName = pick(record, ["name", "fullname"]) || [firstName, lastName].filter(Boolean).join(" ");
    return cleanContact({
      name: fullName,
      company: pick(record, ["company", "companyname", "organization"]),
      title: pick(record, ["position", "title", "jobtitle", "occupation"]),
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

function buildDeterministicNetworkAnalysis({
  contacts,
  files,
  intake,
  latestAnalysis,
  employers,
  feedback,
}: {
  contacts: NetworkContact[];
  files: NetworkImportSummary[];
  intake: Partial<IntakeForm> | null;
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  employers: EmployerContext[];
  feedback: NetworkFeedback[];
}): NetworkAnalysis {
  const matches = contacts
    .filter((contact) => isSpecificPerson(contact))
    .filter((contact) => !isExcludedByFeedback(contact, feedback))
    .map((contact) => scoreContact(contact, { intake, latestAnalysis, employers }))
    .filter((match) => match.score >= 34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const employerOverlaps = buildEmployerOverlaps(matches);
  const adjacentSignals = buildAdjacentSignals(matches);
  const reconnectCandidates = matches.slice(0, 5);
  const contactCount = contacts.length;
  const parsedFiles = files.filter((file) => file.status === "parsed").length;

  return {
    mode: "deterministic",
    summary: contactCount
      ? `Imported ${contactCount} reviewable network contact${contactCount === 1 ? "" : "s"} from ${parsedFiles} parsed source${parsedFiles === 1 ? "" : "s"}. This first pass found ${matches.length} plausible warm-introduction or market-read path${matches.length === 1 ? "" : "s"} against saved employers, target-role language, and the latest career analysis.`
      : "The files were received, but no reviewable connection rows were parsed yet. Try adding the Connections.csv from the LinkedIn archive or paste rows with name, company, title, URL, and notes.",
    reconnectCandidates: reconnectCandidates.map(renderReconnectCandidate),
    reconnectQuestions: reconnectCandidates.flatMap(renderReconnectQuestions).slice(0, 10),
    topPaths: matches.slice(0, 6).map((match) => `${match.contact.name} at ${match.contact.company || "unknown company"}: ${match.matchReasons.slice(0, 2).join("; ")}.`),
    employerOverlaps,
    adjacentNetworkSignals: adjacentSignals,
    weeklyMoves: matches.slice(0, 5).map((match) => `${match.contact.name}: ${match.recommendedFirstAsk}`),
    followUpQuestions: [
      "Which of these contacts are people you would feel comfortable reconnecting with this month?",
      "Are any of the high-scoring contacts too cold, sensitive, or inappropriate for outreach?",
      "Which schools, bootcamps, prior employers, or communities should be treated as warm-context signals?",
      "Which target employers should this network map compare against next?",
    ],
    confidenceNotes: [
      "This pass uses user-supplied files and notes only; it does not scrape LinkedIn.",
      "Company/title matches are directional until the user reviews relationship strength and current accuracy.",
      "Referral asks should come after relationship review; many contacts are better first used for market reads or reconnection.",
      "Saved removals, deceased-contact notes, and current-involvement notes suppress inappropriate reconnection recommendations.",
    ],
    contactMatches: matches,
  };
}

function scoreContact(
  contact: NetworkContact,
  context: {
    intake: Partial<IntakeForm> | null;
    latestAnalysis: Partial<AdvisorAnalysis> | null;
    employers: EmployerContext[];
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
  ].filter(Boolean).join(" "));
  const reasons: string[] = [];
  let score = 20;

  const employer = context.employers.find((item) => {
    const employerName = normalizeText(item.name);
    return employerName && (employerText.includes(employerName) || employerName.includes(normalizeText(contact.company)));
  });
  if (employer) {
    score += 36;
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

  const roleTerms = ["product", "program", "operations", "communications", "marketing", "healthcare", "education", "technology", "it", "data", "research", "community", "customer", "success", "ai"];
  const hits = roleTerms.filter((term) => contactText.includes(term) && profileText.includes(term));
  if (hits.length) {
    score += Math.min(28, hits.length * 7);
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
    score += 18;
    reasons.push("User notes suggest warm context");
  }
  if (/(reconnected|discussing|invited|birthday|partner|hired|worked with|contractor|best coder|top coder)/i.test(contact.notes)) {
    score += 12;
    reasons.push("Relationship context suggests a stronger-than-ordinary reconnection path");
  }
  if (/(web developer|tv executive|world 2 systems|zapdot|guiding good|lyndon institute|codex|ai tools)/i.test(contact.notes)) {
    score += 10;
    reasons.push("Notes identify a specific shared work story or conversation angle");
  }
  if (/\bbni\b|business networking international/i.test(contact.notes)) {
    score += 4;
    reasons.push("BNI context suggests small-business or entrepreneur network value, not automatic large-employer access");
  }
  if (/\brotary\b|rotarian/i.test(contact.notes)) {
    score += 8;
    reasons.push("Rotary context may be useful for civic or larger-organization introductions when tied to a named person");
  }

  if (!reasons.length && contact.company) reasons.push("Company can be checked against future employer targets");
  if (!reasons.length && contact.title) reasons.push("Title may be useful for a market-read conversation");

  const boundedScore = Math.max(20, Math.min(98, score));
  const firstAsk = buildFirstAsk(contact, employer?.name, hits);
  return {
    contact,
    score: boundedScore,
    confidence: boundedScore >= 70 ? "high" : boundedScore >= 50 ? "medium" : "low",
    matchReasons: reasons,
    recommendedFirstAsk: firstAsk,
    outreachStory: employer
      ? `Reconnect around their perspective on ${employer.name} or similar ${employer.category ?? "employers"} before asking about roles.`
      : hits.length
        ? `Ask for a market read on ${hits.slice(0, 2).join(" / ")} roles or organizations.`
        : "Use this as a light reconnection or context-gathering path before making any career ask.",
    relationshipContext,
    clarifyingQuestions: buildClarifyingQuestions(contact, employer?.name, hits),
  };
}

function buildFirstAsk(contact: NetworkContact, employerName: string | undefined, hits: string[]) {
  if (employerName) {
    return `Ask for a brief perspective on ${employerName} and what kinds of roles or teams are worth understanding there.`;
  }
  if (hits.length) {
    return `Ask for a 15-minute market read on ${hits.slice(0, 2).join(" / ")} work before mentioning applications.`;
  }
  if (contact.notes) {
    return "Reconnect using the relationship context in your notes, then ask one low-pressure career-context question.";
  }
  return "Review the relationship first; if appropriate, start with a short reconnection rather than a referral ask.";
}

function buildEmployerOverlaps(matches: NetworkContactMatch[]) {
  const overlaps = matches
    .filter((match) => match.matchReasons.some((reason) => reason.includes("Company/title appears to overlap")))
    .map((match) => `${match.contact.company}: ${match.contact.name} (${match.contact.title || "title unknown"})`);
  return [...new Set(overlaps)].slice(0, 10);
}

function buildAdjacentSignals(matches: NetworkContactMatch[]) {
  const signals = matches
    .filter((match) => match.matchReasons.some((reason) => reason.includes("Role/industry overlap")))
    .map((match) => `${match.contact.name}: ${match.matchReasons.find((reason) => reason.includes("Role/industry overlap"))}`);
  return [...new Set(signals)].slice(0, 10);
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
  deterministic,
  openAiKey,
}: {
  contacts: NetworkContact[];
  files: NetworkImportSummary[];
  intake: Partial<IntakeForm> | null;
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  employers: EmployerContext[];
  feedback: NetworkFeedback[];
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
            "You are a rigorous career coach analyzing user-supplied networking data. Do not scrape or imply access to private LinkedIn. Pick five specific named living people from the supplied contacts as reconnection candidates; never pick organizations, clubs, chapters, or generic channels such as BNI, Rotary, alumni groups, or chambers. If feedback says remove, deceased, or current involvement, do not recommend that contact or organization. Treat BNI as primarily small-business/referral-network context, not automatic access to large employers. Treat Rotary as civic/community context that may include larger-business members, but still require named-person evidence. Only claim employer overlap when the contact's company/title supports it; if an employer appears only in notes, ask a clarifying question. Avoid spammy referral advice. Name uncertainty and ask relationship-strength questions.",
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
            deterministicContactMatches: deterministic.contactMatches.slice(0, 20),
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
            required: ["summary", "reconnectCandidates", "reconnectQuestions", "topPaths", "employerOverlaps", "adjacentNetworkSignals", "weeklyMoves", "followUpQuestions", "confidenceNotes"],
            properties: {
              summary: { type: "string" },
              reconnectCandidates: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
              reconnectQuestions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 },
              topPaths: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
              employerOverlaps: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 },
              adjacentNetworkSignals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 },
              weeklyMoves: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
              followUpQuestions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
              confidenceNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
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

function readZipEntries(bytes: Buffer) {
  const centralEntries = readZipEntriesFromCentralDirectory(bytes);
  if (centralEntries.length) return centralEntries;

  const entries: Array<{ name: string; text: string }> = [];
  let offset = 0;
  while (offset < bytes.length - 30) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length || !/\.(csv|txt)$/i.test(name)) {
      offset = Math.max(offset + 30, dataEnd);
      continue;
    }

    try {
      const compressed = bytes.subarray(dataStart, dataEnd);
      const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (content && content.length <= Math.max(uncompressedSize || 0, 5_000_000)) {
        entries.push({ name, text: content.toString("utf8") });
      }
    } catch {
      // Keep reading later entries; one bad ZIP entry should not block the import.
    }
    offset = dataEnd;
  }
  return entries.slice(0, 40);
}

function readZipEntriesFromCentralDirectory(bytes: Buffer) {
  const entries: Array<{ name: string; text: string }> = [];
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) return entries;

  const centralDirectorySize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let offset = centralDirectoryOffset;

  while (offset < centralDirectoryEnd && offset < bytes.length - 46) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) break;

    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (/\.(csv|txt)$/i.test(name) && bytes.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localNameLength = bytes.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;

      try {
        const compressed = bytes.subarray(dataStart, dataEnd);
        const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
        if (content && content.length <= Math.max(uncompressedSize || 0, 5_000_000)) {
          entries.push({ name, text: content.toString("utf8") });
        }
      } catch {
        // Keep reading later entries; one bad ZIP entry should not block the import.
      }
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries.slice(0, 40);
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
    if (!["remove", "deceased", "current_involvement"].includes(item.feedbackType)) return false;
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
