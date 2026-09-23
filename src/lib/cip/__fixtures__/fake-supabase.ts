import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal in-memory stand-in for the parts of the Supabase query builder the app uses, so
 * orchestration logic (idempotency, claims, failure handling) can be tested without a database.
 * Tests only: it implements just the methods this codebase calls, plus the two unique indexes
 * on job_search_runs.
 */

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const RUN_DEFAULTS = (): Row => ({
  status: "queued",
  next_step: 0,
  plan: [],
  trace: [],
  coverage: [],
  usage: {},
  limits: {},
  estimated_cost_usd: null,
  cost_basis: "unavailable",
  summary: "",
  error: null,
  finished_at: null,
});

export function createFakeSupabase(seed: Db = {}) {
  const db: Db = { job_search_runs: [], job_search_observations: [], ...structuredClone(seed) };

  function uniqueViolation(table: string, incoming: Row, others: Row[]) {
    if (table !== "job_search_runs") return null;
    const clash = others.find(
      (row) =>
        row.user_id === incoming.user_id &&
        (row.idempotency_key === incoming.idempotency_key ||
          (["queued", "running"].includes(String(row.status)) && ["queued", "running"].includes(String(incoming.status)))),
    );
    return clash ? { message: "duplicate key value violates unique constraint" } : null;
  }

  class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> {
    private op: "select" | "insert" | "update" = "select";
    private filters: Array<(row: Row) => boolean> = [];
    private patch: Row = {};
    private inserted: Row[] = [];
    private orderBy: { column: string; ascending: boolean } | null = null;
    private max: number | null = null;
    private wantsCount = false;
    private headOnly = false;
    private mode: "many" | "single" | "maybe" = "many";

    constructor(private table: string) {}

    select(_columns?: string, options?: { count?: string; head?: boolean }) {
      this.wantsCount = options?.count === "exact";
      this.headOnly = Boolean(options?.head);
      return this;
    }
    insert(rows: Row | Row[]) {
      this.op = "insert";
      const list = Array.isArray(rows) ? rows : [rows];
      this.inserted = list.map((row) => ({
        id: crypto.randomUUID(),
        first_seen_at: new Date().toISOString(),
        ...(this.table === "job_search_runs" ? RUN_DEFAULTS() : {}),
        ...row,
      }));
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }
    neq(column: string, value: unknown) {
      this.filters.push((row) => row[column] !== value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }
    is(column: string, value: unknown) {
      this.filters.push((row) => (row[column] ?? null) === value);
      return this;
    }
    gt(column: string, value: number | string) {
      this.filters.push((row) => (row[column] as number | string) > value);
      return this;
    }
    gte(column: string, value: number | string) {
      this.filters.push((row) => (row[column] as number | string) >= value);
      return this;
    }
    order(column: string, options?: { ascending?: boolean }) {
      this.orderBy = { column, ascending: options?.ascending ?? true };
      return this;
    }
    limit(count: number) {
      this.max = count;
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }

    private run() {
      const rows = (db[this.table] ??= []);
      const matches = () => rows.filter((row) => this.filters.every((filter) => filter(row)));

      if (this.op === "insert") {
        for (const incoming of this.inserted) {
          const violation = uniqueViolation(this.table, incoming, rows);
          if (violation) return { data: null, error: violation };
          rows.push(incoming);
        }
        const data = this.mode === "many" ? this.inserted : this.inserted[0];
        return { data: structuredClone(data), error: null };
      }

      if (this.op === "update") {
        const updated = matches();
        for (const row of updated) Object.assign(row, this.patch);
        return { data: structuredClone(updated), error: null };
      }

      let found = matches();
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        found = [...found].sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      const count = found.length;
      if (this.max !== null) found = found.slice(0, this.max);
      if (this.headOnly) return { data: null, error: null, count };
      if (this.mode === "many") return { data: structuredClone(found), error: null, count: this.wantsCount ? count : undefined };
      if (this.mode === "maybe") return { data: found[0] ? structuredClone(found[0]) : null, error: null };
      return found[0]
        ? { data: structuredClone(found[0]), error: null }
        : { data: null, error: { message: "no rows" } };
    }

    then<TResult1, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  const client = { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
  return { client, db };
}
