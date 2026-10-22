import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  dedupeContacts,
  isExcludedByFeedback,
  isSpecificPerson,
  parseCsv,
  parseCsvContacts,
  parseContactText,
  parseXlsxContacts,
  readZipEntries,
} from "./network-intelligence";

/**
 * The parsers that meet a stranger's export first.
 *
 * `Next Steps.md` is blunt that shipping these untested is how a beta burns its
 * first users: they run on whatever a real LinkedIn archive, a hand-edited
 * spreadsheet, or a mangled CSV happens to contain. Until now none of them had
 * a single test.
 */

describe("CSV parsing", () => {
  it("reads quoted fields containing commas, quotes and newlines", () => {
    const csv = 'Name,Company\n"Lee, Jordan","Acme, ""The"" Co."\n"Sam\nRivera",Hospital\n';
    const rows = parseCsv(csv);
    expect(rows[1]).toEqual(["Lee, Jordan", 'Acme, "The" Co.']);
    expect(rows[2][0]).toBe("Sam\nRivera");
  });

  it("handles CRLF, bare CR, and a missing trailing newline", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("a,b\rc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("drops blank rows without dropping rows that are merely sparse", () => {
    const rows = parseCsv("a,b\n\n , \nc,\n");
    expect(rows).toEqual([["a", "b"], ["c", ""]]);
  });

  it("survives an empty file and a header-only file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsvContacts("Name,Company\n", "test")).toEqual([]);
  });
});

describe("LinkedIn-shaped CSV exports", () => {
  // LinkedIn puts a notes preamble above the real header row.
  const linkedin = [
    "Notes:",
    '"When exporting your connection data, you may notice..."',
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    "Jordan,Lee,https://www.linkedin.com/in/jordanlee,,Regional Hospital,Director of Nursing,15 Mar 2024",
    "Sam,Rivera,,sam@example.com,Granite Trust,Program Manager,02 Jan 2023",
  ].join("\n");

  it("finds the header row below a preamble", () => {
    const contacts = parseCsvContacts(linkedin, "LinkedIn");
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toMatchObject({ name: "Jordan Lee", company: "Regional Hospital", title: "Director of Nursing" });
  });

  it("joins first and last name when there is no full-name column", () => {
    expect(parseCsvContacts(linkedin, "LinkedIn")[1].name).toBe("Sam Rivera");
  });

  it("keeps a contact that has an email but no company", () => {
    const csv = "First Name,Last Name,Email Address,Company\nPat,Doe,pat@example.com,\n";
    expect(parseCsvContacts(csv, "LinkedIn")[0]).toMatchObject({ name: "Pat Doe", email: "pat@example.com" });
  });

  it("drops a row with a name and nothing else, which cannot be acted on", () => {
    const csv = "First Name,Last Name,Company,Position\nPat,Doe,,\n";
    expect(parseCsvContacts(csv, "LinkedIn")).toEqual([]);
  });

  it("returns nothing when no header row can be identified", () => {
    expect(parseCsvContacts("alpha,beta\n1,2\n", "LinkedIn")).toEqual([]);
  });

  it("does not crash on rows shorter than the header", () => {
    const csv = "First Name,Last Name,Company,Position\nPat,Doe,Acme\n";
    expect(() => parseCsvContacts(csv, "LinkedIn")).not.toThrow();
  });
});

