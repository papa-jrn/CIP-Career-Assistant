import { renderCompletedFit } from "@/lib/cip/fit-action-view";
import { loadSearchedFitJob } from "@/lib/cip/searched-job-fit";
import type { APIRoute } from "astro";
import { z } from "zod";
import {
  IMPORTED_JOB_FIT_SOURCE_TYPE,
  assessImportedJobFitWithAi,
  importedJobFitPayload,
  type FitAssessment,
} from "@/lib/cip/imported-job-fit";
import { IMPORTED_JOB_SOURCE_TYPE, parseImportedJob } from "@/lib/cip/imported-jobs";
import { setImportedArchive } from "@/lib/cip/job-archive";
import type { ProfileEvidence } from "@/lib/cip/job-fit-analysis";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { loadStoredSearchPreferences } from "@/lib/cip/search-preferences";
import { parseAnalysisAdvisor, parseIntakeSource } from "@/lib/cip/resume-asset-context";
import { parseConversationOutcome } from "@/lib/cip/conversation-outcomes";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const assessInput = z.object({
  importId: z.string().trim().min(1, "The job to assess was not identified.").max(80).optional(),
  observationId: z.string().uuid().optional(),
  inlineResult: z.literal("yes").optional(),
  clarification: z.string().trim().max(3000).optional(),
  /** Present when the user is correcting the app's conclusion. */
  recommendation: z.enum(["talk_first", "check_funding", "apply", "monitor", "skip"]).optional(),
  note: z.string().trim().max(1000).optional(),
  returnTo: z.string().trim().optional(),
}).refine(value => Boolean(value.importId) !== Boolean(value.observationId), "Identify exactly one saved job to assess.");

