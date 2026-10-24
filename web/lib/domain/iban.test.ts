import { describe, expect, it } from "vitest";

import { formatIban, isValidIban, normalizeIban } from "./iban";

const USD = "TR420020500009383693300102";
const EUR = "TR690020500009383693300101";

describe("isValidIban", () => {
  it("accepts our real Kuveyt Türk IBANs, spaced or not", () => {
    expect(isValidIban(USD)).toBe(true);
    expect(isValidIban(EUR)).toBe(true);
    expect(isValidIban("TR42 0020 5000 0938 3693 3001 02")).toBe(true);
    expect(isValidIban("tr42 0020 5000 0938 3693 3001 02")).toBe(true);
  });

  it("accepts IBANs of other countries", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
    expect(isValidIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(isValidIban("GB29NWBK60161331926819")).toBe(true);
  });

  it("rejects any single changed digit (checksum)", () => {
    for (let i = 2; i < USD.length; i++) {
      const digit = USD[i] === "9" ? "0" : String(Number(USD[i]) + 1);
      const changed = USD.slice(0, i) + digit + USD.slice(i + 1);
      expect(isValidIban(changed), changed).toBe(false);
    }
  });

  it("rejects swapped neighbours, wrong lengths and junk", () => {
    expect(isValidIban("TR420020500009383693301002")).toBe(false);
    expect(isValidIban(USD.slice(0, -1))).toBe(false);
    expect(isValidIban(`${USD}0`)).toBe(false);
    expect(isValidIban("")).toBe(false);
    expect(isValidIban("TR42-0020-5000-ABCD")).toBe(false);
    expect(isValidIban("4200205000093836933001TR")).toBe(false);
  });
});

describe("formatIban / normalizeIban", () => {
  it("groups by four and strips spaces", () => {
    expect(formatIban(USD)).toBe("TR42 0020 5000 0938 3693 3001 02");
    expect(normalizeIban(" tr42 0020 5000 0938 3693 3001 02 ")).toBe(USD);
  });
});
