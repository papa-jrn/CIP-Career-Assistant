import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const page = readFileSync(new URL("./opportunities.astro", import.meta.url), "utf8");
const script = page.match(/<script is:inline>([\s\S]*?)<\/script>/)![1];
function browser() {
  const handlers = new Map<string, (event: unknown) => void>();
  const button = { disabled: true };
  const indicator = { classList: { remove: vi.fn() } };
  const result = { textContent: "" };
  const form = {
    classList: { remove: vi.fn() },
    closest: () => form,
    querySelectorAll: (selector: string) => selector === "button" ? [button] : [indicator],
    getAttribute: (name: string) => name === "data-timeout-seconds" ? "55" : "#result",
    dispatchEvent: vi.fn(),
  };
  runInNewContext(script, {
    document: { getElementById: () => ({ open: false }), querySelectorAll: () => [], querySelector: () => result, body: { addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback) } },
    window: { addEventListener: () => {}, setTimeout }, location: { hash: "" }, setTimeout, clearTimeout, WeakMap, Event,
  });
  return { handlers, form, button, indicator, result, event: { detail: { elt: form } } };
}
afterEach(() => vi.useRealTimers());
describe("Opportunities job-request progress", () => {
  it("aborts and clears a stuck indicator without depending on a global htmx object", () => {
    vi.useFakeTimers();
    const ui = browser();
    ui.handlers.get("htmx:beforeRequest")!(ui.event);
    vi.advanceTimersByTime(55_000);
    expect(ui.form.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "htmx:abort", bubbles: true }));
    expect(ui.button.disabled).toBe(false);
    expect(ui.indicator.classList.remove).toHaveBeenCalledWith("htmx-request");
    expect(ui.result.textContent).toContain("reload");
  });
  it("clears the watchdog on completion and does not overwrite a finished request", () => {
    vi.useFakeTimers();
    const ui = browser();
    ui.handlers.get("htmx:beforeRequest")!(ui.event);
    ui.handlers.get("htmx:afterRequest")!(ui.event);
    vi.advanceTimersByTime(60_000);
    expect(ui.form.dispatchEvent).not.toHaveBeenCalled();
    expect(ui.result.textContent).toBe("");
    expect(ui.button.disabled).toBe(false);
  });
});
