import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes cells that need it", () => {
    expect(toCsv([["Name", "Notes"], ["Alice", 'Said "call back", later\nmaybe']])).toBe(
      'Name,Notes\r\nAlice,"Said ""call back"", later\nmaybe"\r\n',
    );
  });

  it("leaves numbers alone and blanks out missing values", () => {
    expect(toCsv([[-3, 0.25, null, undefined]])).toBe("-3,0.25,,\r\n");
  });

  it("defuses spreadsheet formulas in text", () => {
    expect(toCsv([["=HYPERLINK(1)", "+1", "@x", "-2"]])).toBe("'=HYPERLINK(1),'+1,'@x,'-2\r\n");
  });
});
