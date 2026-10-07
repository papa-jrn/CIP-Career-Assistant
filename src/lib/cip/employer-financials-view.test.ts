import { describe, expect, it } from "vitest";
import type { FundingProfile } from "@/lib/cip/employer-financials";
import {
  FINANCIALS_SETUP_MESSAGE,
  friendlyFinancialsError,
  renderBulkFinancialsControl,
  renderFinancialsBlock,
} from "@/lib/cip/employer-financials-view";

const NOW = "2026-10-07T12:00:00.000Z";
const ID = "11111111-2222-3333-4444-555555555555";

const profile = (over: Partial<FundingProfile> = {}): FundingProfile => ({
  employerKey: "granite community trust", employerName: "Granite Community Trust", ein: 111111111, organizationName: "Granite Community Trust", nteeCode: "P30",
  latestRevenueUsd: 820_000, latestExpensesUsd: 790_000, latestAssetsUsd: 1_600_000, latestFilingYear: 2024, filingCount: 3, trend: "shrinking",
  revenueSeries: [{ year: 2024, revenue: 820_000, expenses: 790_000 }, { year: 2023, revenue: 1_000_000, expenses: null }, { year: 2022, revenue: 1_150_000, expenses: null }],
  pdfUrl: "https://projects.propublica.org/x/f.pdf", sourceUrl: "https://projects.propublica.org/nonprofits/organizations/111111111",
  status: "ok", statusNote: "Matched by name (exact) to Granite Community Trust.", updatedAt: NOW, ...over,
});

const block = (over: Record<string, unknown> = {}) =>
  renderFinancialsBlock({ employerId: ID, employerName: "Granite Community Trust", profile: profile(), nowIso: NOW, ...over });

