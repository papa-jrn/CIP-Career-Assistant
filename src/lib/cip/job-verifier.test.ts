import { afterEach, describe, expect, it, vi } from "vitest";

const fetchState = vi.hoisted(() => ({ timeoutMs: 0, options: null as Record<string, unknown> | null }));
vi.mock("@/lib/safe-fetch", () => ({
  fetchSafe: (_url: string, timeoutMs: number, options: Record<string, unknown>) => {
    fetchState.timeoutMs = timeoutMs;
    fetchState.options = options;
    return new Promise<never>(() => {});
  },
}));

import { judgeVerification, safePageFetcher } from "./job-verifier";

afterEach(() => vi.useRealTimers());

describe("safe posting page fetch deadline", () => {
  it("returns unavailable after ten seconds even if DNS or the body never completes", async () => {
    vi.useFakeTimers();
    const result = safePageFetcher("https://careers.example/jobs/123");
    expect(fetchState.timeoutMs).toBe(8_000);
    expect(fetchState.options).toMatchObject({ userAgent: expect.stringContaining("posting verifier") });
    await vi.advanceTimersByTimeAsync(10_000);
    const page = await result;
    expect(page).toMatchObject({ timedOut: true, status: 0 });
    expect(judgeVerification(page, { title: "Chief of Staff", sourceUrl: "https://careers.example/jobs/123" }, "2026-10-22T12:00:00.000Z")).toMatchObject({
      state: "verification_unavailable",
      note: expect.stringContaining("within 10 seconds"),
    });
  });
});
