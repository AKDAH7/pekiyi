import { describe, expect, it } from "vitest";

import { formatDecimal, parseLocaleDecimal } from "./number";

describe("formatDecimal", () => {
  it("formats per locale without float conversion", () => {
    expect(formatDecimal("1250", "tr")).toBe("1.250,00");
    expect(formatDecimal("1250", "en")).toBe("1,250.00");
    expect(formatDecimal("1250", "ar")).toBe("1,250.00");
    expect(formatDecimal("9999999999.99", "en")).toBe("9,999,999,999.99");
    expect(formatDecimal("49.123456", "tr", { minimumFractionDigits: 2, maximumFractionDigits: 6 })).toBe(
      "49,123456",
    );
    expect(formatDecimal(null, "tr")).toBe("");
  });
});

describe("parseLocaleDecimal", () => {
  it("reads each locale's own format", () => {
    expect(parseLocaleDecimal("1.250,50", "tr")).toBe("1250.50");
    expect(parseLocaleDecimal("1,250.50", "en")).toBe("1250.50");
    expect(parseLocaleDecimal("1250", "tr")).toBe("1250");
    expect(parseLocaleDecimal("0,8", "tr")).toBe("0.8");
  });

  it("treats a separator that can't be grouping as the decimal point", () => {
    expect(parseLocaleDecimal("1250.5", "tr")).toBe("1250.5");
    expect(parseLocaleDecimal("7750,25", "en")).toBe("7750.25");
    // Followed by exactly three digits, it is grouping in that locale.
    expect(parseLocaleDecimal("1.250", "tr")).toBe("1250");
    expect(parseLocaleDecimal("1.250", "en")).toBe("1.250");
  });

  it("accepts Arabic-Indic digits and separators", () => {
    expect(parseLocaleDecimal("١٬٢٥٠٫٥٠", "ar")).toBe("1250.50");
    expect(parseLocaleDecimal("1,250.50", "ar")).toBe("1250.50");
  });

  it("rejects non-numbers", () => {
    expect(parseLocaleDecimal("", "tr")).toBeNull();
    expect(parseLocaleDecimal("abc", "en")).toBeNull();
    expect(parseLocaleDecimal("1,2,3.4.5", "en")).toBeNull();
    expect(parseLocaleDecimal("1e5", "en")).toBeNull();
  });
});
