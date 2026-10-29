import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpenRouterError,
  chat,
  translateBatch,
  translateHtml,
  translateText,
  translateValue,
} from "@/lib/ai/openrouter";

function okFetch(content: string) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  }));
}

beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("openrouter", () => {
  it("throws when the key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(chat("s", "u")).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("returns the message content on 200", async () => {
    vi.stubGlobal("fetch", okFetch("Γειά"));
    expect(await chat("s", "u")).toBe("Γειά");
  });

  it("throws OpenRouterError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) })),
    );
    await expect(chat("s", "u")).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("returns '' for blank input without calling the API", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await translateText({ text: "   ", from: "el", to: "en" })).toBe("");
    expect(f).not.toHaveBeenCalled();
  });

  it("strips html fences and re-sanitizes a translated rich value", async () => {
    vi.stubGlobal("fetch", okFetch("```html\n<p onclick=x>Ciao</p>\n```"));
    expect(await translateHtml({ html: "<p>Γειά</p>", from: "el", to: "it" })).toBe("<p>Ciao</p>");
  });

  it("rejects a batch whose length does not match the input", async () => {
    vi.stubGlobal("fetch", okFetch(JSON.stringify(["only-one"])));
    await expect(translateBatch({ texts: ["a", "b"], from: "el", to: "en" })).rejects.toBeInstanceOf(OpenRouterError);
  });

  it("routes rich to html and text to plain", async () => {
    vi.stubGlobal("fetch", okFetch("<p>X</p>"));
    expect(await translateValue({ kind: "rich", text: "<p>Χ</p>", from: "el", to: "en" })).toBe("<p>X</p>");
    vi.stubGlobal("fetch", okFetch("Plain"));
    expect(await translateValue({ kind: "text", text: "Απλό", from: "el", to: "en" })).toBe("Plain");
  });
});