describe("XLSX parsing", () => {
  /** A minimal but real .xlsx: a ZIP of the two parts the parser reads. */
  function workbook(rows: string[][]) {
    const shared: string[] = [];
    const index = (value: string) => {
      const found = shared.indexOf(value);
      if (found >= 0) return found;
      shared.push(value);
      return shared.length - 1;
    };
    const sheetRows = rows
      .map((row, r) => {
        const cells = row
          .map((value, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="s"><v>${index(value)}</v></c>`)
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`;
    const sharedXml = `<?xml version="1.0"?><sst>${shared.map((value) => `<si><t>${value}</t></si>`).join("")}</sst>`;
    return zip([
      ["xl/worksheets/sheet1.xml", Buffer.from(sheetXml, "utf8")],
      ["xl/sharedStrings.xml", Buffer.from(sharedXml, "utf8")],
    ]);
  }

  it("reads contacts out of a workbook", () => {
    const bytes = workbook([
      ["Name", "Company", "Position"],
      ["Jordan Lee", "Regional Hospital", "Director of Nursing"],
      ["Sam Rivera", "Granite Trust", "Program Manager"],
    ]);
    const { contacts, rowCount } = parseXlsxContacts(bytes, "Spreadsheet");
    expect(contacts.map((contact) => contact.name)).toEqual(["Jordan Lee", "Sam Rivera"]);
    // rowCount reports contact rows, not sheet rows: the header is not a contact.
    expect(rowCount).toBe(2);
  });

  it("returns nothing rather than throwing for a file that is not a workbook", () => {
    expect(() => parseXlsxContacts(Buffer.from("not a zip at all"), "Spreadsheet")).not.toThrow();
    expect(parseXlsxContacts(Buffer.from("not a zip at all"), "Spreadsheet").contacts).toEqual([]);
  });
});

/** Build a ZIP (stored or deflated) the readers can walk. */
function zip(files: Array<[string, Buffer]>, { deflate = true } = {}) {
  const chunks: Buffer[] = [];
  for (const [name, content] of files) {
    const body = deflate ? deflateRawSync(content) : content;
    const nameBytes = Buffer.from(name, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(deflate ? 8 : 0, 8);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    chunks.push(header, nameBytes, body);
  }
  return Buffer.concat(chunks);
}

describe("ZIP reading and its limits", () => {
  it("reads the files it is asked for and ignores the rest", () => {
    const bytes = zip([
      ["Connections.csv", Buffer.from("Name,Company\nJordan Lee,Acme\n", "utf8")],
      ["Profile.pdf", Buffer.from("binary", "utf8")],
    ]);
    const entries = readZipEntries(bytes);
    expect(entries.map((entry) => entry.name)).toEqual(["Connections.csv"]);
    expect(entries[0].text).toContain("Jordan Lee");
  });

  it("reads stored (uncompressed) entries too", () => {
    const bytes = zip([["Connections.csv", Buffer.from("Name,Company\nPat Doe,Acme\n", "utf8")]], { deflate: false });
    expect(readZipEntries(bytes)[0].text).toContain("Pat Doe");
  });

  it("refuses a zip bomb instead of inflating it into memory", () => {
    // ~40 MB of zeros compresses to a few KB. The reader caps output during
    // inflation, so the declared size being attacker-controlled does not matter.
    const bomb = zip([["Connections.csv", Buffer.alloc(40_000_000, 0)]]);
    const entries = readZipEntries(bomb);
    expect(entries).toEqual([]);
  });

  it("stops after the entry ceiling rather than walking an endless archive", () => {
    const many: Array<[string, Buffer]> = Array.from({ length: 60 }, (_, i) => [
      `file${i}.csv`,
      Buffer.from(`Name\nPerson ${i}\n`, "utf8"),
    ]);
    expect(readZipEntries(zip(many)).length).toBeLessThanOrEqual(40);
  });

  it("keeps reading after a corrupt entry", () => {
    const good = Buffer.from("Name,Company\nPat Doe,Acme\n", "utf8");
    const bytes = Buffer.concat([
      zip([["broken.csv", Buffer.from("not deflate data", "utf8")]], { deflate: false }).subarray(0, 40),
      zip([["Connections.csv", good]]),
    ]);
    expect(() => readZipEntries(bytes)).not.toThrow();
  });

  it("returns nothing for input that is not a ZIP", () => {
    expect(readZipEntries(Buffer.from("plain text, definitely not a zip"))).toEqual([]);
    expect(readZipEntries(Buffer.alloc(0))).toEqual([]);
  });
});

describe("contact dedupe", () => {
  const contact = (over: Partial<Parameters<typeof dedupeContacts>[0][number]> = {}) => ({
    name: "Jordan Lee",
    company: "Regional Hospital",
    title: "Director of Nursing",
    profileUrl: "",
    email: "",
    connectedOn: "",
    source: "LinkedIn",
    notes: "",
    ...over,
  });

  it("collapses the same person imported twice", () => {
    expect(dedupeContacts([contact(), contact()])).toHaveLength(1);
  });

  it("ignores case and punctuation differences", () => {
    expect(dedupeContacts([contact(), contact({ name: "jordan  lee!", company: "Regional Hospital" })])).toHaveLength(1);
  });

  it("keeps two different people with the same employer", () => {
    expect(dedupeContacts([contact(), contact({ name: "Sam Rivera" })])).toHaveLength(2);
  });

  it("keeps the same name at different employers, who may be different people", () => {
    expect(dedupeContacts([contact(), contact({ company: "Granite Trust" })])).toHaveLength(2);
  });

  it("drops an entry with nothing to identify it", () => {
    expect(dedupeContacts([contact({ name: "", company: "", title: "", profileUrl: "", email: "" })])).toEqual([]);
  });

  it("keeps the first occurrence, not the last", () => {
    const [kept] = dedupeContacts([contact({ title: "First" }), contact({ title: "Second" })]);
    expect(kept.title).toBe("First");
  });
});

describe("telling a person from an organisation", () => {
  const row = (name: string) => ({
    name,
    company: "",
    title: "",
    profileUrl: "",
    email: "",
    connectedOn: "",
    source: "LinkedIn",
    notes: "",
  });

  it("accepts an ordinary person", () => {
    expect(isSpecificPerson(row("Jordan Lee"))).toBe(true);
    expect(isSpecificPerson(row("Mary-Jane O'Brien"))).toBe(true);
  });

  it("rejects a single token and placeholder rows", () => {
    expect(isSpecificPerson(row("Jordan"))).toBe(false);
    expect(isSpecificPerson(row("unknown"))).toBe(false);
  });

  it("rejects organisation-shaped rows for anyone, not just one founder's", () => {
    // "dartmouth health" used to be blocklisted by name, so only his export was
    // protected from an organisation row being treated as a person.
    for (const name of [
      "Brattleboro Memorial Hospital",
      "Green Mountain Foundation",
      "Riverside Chamber of Commerce",
      "Acme Holdings LLC",
      "State University",
    ]) {
      expect(isSpecificPerson(row(name))).toBe(false);
    }
  });
});

describe("feedback exclusions", () => {
  const contact = { name: "Jordan Lee", company: "Regional Hospital", title: "", profileUrl: "", email: "", connectedOn: "", source: "LinkedIn", notes: "" };
  const feedback = (over = {}) => [{ contactName: "Jordan Lee", feedbackType: "remove", note: "", createdAt: "2026-10-01" } as never, ...[]].map((item) => ({ ...(item as object), ...over })) as never;

  it("excludes a contact the user removed", () => {
    expect(isExcludedByFeedback(contact, feedback())).toBe(true);
  });

  it("excludes every decision that means do not surface this person", () => {
    for (const feedbackType of ["remove", "deceased", "no_memory", "retired", "ethical_concern"]) {
      expect(isExcludedByFeedback(contact, feedback({ feedbackType }))).toBe(true);
    }
  });

  it("does not exclude a decision that only parks or reviews someone", () => {
    for (const feedbackType of ["use_now", "follow_up", "park", "too_cold", "context"]) {
      expect(isExcludedByFeedback(contact, feedback({ feedbackType }))).toBe(false);
    }
  });

  it("does not exclude a different person", () => {
    expect(isExcludedByFeedback(contact, feedback({ contactName: "Sam Rivera" }))).toBe(false);
  });

  it("ignores a feedback record with no contact name rather than excluding everyone", () => {
    expect(isExcludedByFeedback(contact, feedback({ contactName: "" }))).toBe(false);
  });
});

describe("pasted contact text", () => {
  it("reads pipe-delimited lines", () => {
    const contacts = parseContactText("Jordan Lee | Regional Hospital | Director of Nursing", "Pasted");
    expect(contacts[0]).toMatchObject({ name: "Jordan Lee", company: "Regional Hospital", title: "Director of Nursing" });
  });

  it("reads comma-delimited lines and picks a URL and an email out of any column", () => {
    const contacts = parseContactText("Sam Rivera,Granite Trust,Program Manager,https://example.org/sam,sam@example.com", "Pasted");
    expect(contacts[0]).toMatchObject({
      name: "Sam Rivera",
      company: "Granite Trust",
      profileUrl: "https://example.org/sam",
      email: "sam@example.com",
    });
  });

  it("skips a header line", () => {
    expect(parseContactText("Name, Company\nJordan Lee, Regional Hospital", "Pasted")).toHaveLength(1);
  });

  // Pinning real behaviour, not endorsing it: a prose line has no delimiter, so
  // only a name is found and the row is dropped as unusable. The parser
  // produces nothing rather than inventing a company from the sentence, which
  // is the right trade, but pasted prose silently yields no contacts.
  it("yields nothing for undelimited prose instead of guessing", () => {
    expect(parseContactText("Jordan Lee - Director of Nursing at Regional Hospital", "Pasted")).toEqual([]);
  });

  it("returns nothing for empty input rather than throwing", () => {
    expect(() => parseContactText("", "Pasted")).not.toThrow();
    expect(parseContactText("", "Pasted")).toEqual([]);
  });
});