describe("renderFinancialsBlock", () => {
  it("shows a looked-up employer's numbers, trend, series, and sources, with the honest caveat", () => {
    const html = block();
    expect(html).toContain(`id="fin-${ID}"`);
    expect(html).toContain("Revenue shrinking");
    expect(html).toContain("IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022");
    expect(html).toContain("FY 2024: $820k · FY 2023: $1M · FY 2022: $1.2M");
    expect(html).toContain("revenue $820k · expenses $790k · assets $1.6M");
    expect(html).toContain('href="https://projects.propublica.org/nonprofits/organizations/111111111"');
    expect(html).toContain("Latest 990 (PDF)");
    expect(html).toContain("cannot show whether a particular role is funded now");
    expect(html).toContain("Checked 2026-10-07");
    expect(html).toContain("Refresh financials");
  });

  it("labels growth and a steady trend without the warning tone", () => {
    expect(block({ profile: profile({ revenueSeries: [{ year: 2024, revenue: 1_400_000, expenses: null }, { year: 2023, revenue: 1_000_000, expenses: null }] }) })).toContain("Revenue growing");
    expect(block({ profile: profile({ revenueSeries: [{ year: 2024, revenue: 1_010_000, expenses: null }, { year: 2023, revenue: 1_000_000, expenses: null }] }) })).toContain("Revenue steady");
    expect(block({ profile: profile({ revenueSeries: [{ year: 2024, revenue: 1_400_000, expenses: null }] }) })).toContain("Trend unknown");
  });

  it("offers a first lookup when nothing is on file, saying filings are not available for every employer", () => {
    const html = block({ profile: null });
    expect(html).toContain("Not looked up yet");
    expect(html).toContain("Look up financials");
    expect(html).toContain('hx-post="/api/employers/financials"');
    expect(html).toContain(`name="employer_id" value="${ID}"`);
  });

  it("explains an unconfirmed or missing match as unknown, never as poor funding, and offers the EIN escape hatch", () => {
    const html = block({ profile: profile({ status: "no_match", latestRevenueUsd: null, statusNote: "Possible match, not confirmed: Valley Arts Council (EIN 33-3333333), Lebanon, NH. Enter the EIN to confirm." }) });
    expect(html).toContain("No confirmed IRS 990 match");
    expect(html).toContain("Possible match, not confirmed");
    expect(html).toContain("Unknown is not the same as poor funding");
    expect(html).toContain("Know the EIN?");
    expect(html).toContain('name="ein"');
    expect(html).not.toContain("Revenue shrinking");
  });

  it("distinguishes a failed lookup and a registered organization with no data filings", () => {
    expect(block({ profile: profile({ status: "lookup_failed", statusNote: "ProPublica didn't respond." }) })).toContain("Could not be looked up");
    expect(block({ profile: profile({ status: "no_filings", statusNote: "Tiny Garden Club is registered..." }) })).toContain("No Form 990 data filing found");
  });

  it("shows only the setup message, with no buttons, when the table is missing", () => {
    const html = block({ setupError: "Could not find the table 'public.employer_990_profiles' in the schema cache" });
    expect(html).toContain("20261007140000_employer_990_profiles.sql");
    expect(html).not.toContain("hx-post");
  });

  it("shows a one-off message, flags stale data, and can render as an out-of-band swap", () => {
    expect(block({ message: "ProPublica didn't respond. Showing the last saved filing data." })).toContain("Showing the last saved filing data.");
    expect(block({ profile: profile({ updatedAt: "2026-08-01T00:00:00.000Z" }) })).toMatch(/over 30 days ago, refresh to update/);
    expect(block({ oob: true })).toContain('hx-swap-oob="outerHTML"');
    expect(block()).not.toContain("hx-swap-oob");
  });

  it("uses the shared loading animation for the lookup, wired to the refresh forms", () => {
    const html = block();
    expect(html).toContain(`id="fin-load-${ID}"`);
    expect(html).toContain("cip-thinking-panel");
    expect(html).toContain("cip-thinking-orbit");
    expect(html).toContain(`hx-indicator="#fin-load-${ID}"`);
  });

  it("escapes every dynamic value and refuses non-http links", () => {
    const html = block({
      employerName: "<img src=x onerror=alert(1)>",
      profile: profile({
        organizationName: "<script>alert(1)</script> Org",
        statusNote: '"><b>bold</b>',
        sourceUrl: "javascript:alert(1)",
        pdfUrl: "data:text/html,<script>1</script>",
      }),
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Org");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
  });
});

describe("renderBulkFinancialsControl and error mapping", () => {
  it("shows how many tracked employers have filings, states what is sent, and wires the loading animation", () => {
    const html = renderBulkFinancialsControl({ total: 28, withFilings: 3 });
    expect(html).toContain("3 of 28 have filings on file");
    expect(html).toContain("only the employer's name and state");
    expect(html).toContain("up to 8 at a time");
    expect(html).toContain('hx-post="/api/employers/financials/bulk"');
    expect(html).toContain('id="fin-bulk-loading"');
    expect(html).toContain("cip-thinking-panel");
    expect(html).toContain('id="fin-bulk-result"');
  });

  it("replaces the control with the setup message when the table is missing", () => {
    const html = renderBulkFinancialsControl({ total: 5, withFilings: 0, setupError: "relation \"public.employer_990_profiles\" does not exist" });
    expect(html).toContain("20261007140000_employer_990_profiles.sql");
    expect(html).not.toContain("hx-post");
  });

  it("maps database-setup errors to the setup message and passes other errors through unchanged", () => {
    expect(friendlyFinancialsError("Could not find the table 'public.employer_990_profiles' in the schema cache")).toBe(FINANCIALS_SETUP_MESSAGE);
    expect(friendlyFinancialsError('relation "employer_990_profiles" does not exist')).toBe(FINANCIALS_SETUP_MESSAGE);
    expect(friendlyFinancialsError("ProPublica didn't respond.")).toBe("ProPublica didn't respond.");
    expect(friendlyFinancialsError(null)).toBe("");
  });
});
