import { describe, expect, it } from "vitest";

import { countryName, countryOptions, isCountryCode } from "./countries";
import { companyNameKey, findDuplicates, similarCompanyNames } from "./duplicates";
import { formatPhone, normalizePhone, whatsappUrl } from "./phone";
import { foldSearchText } from "./text-fold";

describe("normalizePhone", () => {
  it("stores the seed's real numbers in E.164 however they were written", () => {
    expect(normalizePhone("+964 771 370 8155")).toBe("+9647713708155");
    expect(normalizePhone("+382 67 64 64 62")).toBe("+38267646462");
    expect(normalizePhone("+31 633999931")).toBe("+31633999931");
    expect(normalizePhone("+38971422106")).toBe("+38971422106");
    expect(normalizePhone("+972 59-829-9727")).toBe("+972598299727");
    expect(normalizePhone("+44 7775 966022")).toBe("+447775966022");
  });

  it("reads a leading 00 as the international prefix", () => {
    expect(normalizePhone("0031 6 33 99 99 31")).toBe("+31633999931");
  });

  it("reads national numbers in the customer's country", () => {
    expect(normalizePhone("0532 123 45 67", "TR")).toBe("+905321234567");
    expect(normalizePhone("06 33999931", "NL")).toBe("+31633999931");
    expect(normalizePhone("(0)6-339.999.31", "NL")).toBe("+31633999931");
  });

  it("an international number wins over the customer's country", () => {
    expect(normalizePhone("+90 532 123 45 67", "NL")).toBe("+905321234567");
  });

  it("rejects what can't be a phone number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("123", "TR")).toBeNull();
    expect(normalizePhone("0532 123 45 67")).toBeNull(); // national, but no country to read it in
    expect(normalizePhone("+90 532 123 45 67 89 01")).toBeNull();
  });
});

describe("formatPhone / whatsappUrl", () => {
  it("shows stored numbers in international format", () => {
    expect(formatPhone("+905321234567")).toBe("+90 532 123 45 67");
    expect(formatPhone("+31633999931")).toBe("+31 6 33999931");
  });

  it("shows anything unparseable as stored", () => {
    expect(formatPhone("ask the office")).toBe("ask the office");
  });

  it("builds wa.me links from digits only", () => {
    expect(whatsappUrl("+905321234567")).toBe("https://wa.me/905321234567");
    expect(whatsappUrl("+964 771 370 8155")).toBe("https://wa.me/9647713708155");
    expect(whatsappUrl("nothing")).toBeNull();
  });
});

describe("foldSearchText (Turkish-aware)", () => {
  it("folds Turkish letters in both cases to ASCII lower case", () => {
    expect(foldSearchText("ÖZBAY")).toBe("ozbay");
    expect(foldSearchText("Özbay")).toBe("ozbay");
    expect(foldSearchText("İKLİM")).toBe("iklim");
    expect(foldSearchText("IŞIK")).toBe("isik");
    expect(foldSearchText("ışık")).toBe("isik");
    expect(foldSearchText("ÇAĞDAŞ GÜNEŞ")).toBe("cagdas gunes");
    expect(foldSearchText("VİRONA")).toBe(foldSearchText("virona"));
  });
});

describe("company name matching", () => {
  it('"ÖZBAY" and "ozbay" are the same company', () => {
    expect(similarCompanyNames("ÖZBAY", "ozbay")).toBe(true);
    expect(similarCompanyNames("Özbay Mobilya Ltd. Şti.", "OZBAY")).toBe(true);
  });

  it("ignores spaces, punctuation, legal forms and the word furniture", () => {
    expect(companyNameKey("AL-SHAM FURNITURE")).toBe("alsham");
    expect(similarCompanyNames("AL-SHAM FURNITURE", "Al Sham")).toBe(true);
    expect(similarCompanyNames("HALA FURNITURE", "Hala Mobilya")).toBe(true);
    expect(similarCompanyNames("VİRONA FURNITURE", "virona furniture")).toBe(true);
  });

  it("catches a one-letter typo and a name extended with more words", () => {
    expect(similarCompanyNames("GRAND DIZAJN", "GRAND DIZAYN")).toBe(true);
    expect(similarCompanyNames("GRAND DIZAJN", "Grand")).toBe(true);
  });

  it("does not match different companies", () => {
    expect(similarCompanyNames("HALA FURNITURE", "HARI")).toBe(false);
    expect(similarCompanyNames("EIRFAN", "JIAN SMART ROIM")).toBe(false);
    expect(similarCompanyNames("ABC", "ABD")).toBe(false); // short names must match exactly
    expect(similarCompanyNames("Furniture Co", "Mobilya Ltd")).toBe(false);
  });
});

describe("findDuplicates", () => {
  const existing = [
    { id: "hala", companyName: "HALA FURNITURE", email: "halawonen@gmail.com", phone: "+31 633999931", whatsapp: null },
    { id: "ozbay", companyName: "ÖZBAY", email: null, phone: null, whatsapp: "+905321234567" },
    { id: "hari", companyName: "HARI", email: null, phone: "+38971422106", whatsapp: null },
  ];

  it("reports every reason a customer matches", () => {
    const matches = findDuplicates(
      { companyName: "Hala Wonen", email: " HalaWonen@Gmail.com ", phone: "+31633999931", whatsapp: null },
      existing,
    );
    expect(matches).toEqual([{ customer: existing[0], reasons: ["email", "phone"] }]);
  });

  it("matches phone against WhatsApp and old unnormalized numbers", () => {
    const matches = findDuplicates(
      { companyName: "Someone", email: null, phone: null, whatsapp: "+31633999931" },
      existing,
    );
    expect(matches.map((match) => match.customer.id)).toEqual(["hala"]);
    expect(
      findDuplicates({ companyName: "X Y Z", email: null, phone: "+905321234567", whatsapp: null }, existing)[0]
        .reasons,
    ).toEqual(["phone"]);
  });

  it("matches a Turkish name typed without Turkish letters", () => {
    const matches = findDuplicates({ companyName: "ozbay", email: null, phone: null, whatsapp: null }, existing);
    expect(matches).toEqual([{ customer: existing[1], reasons: ["name"] }]);
  });

  it("finds nothing for a genuinely new customer", () => {
    expect(
      findDuplicates({ companyName: "NEW BUYER", email: "buyer@example.com", phone: "+33612345678", whatsapp: null }, existing),
    ).toEqual([]);
  });
});

describe("countries", () => {
  it("knows ISO codes, including Kosovo, and names them in the UI language", () => {
    expect(isCountryCode("NL")).toBe(true);
    expect(isCountryCode("XK")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(countryName("NL", "en")).toBe("Netherlands");
    expect(countryName("NL", "tr")).toBe("Hollanda");
    expect(countryName("NL", "ar")).toBe("هولندا");
  });

  it("sorts options by name in the UI language", () => {
    const tr = countryOptions("tr").map((option) => option.name);
    expect(tr.indexOf("Çin")).toBeLessThan(tr.indexOf("Danimarka"));
    expect(tr.indexOf("Çin")).toBeGreaterThan(tr.indexOf("Cezayir"));
  });
});
