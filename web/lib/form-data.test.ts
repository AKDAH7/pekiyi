import { describe, expect, it } from "vitest";

import { formDataToObject } from "./form-data";

describe("formDataToObject", () => {
  it("nests dotted names into objects and arrays", () => {
    const form = new FormData();
    form.set("modelId", "m1");
    form.set("name.tr", "Koltuk");
    form.set("name.en", "Sofa");
    form.set("pieces.0.unitCbm", "0.8");
    form.set("pieces.1.unitCbm", "1.2");
    form.set("pieces.1.packageContents.tr", "2 ADET AYAK");
    form.set("$ACTION_ID_abc", "");
    expect(formDataToObject(form)).toEqual({
      modelId: "m1",
      name: { tr: "Koltuk", en: "Sofa" },
      pieces: [{ unitCbm: "0.8" }, { unitCbm: "1.2", packageContents: { tr: "2 ADET AYAK" } }],
    });
  });

  it("ignores prototype-polluting names", () => {
    const form = new FormData();
    form.set("__proto__.polluted", "yes");
    form.set("a.constructor.prototype.x", "yes");
    expect(formDataToObject(form)).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
