import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BirzhaDisclosure } from "./BirzhaDisclosure.js";

describe("BirzhaDisclosure", () => {
  it("рендерит раскрытый блок с телом и подсказкой", () => {
    const html = renderToStaticMarkup(
      createElement(
        BirzhaDisclosure,
        {
          title: "Заголовок",
          hint: "подсказка",
          defaultOpen: true,
        },
        "Содержимое",
      ),
    );
    expect(html).toContain("birzha-disclosure");
    expect(html).toContain("birzha-disclosure__hint");
    expect(html).toContain("Содержимое");
    expect(html).toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });

  it("без hint не выводит элемент подсказки", () => {
    const html = renderToStaticMarkup(
      createElement(BirzhaDisclosure, { title: "Только заголовок", defaultOpen: false }, null),
    );
    expect(html).not.toContain("birzha-disclosure__hint");
  });

  it("контролируемый режим: open + onOpenChange — свёрнуто", () => {
    const html = renderToStaticMarkup(
      createElement(
        BirzhaDisclosure,
        { title: "T", open: false, onOpenChange: () => {} },
        "x",
      ),
    );
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });

  it("контролируемый режим: open + onOpenChange — раскрыто", () => {
    const html = renderToStaticMarkup(
      createElement(
        BirzhaDisclosure,
        { title: "T", open: true, onOpenChange: () => {} },
        "x",
      ),
    );
    expect(html).toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });
});
