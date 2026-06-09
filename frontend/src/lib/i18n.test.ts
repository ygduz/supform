import { describe, expect, it } from "vitest";
import { formLanguages, localize } from "./i18n";

describe("localize", () => {
  it("returns a plain string as-is", () => {
    expect(localize("hello")).toBe("hello");
  });

  it("resolves the requested language", () => {
    expect(localize({ en: "Hello", fr: "Bonjour" }, "fr")).toBe("Bonjour");
  });

  it("falls back to the fallback language, then the first value", () => {
    expect(localize({ en: "Hello", fr: "Bonjour" }, "de")).toBe("Hello");
    expect(localize({ es: "Hola" }, "de")).toBe("Hola");
  });

  it("returns empty string for nullish values", () => {
    expect(localize(undefined)).toBe("");
  });
});

describe("formLanguages", () => {
  it("returns an empty list when no languages are configured", () => {
    expect(formLanguages([], undefined)).toEqual([]);
  });

  it("hoists the default language to the front", () => {
    expect(formLanguages(["en", "fr"], "fr")).toEqual(["fr", "en"]);
  });

  it("adds the default language if it is missing from the list", () => {
    expect(formLanguages(["en"], "fr")).toEqual(["fr", "en"]);
  });
});
