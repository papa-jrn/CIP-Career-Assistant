import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { currentTargetEvents, resolveTargetStatus, TARGET_STATUSES } from "@/lib/cip/employer-target-events";
import { currentCareersUrls, resolveCareersUrl, describeCareersUrl } from "@/lib/cip/employer-careers-url";
import { STATUS_LABEL } from "@/lib/cip/target-dossier";
import { normOrg } from "@/lib/cip/employer-resolution";
import { escapeHtml } from "@/lib/cip/job-search-view";

const page = readFileSync(new URL("./employers.astro", import.meta.url), "utf8");
// Run the actual page's card setup in source order: an empty workspace used
// to hide a temporal-dead-zone crash that only saved employers exposed.
const start = Math.min(page.indexOf("const targetEvents ="), page.indexOf("const employerById ="));
const setup = page.slice(start, page.indexOf("const savedRegionKeys ="));
const code = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

describe("Employers page card initialization", () => {
  it.each([false, true])("renders a saved employer with user status present: %s", (hasStatus) => {
    const employer = { id: "e1", name: "Example Employer", target_roles: [], source_notes: [] };
    const html = runInNewContext(code + "\nworkspaceHtml;", {
      employers: [employer], careersUrlRecords: [],
      targetEventRecords: hasStatus ? [{ employerKey: "example employer", name: employer.name, parentKey: null, status: "researching", note: "", source: "user", createdAt: "2026-10-26T12:00:00Z" }] : [],
      workspace: { dossiers: [{ employerId: "e1", name: employer.name, status: "monitoring" }], run: null },
      currentTargetEvents, resolveTargetStatus, TARGET_STATUSES,
      currentCareersUrls, resolveCareersUrl, describeCareersUrl, STATUS_LABEL, escapeHtml, normOrg,
      safeLink: () => null,
      renderWorkspace: (dossiers: unknown[], options: { renderExtras: (dossier: unknown) => string }) => dossiers.map(options.renderExtras).join(""),
    });
    expect(html).toContain("Save my status");
    expect(html).toContain(hasStatus ? "You set this." : "CIP's suggestion");
  });
});