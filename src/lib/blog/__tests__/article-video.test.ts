import { describe, expect, it } from "vitest";
import { embedSrc, splitIntro, watchUrl } from "../article-video";

describe("splitIntro", () => {
  it("puts the first paragraph on its own, for the video to follow", () => {
    expect(splitIntro("<p>α</p>\n<h2>β</h2><p>γ</p>")).toEqual({ intro: "<p>α</p>", rest: "\n<h2>β</h2><p>γ</p>" });
  });
  it("an article that does not open with a paragraph gets the video first", () => {
    expect(splitIntro("<h2>β</h2><p>γ</p>")).toEqual({ intro: "", rest: "<h2>β</h2><p>γ</p>" });
  });
  it("does not stop at a paragraph-like tag name", () => {
    expect(splitIntro("<pre>x</pre><p>y</p>").intro).toBe("");
  });
});

describe("embedSrc", () => {
  it("uses YouTube's no-cookie player", () => {
    expect(embedSrc({ provider: "youtube", id: "abc123" })).toBe("https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0");
  });
  it("asks Vimeo not to track", () => {
    expect(embedSrc({ provider: "vimeo", id: "12345" })).toBe("https://player.vimeo.com/video/12345?autoplay=1&dnt=1");
  });
});

it("watchUrl gives the public page of the video", () => {
  expect(watchUrl({ provider: "youtube", id: "abc123" })).toBe("https://www.youtube.com/watch?v=abc123");
  expect(watchUrl({ provider: "vimeo", id: "12345" })).toBe("https://vimeo.com/12345");
});