/**
 * Work out whether an imported job suits this user, or record their correction
 * of that conclusion (§7).
 *
 * Fit is produced independently of whether the listing is real: a live posting
 * can be a poor fit and an unverifiable one can be a good fit, and the app must
 * never let one stand in for the other.
 *
 * Every assessment is an additive record, so the app's reading and the user's
 * correction both survive and later analysis can learn from the difference
 * rather than only seeing the final answer.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return html("Storage is not configured. Nothing was assessed.", 503);
  }

  try {
    const db = createServer(cookies);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return html("Sign in before assessing a job.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That request is too large.", 413);
    const parsed = assessInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the request.", 400);
    const input = parsed.data;

    const { data: rows, error: jobError } = await db
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", user.id)
      .eq("source_type", IMPORTED_JOB_SOURCE_TYPE)
      .order("created_at", { ascending: false })
      .limit(200);
    if (jobError) return html("Your saved job could not be loaded. Please retry.", 503);
    const job = input.observationId ? await loadSearchedFitJob(db, user.id, input.observationId) : ((rows ?? []) as Array<{ extracted_text: string | null }>)
      .map((row) => parseImportedJob(row.extracted_text))
      .find((item) => item?.importId === input.importId);
    if (!job) return html("That job was not found in your records.", 404);

    const assessedAt = new Date().toISOString();
    let assessment: FitAssessment;

    if (input.recommendation && !input.observationId) {
      // The user is overruling the app. Their conclusion is recorded as theirs,
      // with their reason, and the app's earlier reading is kept beside it.
      assessment = {
        importId: job.importId,
        recommendation: input.recommendation,
        confidence: "high",
        nextAction: input.note || "You set this yourself.",
        findings: [],
        basis: "user",
        assessedAt,
        userNote: input.note || undefined,
      };
    } else {
      const preferences = await loadStoredSearchPreferences(db, user.id);
      const { data: intakeRow, error: intakeError } = await db
        .from("career_sources")
        .select("extracted_text")
        .eq("user_id", user.id)
        .eq("source_type", "resume_intake")
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: analysisRow, error: analysisError } = await db
        .from("career_sources")
        .select("extracted_text")
        .eq("user_id", user.id)
        .eq("source_type", "evidence_analysis")
        .order("created_at", { ascending: false })
        .limit(1);

      if (intakeError || analysisError) return html("Your career context could not be loaded. No incomplete assessment was saved; please retry.", 503);
      const latestSource = parseIntakeSource((intakeRow ?? [])[0]?.extracted_text ?? null);
      const advisor = parseAnalysisAdvisor((analysisRow ?? [])[0]?.extracted_text ?? null) ?? latestSource?.advisor ?? null;
      // Do not let buildTargetLanes' UI-oriented empty-state examples become
      // the user's actual target lanes in a fit decision.
      const laneRoles = (advisor?.roleBriefs?.length ? advisor.roleBriefs.map(lane => lane.role) : latestSource?.draft?.possibleRoles ?? []).filter(Boolean).slice(0, 3);
      const careerEvidence: Array<{ refId: string; detail: string }> = [];
      const addEvidence = (refId: string, detail: unknown) => {
        if (typeof detail !== "string") return;
        const clean = detail.replace(/\s+/g, " ").trim().slice(0, 700);
        if (!clean || careerEvidence.some((item) => item.detail === clean)) return;
        careerEvidence.push({ refId, detail: clean });
      };
      if (latestSource?.draft?.strengths) latestSource.draft.strengths.slice(0, 4).forEach((item, index) => addEvidence(`intake-strength-${index + 1}`, item));
      if (advisor?.summary) addEvidence("strategy-summary", advisor.summary);
      advisor?.roleBriefs?.slice(0, 4).forEach((lane, index) => {
        addEvidence(`career-lane-${index + 1}`, `${lane.role}: ${lane.whyItFits} Evidence still needed: ${lane.evidenceNeeded}`);
      });
      advisor?.evidenceLedger?.slice(0, 8).forEach((item, index) => {
        addEvidence(`proof-${index + 1}`, `${item.claim} [${item.status}]. Evidence: ${item.evidence}. Why it matters: ${item.whyItMatters}. Next validation: ${item.nextValidationStep}`);
      });
      advisor?.goalReviews?.slice(0, 5).forEach((goal, index) => {
        addEvidence(`goal-${index + 1}`, `User direction: ${goal.direction}. CIP interpretation: ${goal.understanding}. Context: ${goal.contextAssessment}. Uncertainties: ${goal.uncertainties.join("; ")}`);
      });

      // Conversation outcomes are a core CIP signal: market reads, work-model
      // information and warnings can materially change the value of a posting.
      // Keep contact names and raw note excerpts out of the fit prompt.
      try {
        const { data: conversationRows } = await db.from("career_sources")
          .select("extracted_text")
          .eq("user_id", user.id)
          .eq("source_type", "conversation_outcome")
          .order("created_at", { ascending: false })
          .limit(100);
        const employerWords = job.employer.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
        const relevant = (conversationRows ?? []).map((row: { extracted_text: string | null }) => {
          try { return parseConversationOutcome(JSON.parse(row.extracted_text || "null")); } catch { return null; }
        }).filter(Boolean).filter((outcome) => {
          const laneRelevant = laneRoles.some((lane) => outcome!.relatedLane && lane.toLowerCase().includes(outcome!.relatedLane.toLowerCase()));
          const employer = outcome!.relatedEmployer.toLowerCase();
          const employerRelevant = employer && (employer.includes(job.employer.toLowerCase()) || employerWords.some((word) => employer.includes(word)));
          return laneRelevant || employerRelevant || ["compensation", "work model", "culture", "hiring", "dealbreaker"].some((term) =>
            [outcome!.signalType, outcome!.compensationSignal, outcome!.workModelSignal, outcome!.cultureSignal, outcome!.hiringSignal, outcome!.warnings].join(" ").toLowerCase().includes(term),
          );
        }).slice(0, 6);
        relevant.forEach((outcome, index) => addEvidence(`conversation-${index + 1}`, [
          `Conversation signal (${outcome!.signalDirection}, ${outcome!.signalType})`,
          outcome!.relatedLane && `direction ${outcome!.relatedLane}`,
          outcome!.relatedEmployer && `employer ${outcome!.relatedEmployer}`,
          outcome!.compensationSignal && `compensation: ${outcome!.compensationSignal}`,
          outcome!.workModelSignal && `work model: ${outcome!.workModelSignal}`,
          outcome!.cultureSignal && `culture: ${outcome!.cultureSignal}`,
          outcome!.hiringSignal && `hiring process: ${outcome!.hiringSignal}`,
          outcome!.marketSignal && `market read: ${outcome!.marketSignal}`,
          outcome!.warnings && `warning: ${outcome!.warnings}`,
        ].filter(Boolean).join(". ")));
      } catch { /* A missing conversation store leaves other saved CIP context usable. */ }

      const profileEvidence: ProfileEvidence[] = [];
      const addProfile = (refId: string, value: unknown, kind: ProfileEvidence["kind"], maxRecords = 65) => {
        if (typeof value !== "string" || !value.trim()) return;
        const clean = value.trim();
        for (let offset = 0; offset < clean.length && profileEvidence.length < maxRecords; offset += 1400) {
          profileEvidence.push({ refId: refId + "-" + Math.floor(offset / 1400), detail: clean.slice(offset, offset + 1400), kind });
        }
      };
      // Original resume and intake answers, not a generated resume or inferred role brief.
      for (const field of ["resume_text", "hidden_achievements", "energizing_problems", "career_constraints", "industry_preferences", "claim_boundaries"]) {
        addProfile("intake-" + field, latestSource?.intake?.[field], "user");
      }
      const supporting = await Promise.all(["evidence_response", "source_analysis"].map(async sourceType => {
        const result = await db.from("career_sources").select("id,extracted_text,created_at").eq("user_id", user.id).eq("source_type", sourceType).order("created_at", { ascending: false }).limit(60);
        if (result.error) throw new Error("Supporting career evidence could not be loaded. Please retry.");
        return { sourceType, rows: result.data ?? [] };
      }));
      for (const source of supporting) for (const [index, row] of source.rows.entries()) {
        let value;
        try { value = JSON.parse(row.extracted_text || "null"); } catch { continue; }
        const ref = source.sourceType + "-" + (row.id || index);
        if (source.sourceType === "evidence_response") {
          addProfile(ref, value?.response?.answer, value?.response?.confidence === "known" ? "user" : "inference");
        } else if (Array.isArray(value?.items)) {
          for (const [index, item] of value.items.entries()) addProfile(ref + "-item-" + index, [item.projectName, item.summary, ...(item.proves ?? []), ...(item.careerClaimsSupported ?? []), "Needs confirmation: " + (item.needsUserConfirmation ?? []).join("; ")].filter(Boolean).join(". "), "inference");
        }
      }
      for (const item of careerEvidence) addProfile(item.refId, item.detail, "inference", 85);
      if (input.clarification) {
        const sourceId = crypto.randomUUID();
        const saved = await db.from("career_sources").insert({ user_id: user.id, source_type: "evidence_response", title: "Job-fit experience clarification: " + job.title.slice(0, 100), url: null, trust_state: "user_submitted", extracted_text: JSON.stringify({ response: { questionId: sourceId, question: "What relevant experience was missing from your fit assessment?", answer: input.clarification, confidence: "known", proofUrl: "", sourceNote: "User-stated clarification during job-fit assessment; not independently verified." }, saved_at: assessedAt }) });
        if (saved.error) return html("Your clarification could not be saved. The assessment was not rerun; please retry.", 500);
        const excerpts = [];
        for (let offset = 0; offset < input.clarification.length; offset += 1400) excerpts.push({ refId: "evidence_response-" + sourceId + "-" + Math.floor(offset / 1400), detail: input.clarification.slice(offset, offset + 1400), kind: "user" as const });
        profileEvidence.unshift(...excerpts);
      }
      assessment = await assessImportedJobFitWithAi(
        job,
        {
          salaryFloorUsd: preferences?.salaryFloorUsd,
          workModes: preferences?.workModes ?? [],
          exclusions: preferences?.exclusions ?? { industries: [], roles: [], employers: [] },
          laneRoles,
          lanes: laneRoles.map(role => { const lane = advisor?.roleBriefs?.find(lane => lane.role === role); return { role, rationale: lane?.whyItFits, proofGaps: lane?.evidenceNeeded }; }),
          profileEvidence,
          careerEvidence: careerEvidence.slice(0, 20),
        },
        assessedAt,
      );
    }

    if (input.observationId && !job.originalMaterial && assessment.analysis) assessment.analysis.limitations.push("The source did not provide a readable, matching full job description. Open the listing and bring its text into CIP to assess it; a search title or snippet was not used as a substitute.");
    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: IMPORTED_JOB_FIT_SOURCE_TYPE,
      title: `Fit assessment: ${job.title} at ${job.employer}`,
      url: job.sourceUrl || null,
      extracted_text: JSON.stringify({ ...importedJobFitPayload(assessment), ...(input.observationId ? { searchedPosting: { observationId: input.observationId, sourceUrl: job.sourceUrl, capturedAt: job.capturedAt, material: job.originalMaterial } } : {}) }),
      trust_state: assessment.basis === "user" ? "user_supplied" : "inferred",
    });
    if (error) return html("The assessment ran but could not be saved. Please retry.", 500);

    if (input.recommendation === "skip") {
      try { await setImportedArchive(db, user.id, job, true); }
      catch { return html("Your conclusion was saved, but the job could not be archived. Please retry the archive action.", 500); }
    }
    if (input.inlineResult === "yes" && !input.recommendation && request.headers.get("HX-Request") === "true") {
      const targetId = "fit-assessment-" + (input.observationId ?? job.importId).replace(/[^A-Za-z0-9_-]/g, "");
      return new Response('<div id="' + escapeHtml(targetId) + '" hx-swap-oob="innerHTML">' + (input.clarification ? '<p class="mb-2 text-sm">Your clarification was saved as career evidence and included in this assessment.</p>' : '') + renderCompletedFit(assessment) + '</div><p role="status">Your result is saved and displayed above.</p>', { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "HX-Trigger-After-Settle": JSON.stringify({ fitAssessmentReady: { targetId } }) } });
    }
    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo)
      ? input.returnTo
      : input.observationId ? "/opportunities#job-search-panel" : "/opportunities#imported-jobs";
    const target = new URL(path, "http://localhost");
    target.searchParams.set("assessed", assessment.basis);
    const destination = target.pathname + target.search + target.hash;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination, "HX-Refresh": "true" } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("The assessment could not be completed. Nothing was changed; please retry.", 500);
  }
};
