import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import { normalizeUrl } from "@/lib/cip/job-search-engine";
import {
  clearDisposition,
  dispositionKeys,
  indexDispositions,
  loadDispositions,
  matchDisposition,
  setDisposition,
} from "@/lib/cip/posting-dispositions";

const USER = "user-1";
const NOW = "2026-09-23T12:00:00.000Z";
const now = () => NOW;

const postingA = { source_url: "https://jobs.example.org/postings/9?utm=x", employer_text: "Nonprofit Co", requisition_id: "R-9" };

describe("dispositionKeys", () => {
  it("normalizes the URL and builds an employer+requisition key", () => {
    const keys = dispositionKeys(postingA);
    expect(keys.normalizedUrl).toBe(normalizeUrl(postingA.source_url));
    expect(keys.employerKey).toBe("nonprofit co");
    expect(keys.reqKey).toBe("nonprofit co|r-9");
  });
});

describe("setDisposition / loadDispositions", () => {
  it("inserts a status, then updates in place on a second set (one row per posting identity)", async () => {
    const { client, db } = createFakeSupabase();
    await setDisposition(client, USER, postingA, "watching", "keep an eye on this", now);
    expect(db.posting_dispositions).toHaveLength(1);
    expect(db.posting_dispositions[0]).toMatchObject({ status: "watching", note: "keep an eye on this", employer_key: "nonprofit co" });

    await setDisposition(client, USER, postingA, "applied", "", now);
    expect(db.posting_dispositions).toHaveLength(1); // still one row
    expect(db.posting_dispositions[0].status).toBe("applied");

    const rows = await loadDispositions(client, USER);
    expect(rows).toHaveLength(1);
  });
});

describe("matchDisposition", () => {
  it("matches by normalized URL, and falls back to employer+requisition when the URL changed", async () => {
    const { client } = createFakeSupabase();
    await setDisposition(client, USER, postingA, "watching", "", now);
    const index = indexDispositions(await loadDispositions(client, USER));

    // Same posting, differently-decorated URL → matches by normalized URL.
    expect(matchDisposition({ ...postingA, source_url: "https://jobs.example.org/postings/9" }, index)?.status).toBe("watching");
    // The posting re-appeared at a new URL but same employer + requisition → matches by req key.
    expect(matchDisposition({ source_url: "https://jobs.example.org/new-path/9", employer_text: "Nonprofit Co", requisition_id: "R-9" }, index)?.status).toBe("watching");
    // An unrelated posting → no match.
    expect(matchDisposition({ source_url: "https://other.org/1", employer_text: "Other", requisition_id: "Z-1" }, index)).toBeNull();
  });
});

describe("clearDisposition", () => {
  it("removes the user's status", async () => {
    const { client, db } = createFakeSupabase();
    await setDisposition(client, USER, postingA, "passed", "", now);
    expect(db.posting_dispositions).toHaveLength(1);
    await clearDisposition(client, USER, postingA);
    expect(db.posting_dispositions).toHaveLength(0);
  });
});
