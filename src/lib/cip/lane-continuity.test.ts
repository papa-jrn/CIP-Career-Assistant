import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import { describe, expect, it } from "vitest";
import { advisorWithLaneHistory, retainCareerLanes, loadAdvisorLaneHistory } from "./lane-continuity";
import type { RoleBrief } from "./advisor";
const brief = (role: string): RoleBrief => ({ role, whyItFits: `Saved evidence for ${role}`, evidenceNeeded: "Market test still needed", searchTargets: [] });
const row = (...roles: string[]) => ({ extracted_text: JSON.stringify({ advisor: { summary: "Current summary", roleBriefs: roles.map(brief) } }) });
describe("career lane continuity", () => {
  it("promotes a new focus while retaining the prior primary, secondary and their evidence", () => {
    const old = [brief("Executive Director"), brief("CTO"), brief("Workforce Development")];
    const result = retainCareerLanes([brief("CIP Founder")], old);
    expect(result.map(x => x.role)).toEqual(["CIP Founder", "Executive Director", "CTO", "Workforce Development"]);
    expect(result[1]).toEqual(old[0]);
  });
  it("uses the latest assessment of an existing lane without duplicating punctuation variants", () => {
    expect(retainCareerLanes([brief("CTO / Technology")], [brief("cto technology")])).toHaveLength(1);
  });
  it("recovers a complete set after multiple incomplete analyses, without resurrecting older suggestions", () => {
    const result = advisorWithLaneHistory([row("CIP Founder"), row("CIP Founder"), row("Executive Director", "CTO", "Workforce"), row("Discarded", "Other", "Old")]);
    expect(result?.roleBriefs?.map(x => x.role)).toEqual(["CIP Founder", "Executive Director", "CTO", "Workforce"]);
  });
  it("does not manufacture three lanes for a new user", () => {
    expect(advisorWithLaneHistory([row("Founder")])?.roleBriefs).toHaveLength(1);
  });
  it("keeps legacy intake lanes available when no complete analysis exists", () => {
    expect(advisorWithLaneHistory([row("Founder")], { roleBriefs: [brief("Director")] })?.roleBriefs).toHaveLength(2);
  });
});

it("pages past repeated partial analyses and scopes recovery to the signed-in user", async () => {
  const source = (record: ReturnType<typeof row>, index: number, user_id = "owner") => ({ ...record, id: String(index), user_id, source_type: "evidence_analysis", created_at: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString() });
  const { client } = createFakeSupabase({ career_sources: [
    source(row("Private other lane", "Private second", "Private third"), 999, "other"),
    ...Array.from({ length: 101 }, (_, i) => source(row("Founder"), i + 1)),
    source(row("Director", "CTO", "Workforce"), 0),
  ] });
  const loaded = await loadAdvisorLaneHistory(client, "owner");
  expect(loaded).toHaveLength(102);
  expect(advisorWithLaneHistory(loaded)?.roleBriefs?.map(x => x.role)).toEqual(["Founder", "Director", "CTO", "Workforce"]);
});
