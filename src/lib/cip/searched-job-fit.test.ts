import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import { loadSearchedFitJob, searchedFitId } from "./searched-job-fit";
import { safePageFetcher } from "./job-verifier";
vi.mock("./job-verifier", async original => ({ ...await original<typeof import("./job-verifier")>(), safePageFetcher: vi.fn() }));
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", ""); vi.mocked(safePageFetcher).mockReset(); });
describe("searched posting description acquisition", () => {
  it("keeps normalized posting identity stable across runs", () => {
    expect(searchedFitId("https://example.org/job?utm_source=email")).toBe(searchedFitId("https://example.org/job"));
  });
  it("authenticates ownership before fetching, and never scores a blocked or mismatching page", async () => {
    const { client, db } = createFakeSupabase();
    db.job_search_observations = [{ id: "one", user_id: "owner", title: "Operations Director", employer_text: "Example", source_url: "https://example.org/job" }];
    expect(await loadSearchedFitJob(client, "stranger", "one")).toBeNull();
    expect(safePageFetcher).not.toHaveBeenCalled();
    vi.mocked(safePageFetcher).mockResolvedValue({ status: 403, text: "Access denied" });
    expect((await loadSearchedFitJob(client, "owner", "one"))?.originalMaterial).toBe("");
    vi.mocked(safePageFetcher).mockResolvedValue({ status: 200, text: "<h1>Different role</h1>" + "Unrelated company content. ".repeat(30) });
    expect((await loadSearchedFitJob(client, "owner", "one"))?.originalMaterial).toBe("");
  });
  it("uses readable full description text, excluding scripts and markup", async () => {
    const { client, db } = createFakeSupabase();
    db.job_search_observations = [{ id: "one", user_id: "owner", title: "Operations Director", employer_text: "Example", source_url: "https://example.org/job" }];
    vi.mocked(safePageFetcher).mockResolvedValue({ status: 200, text: "<h1>Operations Director</h1><script>SECRET_SCRIPT</script><p>" + "Lead operational teams and manage budgets. ".repeat(30) + "</p>" });
    const job = await loadSearchedFitJob(client, "owner", "one");
    expect(job?.originalMaterial).toContain("Lead operational teams");
    expect(job?.originalMaterial).not.toContain("SECRET_SCRIPT");
    expect(job?.originalMaterial).not.toContain("<p>");
    expect(job?.verification?.state).toBe("verified_open");
  });
});
