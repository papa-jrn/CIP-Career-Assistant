import type { APIRoute } from "astro";
import { z } from "zod";
import {
  IMPORTED_JOB_FIT_SOURCE_TYPE,
  assessImportedJobFitWithAi,
  importedJobFitPayload,
  type FitAssessment,
} from "@/lib/cip/imported-job-fit";
import { IMPORTED_JOB_SOURCE_TYPE, parseImportedJob } from "@/lib/cip/imported-jobs";
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
  importId: z.string().trim().min(1, "The job to assess was not identified.").max(80),
  /** Present when the user is correcting the app's conclusion. */
  recommendation: z.enum(["talk_first", "check_funding", "apply", "monitor", "skip"]).optional(),
  note: z.string().trim().max(1000).optional(),
  returnTo: z.string().trim().optional(),
});

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

    const { data: rows } = await db
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", user.id)
      .eq("source_type", IMPORTED_JOB_SOURCE_TYPE)
      .order("created_at", { ascending: false })
      .limit(200);
    const job = ((rows ?? []) as Array<{ extracted_text: string | null }>)
      .map((row) => parseImportedJob(row.extracted_text))
      .find((item) => item?.importId === input.importId);
    if (!job) return html("That job was not found in your records.", 404);

    const assessedAt = new Date().toISOString();
    let assessment: FitAssessment;

    if (input.recommendation) {
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
      const preferences = await loadStoredSearchPreferences(db, user.id).catch(() => null);
      const { data: intakeRow } = await db
        .from("career_sources")
        .select("extracted_text")
        .eq("user_id", user.id)
        .eq("source_type", "resume_intake")
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: analysisRow } = await db
        .from("career_sources")
        .select("extracted_text")
        .eq("user_id", user.id)
        .eq("source_type", "evidence_analysis")
        .order("created_at", { ascending: false })
        .limit(1);

      const latestSource = parseIntakeSource((intakeRow ?? [])[0]?.extracted_text ?? null);
      const advisor = parseAnalysisAdvisor((analysisRow ?? [])[0]?.extracted_text ?? null) ?? latestSource?.advisor ?? null;
      // Do not let buildTargetLanes' UI-oriented empty-state examples become
      // the user's actual target lanes in a fit decision.
      const laneRoles = advisor?.roleBriefs?.map((lane) => lane.role).filter(Boolean)
        ?? latestSource?.draft?.possibleRoles?.filter(Boolean)
        ?? [];
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

      assessment = await assessImportedJobFitWithAi(
        job,
        {
          salaryFloorUsd: preferences?.salaryFloorUsd,
          workModes: preferences?.workModes ?? [],
          exclusions: preferences?.exclusions ?? { industries: [], roles: [], employers: [] },
          laneRoles,
          careerEvidence: careerEvidence.slice(0, 20),
        },
        assessedAt,
      );
    }

    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: IMPORTED_JOB_FIT_SOURCE_TYPE,
      title: `Fit assessment: ${job.title} at ${job.employer}`,
      url: job.sourceUrl || null,
      extracted_text: JSON.stringify(importedJobFitPayload(assessment)),
      trust_state: assessment.basis === "user" ? "user_supplied" : "inferred",
    });
    if (error) return html("The assessment ran but could not be saved. Please retry.", 500);

    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo)
      ? input.returnTo
      : "/opportunities#imported-jobs";
    const destination = `${path}${path.includes("?") ? "&" : "?"}assessed=${assessment.basis}`;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("The assessment could not be completed. Nothing was changed; please retry.", 500);
  }
};
