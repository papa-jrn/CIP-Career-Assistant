import type { APIRoute } from "astro";
import { createServer } from "@/lib/supabase/server";

export const GET: APIRoute = async ({ cookies, url }) => {
  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return json({ error: "Supabase is not configured." }, 500);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ error: "Sign in before exporting network data." }, 401);
    }

    const [{ data: analysisRow, error: analysisError }, { data: importRow, error: importError }] = await Promise.all([
      supabase
        .from("career_sources")
        .select("title, extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "network_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("career_sources")
        .select("title, extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "network_import")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (analysisError) return json({ error: analysisError.message }, 500);
    if (importError) return json({ error: importError.message }, 500);
    if (!analysisRow) return json({ error: "No saved network analysis found." }, 404);

    const payload = {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      network_analysis_record: {
        title: analysisRow.title,
        created_at: analysisRow.created_at,
        data: parseJson(analysisRow.extracted_text),
      },
      network_import_record: importRow
        ? {
            title: importRow.title,
            created_at: importRow.created_at,
            data: parseJson(importRow.extracted_text),
          }
        : null,
    };

    if (url.searchParams.get("format") === "html") {
      return new Response(renderHtmlReport(payload), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Disposition": `attachment; filename="cip-network-readout-${new Date().toISOString().slice(0, 10)}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected export error." }, 500);
  }
};

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function renderHtmlReport(payload: {
  exported_at: string;
  network_analysis_record: {
    title: string;
    created_at: string;
    data: unknown;
  };
  network_import_record: {
    title: string;
    created_at: string;
    data: unknown;
  } | null;
}) {
  const analysisData = payload.network_analysis_record.data as {
    contact_count?: number;
    employer_count?: number;
    files?: Array<{ fileName?: string; kind?: string; status?: string; contactCount?: number; rowCount?: number; detail?: string }>;
    analysis?: {
      mode?: string;
      summary?: string;
      sourceInventory?: string[];
      laneValidations?: Array<{
        lane: string;
        status: string;
        score: number;
        namedPeople: string[];
        recommendedValidationAsk: string;
        missingEvidence?: string[];
      }>;
      weeklyMoves?: string[];
      reconnectCandidates?: string[];
      reconnectQuestions?: string[];
      topPaths?: string[];
      employerOverlaps?: string[];
      adjacentNetworkSignals?: string[];
      contextPools?: Array<{ label: string; type: string; reason: string; namedPeople: string[]; nextStep: string }>;
      relationshipCoaching?: string[];
      confidenceNotes?: string[];
    };
  };
  const importData = payload.network_import_record?.data as { contact_count?: number } | null;
  const analysis = analysisData?.analysis ?? {};
  const files = analysisData?.files ?? [];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CIP Network Intelligence Report</title>
    <style>
      :root { color: #172017; background: #f7fbf4; font-family: Arial, sans-serif; }
      body { margin: 0; }
      main { max-width: 920px; margin: 0 auto; padding: 32px 22px 56px; }
      h1 { font-size: 32px; margin: 0 0 8px; }
      h2 { border-bottom: 1px solid #dbe8d7; font-size: 20px; margin-top: 30px; padding-bottom: 8px; }
      h3 { font-size: 16px; margin-bottom: 6px; }
      p, li { color: #40513f; font-size: 14px; line-height: 1.65; }
      .toolbar { align-items: center; background: #fff; border-bottom: 1px solid #dbe8d7; display: flex; gap: 12px; justify-content: space-between; padding: 14px 22px; position: sticky; top: 0; }
      .button { background: #7ed957; border: 1px solid #286f32; border-radius: 7px; color: #13210f; cursor: pointer; font-weight: 700; padding: 9px 14px; text-decoration: none; }
      .muted { color: #60705f; }
      .grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { background: #fff; border: 1px solid #dbe8d7; border-radius: 8px; padding: 16px; }
      .pill { background: #eefbe8; border: 1px solid #dbe8d7; border-radius: 999px; color: #286f32; display: inline-block; font-size: 12px; font-weight: 700; margin: 0 6px 6px 0; padding: 4px 8px; }
      .print-note { background: #eefbe8; border: 1px solid #dbe8d7; border-radius: 8px; margin-top: 10px; padding: 12px; }
      @media print {
        body { background: #fff; }
        main { max-width: none; padding: 0; }
        .toolbar, .no-print { display: none !important; }
        .card { break-inside: avoid; }
        h2 { break-after: avoid; }
      }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } .toolbar { align-items: flex-start; flex-direction: column; } }
    </style>
    <script src="/report-print.js" defer></script>
  </head>
  <body>
    <div class="toolbar no-print">
      <div>
        <strong>CIP Network Intelligence Report</strong>
        <p class="muted" style="margin: 2px 0 0;">Use Print, then choose "Save as PDF" as the destination.</p>
      </div>
      <button class="button" data-print>Print or Save as PDF</button>
    </div>
    <main>
      <h1>Network Intelligence Report</h1>
      <p class="muted">Generated ${escapeHtml(new Date(payload.exported_at).toLocaleString())}. Source analysis saved ${escapeHtml(new Date(payload.network_analysis_record.created_at).toLocaleString())}.</p>
      <div class="print-note no-print">
        <p><strong>Saving as PDF:</strong> click "Print or Save as PDF", choose "Save as PDF" in your browser's destination/printer menu, then save the file.</p>
      </div>

      <h2>Executive Summary</h2>
      <p>${escapeHtml(analysis.summary ?? "No summary is available yet.")}</p>
      <p>
        <span class="pill">${analysisData?.contact_count ?? importData?.contact_count ?? 0} contacts</span>
        <span class="pill">${analysisData?.employer_count ?? 0} employer targets</span>
        <span class="pill">${escapeHtml(analysis.mode ?? "analysis")}</span>
      </p>

      ${sectionList("What CIP Saw", analysis.sourceInventory)}
      ${sectionList("How To Use This List", analysis.relationshipCoaching)}
      ${renderLaneCards(analysis.laneValidations)}
      ${sectionList("Top Relationship Moves", analysis.weeklyMoves)}
      ${sectionList("Top Named People To Review", analysis.reconnectCandidates)}
      ${sectionList("Questions Before Outreach", analysis.reconnectQuestions)}
      ${sectionList("Warm Paths", analysis.topPaths)}
      ${sectionList("Employer Overlap", analysis.employerOverlaps)}
      ${sectionList("Adjacent Network Signals", analysis.adjacentNetworkSignals)}
      ${renderContextPools(analysis.contextPools)}
      ${renderFiles(files)}
      ${sectionList("Confidence Notes", analysis.confidenceNotes)}
    </main>
  </body>
</html>`;
}

function sectionList(title: string, items: string[] | undefined) {
  if (!items?.length) return "";
  return `
    <h2>${escapeHtml(title)}</h2>
    <ul>${items.slice(0, 12).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  `;
}

function renderLaneCards(lanes: Array<{ lane: string; status: string; score: number; namedPeople: string[]; recommendedValidationAsk: string; missingEvidence?: string[] }> | undefined) {
  if (!lanes?.length) return "";
  return `
    <h2>Career Lane Validation</h2>
    <div class="grid">
      ${lanes.map((lane) => `
        <article class="card">
          <h3>${escapeHtml(lane.lane)}</h3>
          <p><span class="pill">${lane.score}% ${escapeHtml(lane.status.replace("_", " "))}</span></p>
          <p>${escapeHtml(lane.recommendedValidationAsk)}</p>
          ${lane.namedPeople?.length ? `<p><strong>Named people:</strong> ${escapeHtml(lane.namedPeople.join(", "))}</p>` : ""}
          ${lane.missingEvidence?.length ? `<p><strong>Watch:</strong> ${escapeHtml(lane.missingEvidence[0])}</p>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderContextPools(pools: Array<{ label: string; type: string; reason: string; namedPeople: string[]; nextStep: string }> | undefined) {
  if (!pools?.length) return "";
  return `
    <h2>Context Pools</h2>
    <div class="grid">
      ${pools.map((pool) => `
        <article class="card">
          <h3>${escapeHtml(pool.label)} <span class="pill">${escapeHtml(pool.type.replace("_", " "))}</span></h3>
          <p>${escapeHtml(pool.reason)}</p>
          <p>${escapeHtml(pool.nextStep)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderFiles(files: Array<{ fileName?: string; kind?: string; status?: string; contactCount?: number; rowCount?: number; detail?: string }> | undefined) {
  if (!files?.length) return "";
  return `
    <h2>Import Sources</h2>
    <div class="grid">
      ${files.slice(0, 24).map((file) => `
        <article class="card">
          <h3>${escapeHtml(file.fileName ?? "Source file")}</h3>
          <p><span class="pill">${escapeHtml(file.status ?? "recorded")} ${escapeHtml(file.kind ?? "file")}</span><span class="pill">${file.contactCount ?? 0} contacts</span><span class="pill">${file.rowCount ?? 0} rows</span></p>
          <p>${escapeHtml(file.detail ?? "")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
