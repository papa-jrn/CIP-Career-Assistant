/**
 * Suite-wide guarantee (AGENTS.md testing discipline): the test suite NEVER reaches a live AI
 * provider, even on a developer machine whose .env holds real keys.
 *
 * Why this exists: Vitest loads .env files into import.meta.env, so a real OPENAI_API_KEY is
 * visible to every module under test. `vi.stubEnv("OPENAI_API_KEY", "")` only patches the value
 * until `vi.unstubAllEnvs()` — loop-repair.test.ts stubbed at module scope but unstubs in
 * afterEach, so its advisor tests re-saw the real key after the first test and attempted live
 * OpenAI calls that timed out (and billed). Stripping the provider keys here closes that hole
 * for every file. Tests that exercise a configured path inject their own fake keys explicitly
 * (the existing pattern: loadJobSearchConfig readers with "sk-test", createOpenAiProvider("k")).
 */
for (const key of ["OPENAI_API_KEY", "OPENAI_BUSINESS_SEARCH_MODEL"]) {
  delete (import.meta.env as Record<string, unknown>)[key];
  delete process.env[key];
}
// OPENAI_MODEL may legitimately be stubbed per-file (loop-repair uses "test-model"); strip only
// the credential so no live call is possible, leaving model-name stubbing to the tests.
delete process.env.OPENAI_API_KEY;
