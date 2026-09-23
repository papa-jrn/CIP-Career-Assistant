/**
 * Pay normalization for job postings (Rethink §14: compare known pay on compatible periods; unknown
 * stays unknown). Pure functions over the pay text a posting states.
 *
 * Founder decision, 2026-09-23: a stated HOURLY rate is converted to an annual estimate assuming a
 * full-time year (40 hours x 52 weeks = 2,080 hours), e.g. $35/hour is about $72,800. The result is
 * always labeled an estimate. Stated weekly hours are honored; "part-time" with no hours, monthly,
 * and vague pay ("Please Inquire", "commensurate with experience") stay unknown.
 */

export const FULL_TIME_HOURS_PER_YEAR = 2080;

export type PayBasis = "annual" | "hourly_estimated" | "unknown";

export interface PayEstimate {
  basis: PayBasis;
  minAnnualUsd: number | null;
  maxAnnualUsd: number | null;
  /** Plain-language description of how the figure was derived. */
  note: string;
}

const UNKNOWN = (note: string): PayEstimate => ({ basis: "unknown", minAnnualUsd: null, maxAnnualUsd: null, note });

const HOURLY_CUE = /(\/\s*h(?:ou)?r\b|\bper\s+hour\b|\ban\s+hour\b|\bhourly\b|\/\s*hour\b)/i;
const ANNUAL_CUE = /(\/\s*(?:yr|year)\b|\bper\s+year\b|\ba\s+year\b|\bannual(?:ly)?\b|\bper\s+annum\b|\bsalary\b)/i;
const MONTHLY_CUE = /(\/\s*(?:mo|month)\b|\bper\s+month\b|\bmonthly\b)/i;
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kK])?/g;

export function estimateAnnualPay(text: string | null | undefined): PayEstimate {
  const raw = (text ?? "").trim();
  if (!raw) return UNKNOWN("No pay was stated.");

  const figures: Array<{ value: number; index: number }> = [];
  for (const match of raw.matchAll(MONEY)) {
    const base = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    figures.push({ value: match[2] ? base * 1000 : base, index: match.index ?? 0 });
  }
  if (!figures.length) return UNKNOWN("No dollar amount was stated.");

  if (MONTHLY_CUE.test(raw)) return UNKNOWN("Pay is stated per month; it is not converted.");

  const hourly = HOURLY_CUE.test(raw) || (!ANNUAL_CUE.test(raw) && figures.every((figure) => figure.value < 500) && /hour/i.test(raw));
  const values = figures.map((figure) => figure.value);

  if (hourly) {
    if (values.some((value) => value <= 0 || value >= 1000)) return UNKNOWN("The hourly figure looks inconsistent, so it was not converted.");
    const weekly = /(\d{1,2}(?:\.\d+)?)\s*(?:hours|hrs)\s*(?:per|a|\/)\s*week/i.exec(raw);
    const partTime = /part[- ]?time/i.test(raw);
    let hoursPerYear = FULL_TIME_HOURS_PER_YEAR;
    let assumption = "assuming full time (40 hours x 52 weeks)";
    if (weekly) {
      const hours = Number(weekly[1]);
      if (!(hours > 0 && hours <= 80)) return UNKNOWN("The weekly hours look inconsistent, so pay was not converted.");
      hoursPerYear = hours * 52;
      assumption = `at the stated ${hours} hours a week x 52 weeks`;
    } else if (partTime) {
      return UNKNOWN("Hourly pay for a part-time role with no hours stated; it cannot be turned into a yearly figure.");
    }
    const low = Math.min(...values);
    const high = Math.max(...values);
    const min = Math.round(low * hoursPerYear);
    const max = Math.round(high * hoursPerYear);
    const rate = low === high ? `$${trimNumber(low)}/hour` : `$${trimNumber(low)}-$${trimNumber(high)}/hour`;
    return {
      basis: "hourly_estimated",
      minAnnualUsd: min,
      maxAnnualUsd: max,
      note: `Estimated from ${rate} ${assumption}.`,
    };
  }

  const annual = values.filter((value) => value >= 10_000 && value <= 2_000_000);
  if (!annual.length) return UNKNOWN("The stated amount could not be read as a yearly salary.");

  // "Minimum $129,500; maximum commensurate" states only a floor for the posting's range.
  if (annual.length === 1) {
    const figure = figures.find((item) => item.value === annual[0]);
    const before = raw.slice(Math.max(0, (figure?.index ?? 0) - 30), figure?.index ?? 0);
    if (/(minimum|starting( at)?|from)\W*$/i.test(before)) {
      return { basis: "annual", minAnnualUsd: annual[0], maxAnnualUsd: null, note: "Only the low end of the range is stated." };
    }
    if (/(maximum|up to)\W*$/i.test(before)) {
      return { basis: "annual", minAnnualUsd: null, maxAnnualUsd: annual[0], note: "Only the high end of the range is stated." };
    }
  }
  return { basis: "annual", minAnnualUsd: Math.min(...annual), maxAnnualUsd: Math.max(...annual), note: "Stated as a yearly salary." };
}

export type FloorStatus = "meets" | "below" | "straddles" | "unknown";

export interface FloorComparison {
  status: FloorStatus;
  note: string;
}

/** Compares a pay estimate to the user's explicit salary floor. Never invents a missing bound. */
export function compareToFloor(pay: PayEstimate, floorUsd: number | null): FloorComparison {
  if (floorUsd === null) return { status: "unknown", note: "No salary minimum is set." };
  const { minAnnualUsd: min, maxAnnualUsd: max } = pay;
  if (min === null && max === null) return { status: "unknown", note: "Pay is not stated in a form that can be compared." };
  const floor = `$${floorUsd.toLocaleString("en-US")}`;
  if (max !== null && max < floorUsd) return { status: "below", note: `Below your ${floor} minimum.` };
  if (min !== null && min >= floorUsd) return { status: "meets", note: `Meets your ${floor} minimum.` };
  if (min !== null && max !== null) return { status: "straddles", note: `The range spans your ${floor} minimum.` };
  if (min !== null) return { status: "unknown", note: `Starts below your ${floor} minimum; the top of the range is not stated.` };
  return { status: "unknown", note: `Top of range is at least your ${floor} minimum, but the low end is not stated.` };
}

/** A short display line, e.g. "about $72,800 a year (estimated from $35/hour ...). Below your $85,000 minimum." */
export function describePay(text: string | null | undefined, floorUsd: number | null): string {
  const pay = estimateAnnualPay(text);
  if (pay.basis === "unknown") return "";
  const money = (value: number) => `$${value.toLocaleString("en-US")}`;
  const range =
    pay.minAnnualUsd !== null && pay.maxAnnualUsd !== null && pay.minAnnualUsd !== pay.maxAnnualUsd
      ? `${money(pay.minAnnualUsd)} to ${money(pay.maxAnnualUsd)} a year`
      : pay.minAnnualUsd !== null && pay.maxAnnualUsd === null
        ? `${money(pay.minAnnualUsd)} a year or more`
        : `about ${money((pay.minAnnualUsd ?? pay.maxAnnualUsd) as number)} a year`;
  const comparison = compareToFloor(pay, floorUsd);
  return pay.basis === "hourly_estimated"
    ? `${range} (estimate). ${pay.note} ${comparison.status === "unknown" ? "" : comparison.note}`.trim()
    : `${range}. ${comparison.status === "unknown" ? "" : comparison.note}`.trim();
}

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
