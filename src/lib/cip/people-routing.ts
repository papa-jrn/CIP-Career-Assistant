export type PeopleView = "connections" | "follow-ups";

export function peopleView(value: string | null): PeopleView {
  return value === "follow-ups" ? "follow-ups" : "connections";
}

/** Keep confirmations and Workbench return context when retiring old URLs. */
export function legacyPeopleDestination(url: URL, view: PeopleView): string {
  const params = new URLSearchParams(url.search);
  params.set("view", view);
  return `/people?${params.toString()}${url.hash}`;
}