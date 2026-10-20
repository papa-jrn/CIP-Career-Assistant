import { describe, expect, it, vi } from "vitest";
import { actionRecord, assembleActions, workInput, type SourceRow, type WorkEvent } from "./workbench-actions";
vi.stubEnv("OPENAI_API_KEY", "");
const event: WorkEvent = { version: 1, actionId: "b17c231d-326c-48da-b777-3c3a77111f21", title: "Check funding", context: "Example organization", kind: "funding", status: "active", note: "" };
function row(e: WorkEvent, at: string): SourceRow { return { id: at, created_at: at, ...actionRecord(e) }; }
describe("Workbench action history", () => {
  it("preserves completed work and every finding without implicit reopening", () => {
    const actions = assembleActions([row({ ...event, status: "completed", note: "Could not establish current funding." }, "2026-10-19"), row(event, "2026-10-18")]);
    expect(actions).toHaveLength(1);
    expect(actions[0].status).toBe("completed");
    expect(actions[0].history).toHaveLength(2);
    expect(actions[0].history[0].note).toContain("Could not establish");
  });
  it("supports explicit reopening and retains dismissed findings", () => {
    const actions = assembleActions([row(event, "3"), row({ ...event, status: "dismissed", note: "Not worth pursuing." }, "2"), row(event, "1")]);
    expect(actions[0].status).toBe("active");
    expect(actions[0].history[1].note).toBe("Not worth pursuing.");
  });
  it("stores a completed outcome and analysis evidence atomically", () => {
    const record = actionRecord({ ...event, status: "completed", note: "Unknown after reviewing public reports." });
    const payload = JSON.parse(record.extracted_text);
    expect(record.source_type).toBe("evidence_response");
    expect(payload.response.answer).toBe(payload.workbenchAction.note);
    expect(payload.response.confidence).toBe("needs_verification");
  });
  it("keeps intention separate from verified proof", () => {
    const payload = JSON.parse(actionRecord({ ...event, kind: "goal", note: "Explore building my own company." }).extracted_text);
    expect(payload.response.sourceNote).toContain("User intention");
  });
  it("ignores unrelated evidence and corrupt or unsupported history", () => {
    expect(assembleActions([{ ...row(event, "1"), extracted_text: "broken" }, { ...row(event, "2"), extracted_text: JSON.stringify({ response: {} }) }, { ...row(event, "3"), extracted_text: JSON.stringify({ workbenchAction: { ...event, version: 2 } }) }])).toEqual([]);
  });
  it("requires identity for outcomes and bounds captured input", () => {
    expect(workInput.safeParse({ operation: "outcome" }).success).toBe(false);
    expect(workInput.safeParse({ operation: "create", title: "x" }).success).toBe(false);
    expect(workInput.safeParse({ operation: "capture", note: "short" }).success).toBe(false);
    expect(workInput.safeParse({ operation: "capture", note: "x".repeat(12001) }).success).toBe(false);
  });
});

it("keeps source-only and conclusion-only outcomes in the evidence history", () => {
  const source = actionRecord({ ...event, sourceUrl: "https://example.org/report" });
  expect(source.source_type).toBe("evidence_response");
  expect(JSON.parse(source.extracted_text).response.answer).toContain("not independently reviewed");
  const unknown = actionRecord({ ...event, status: "completed", conclusion: "unknown" });
  expect(JSON.parse(unknown.extracted_text).response.answer).toContain("insufficient information");
  const restored = assembleActions([{ ...source, id: "source", created_at: "2026-10-20" }]);
  expect(restored[0].history[0].sourceUrl).toBe("https://example.org/report");
});
