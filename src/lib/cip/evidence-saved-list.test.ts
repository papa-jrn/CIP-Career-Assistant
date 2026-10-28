import { describe, expect, it } from "vitest";
import {
  parseStoredEvidenceResponse,
  renderSavedEvidenceHtml,
  type EvidenceResponsePayload,
} from "./evidence-builder";

const response = (over: Partial<EvidenceResponsePayload> = {}): EvidenceResponsePayload => ({
  questionId: "q1",
  question: "What scope did you own?",
  answer: "Five engineering teams, no direct reports.",
  confidence: "needs_verification",
  proofUrl: "",
  sourceNote: "",
  ...over,
});

const stored = (payload: unknown) => JSON.stringify({ response: payload, saved_at: "2026-10-28T12:00:00.000Z" });

describe("the saved-evidence list", () => {
  it("says plainly when nothing is saved, rather than rendering an empty panel", () => {
    // An empty panel after a successful save reads as a failed save.
    expect(renderSavedEvidenceHtml([])).toContain("No evidence answers saved yet");
  });

  it("renders each saved answer with its question and confidence", () => {
    const html = renderSavedEvidenceHtml([response()]);
    expect(html).toContain("What scope did you own?");
    expect(html).toContain("Five engineering teams, no direct reports.");
    expect(html).toContain("needs verification");
  });

  it("keeps the order it is given, so newest-first stays newest-first", () => {
    const html = renderSavedEvidenceHtml([
      response({ question: "Newer" }),
      response({ question: "Older" }),
    ]);
    expect(html.indexOf("Newer")).toBeLessThan(html.indexOf("Older"));
  });

  it("escapes stored text, which is user input", () => {
    const html = renderSavedEvidenceHtml([
      response({ question: "<script>alert(1)</script>", answer: 'He said "no" & left' }),
    ]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;no&quot;");
    expect(html).toContain("&amp;");
  });

  it("does not fall over on a missing confidence", () => {
    const html = renderSavedEvidenceHtml([response({ confidence: undefined as never })]);
    expect(html).toContain("What scope did you own?");
  });
});

describe("reading a stored evidence row", () => {
  it("reads a row written by the save endpoint", () => {
    expect(parseStoredEvidenceResponse(stored(response()))?.question).toBe("What scope did you own?");
  });

  it("skips a row it cannot read rather than rendering a blank card", () => {
    expect(parseStoredEvidenceResponse(null)).toBeNull();
    expect(parseStoredEvidenceResponse("")).toBeNull();
    expect(parseStoredEvidenceResponse("not json")).toBeNull();
    expect(parseStoredEvidenceResponse(JSON.stringify({ nothing: true }))).toBeNull();
  });

  it("refuses a payload with no question or no answer", () => {
    // Either one missing would render a card that says nothing.
    expect(parseStoredEvidenceResponse(stored({ answer: "orphaned" }))).toBeNull();
    expect(parseStoredEvidenceResponse(stored({ question: "orphaned" }))).toBeNull();
  });

  it("round-trips through the renderer", () => {
    const parsed = parseStoredEvidenceResponse(stored(response({ question: "Round trip" })));
    expect(renderSavedEvidenceHtml([parsed!])).toContain("Round trip");
  });
});
