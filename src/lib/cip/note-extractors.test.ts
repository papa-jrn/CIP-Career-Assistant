import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  extractDocText,
  extractDocxText,
  extractJsonText,
  extractRtfText,
} from "./conversation-notes";

/**
 * Pulling text out of whatever file a user uploads their conversation notes in.
 *
 * These run on real documents written by real word processors, which is messier
 * than anything the app produces itself. The failure that matters is silent:
 * returning a mangled string that then gets read as evidence.
 */

function zipDocx(documentXml: string) {
  const name = Buffer.from("word/document.xml", "utf8");
  const content = Buffer.from(documentXml, "utf8");
  const body = deflateRawSync(content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name, body]);
}

describe("docx extraction", () => {
  it("reads paragraphs as separate lines", () => {
    const xml = "<w:document><w:body>"
      + "<w:p><w:r><w:t>Notes with Vince Berk.</w:t></w:r></w:p>"
      + "<w:p><w:r><w:t>He said stay away from large tech.</w:t></w:r></w:p>"
      + "</w:body></w:document>";
    const text = extractDocxText(zipDocx(xml));
    expect(text).toContain("Notes with Vince Berk.");
    expect(text).toContain("He said stay away from large tech.");
    expect(text.trim().split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("joins runs that a word processor split mid-sentence", () => {
    // Word splits a sentence across runs for spellcheck and formatting; naive
    // extraction loses the join and produces "stayaway".
    const xml = "<w:document><w:body><w:p>"
      + "<w:r><w:t>stay </w:t></w:r><w:r><w:t>away</w:t></w:r>"
      + "</w:p></w:body></w:document>";
    expect(extractDocxText(zipDocx(xml))).toContain("stay away");
  });

  it("turns tabs and line breaks into whitespace rather than dropping them", () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>a</w:t></w:r><w:tab/><w:r><w:t>b</w:t></w:r><w:br/><w:r><w:t>c</w:t></w:r></w:p></w:body></w:document>';
    const text = extractDocxText(zipDocx(xml));
    expect(text).toContain("a\tb");
    expect(text).toContain("\nc");
  });

  it("decodes XML entities so apostrophes and ampersands survive", () => {
    const xml = "<w:document><w:body><w:p><w:r><w:t>Jordan&apos;s team &amp; mine</w:t></w:r></w:p></w:body></w:document>";
    expect(extractDocxText(zipDocx(xml))).toContain("Jordan's team & mine");
  });

  it("returns nothing for a file that is not a docx, instead of throwing", () => {
    expect(() => extractDocxText(Buffer.from("just text"))).not.toThrow();
    expect(extractDocxText(Buffer.from("just text"))).toBe("");
    expect(extractDocxText(Buffer.alloc(0))).toBe("");
  });
});

describe("RTF extraction", () => {
  it("reads paragraphs out of a minimal RTF document", () => {
    const rtf = "{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Times;}}\\f0\\fs24 Notes with Vince Berk.\\par He said stay away.\\par}";
    const text = extractRtfText(rtf);
    expect(text).toContain("Notes with Vince Berk.");
    expect(text).toContain("He said stay away.");
  });

  it("drops font and colour tables rather than reading them as notes", () => {
    const rtf = "{\\rtf1{\\fonttbl{\\f0 Times New Roman;}{\\f1 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}Real content.\\par}";
    const text = extractRtfText(rtf);
    expect(text).toContain("Real content.");
    expect(text).not.toContain("Times New Roman");
    expect(text).not.toContain("colortbl");
  });

  it("drops metadata destination groups", () => {
    const rtf = "{\\rtf1{\\*\\generator Riched20 10.0;}Kept text.\\par}";
    const text = extractRtfText(rtf);
    expect(text).toContain("Kept text.");
    expect(text).not.toContain("Riched20");
  });

  it("decodes escaped characters and literal braces", () => {
    const rtf = "{\\rtf1 caf\\'e9 and \\{braces\\}\\par}";
    const text = extractRtfText(rtf);
    expect(text).toContain("café");
    expect(text).toContain("{braces}");
  });

  it("refuses anything that is not RTF rather than returning mangled text", () => {
    expect(extractRtfText("Plain text notes about a conversation.")).toBe("");
    expect(extractRtfText("")).toBe("");
  });
});

describe("JSON notes", () => {
  it("pretty-prints valid JSON so it reads as text", () => {
    const text = extractJsonText('{"contact":"Vince Berk","signal":"large tech contracting"}');
    expect(text).toContain("Vince Berk");
    expect(text.split("\n").length).toBeGreaterThan(1);
  });

  it("returns nothing for invalid JSON instead of passing the raw string through", () => {
    // Passing it through would store a broken fragment as if it were notes.
    expect(extractJsonText("{not valid json")).toBe("");
    expect(extractJsonText("")).toBe("");
  });
});

describe(".doc files", () => {
  it("declines a binary Word document rather than producing noise", () => {
    // Binary .doc starts with the OLE compound-file signature. Reading it as
    // text yields garbage that would be stored as a conversation.
    const ole = Buffer.alloc(16);
    ole.writeUInt32LE(0xe011cfd0, 0);
    expect(extractDocText(ole)).toBe("");
  });

  it("reads a .doc that is really plain text, which word processors do emit", () => {
    const text = extractDocText(Buffer.from("Notes with Vince Berk. Stay away from large tech.", "utf8"));
    expect(text).toContain("Vince Berk");
  });
});
