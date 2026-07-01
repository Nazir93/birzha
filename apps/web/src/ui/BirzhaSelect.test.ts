import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BirzhaSelect } from "./BirzhaSelect.js";

describe("BirzhaSelect", () => {
  it("рендерит кнопку-триггер с подписью выбранного значения", () => {
    const html = renderToStaticMarkup(
      createElement(BirzhaSelect, {
        value: "w1",
        onChange: () => {},
        options: [
          { value: "", label: "— выберите —" },
          { value: "w1", label: "Дербент" },
        ],
      }),
    );
    expect(html).toContain("birzha-select__trigger");
    expect(html).toContain("Дербент");
    expect(html).toContain('aria-haspopup="listbox"');
  });

  it("показывает placeholder при пустом value", () => {
    const html = renderToStaticMarkup(
      createElement(BirzhaSelect, {
        value: "",
        onChange: () => {},
        placeholder: "— выберите склад —",
        options: [{ value: "w1", label: "Дербент" }],
      }),
    );
    expect(html).toContain("birzha-select__value--placeholder");
    expect(html).toContain("— выберите склад —");
  });

  it("поддерживает группы опций", () => {
    const html = renderToStaticMarkup(
      createElement(BirzhaSelect, {
        value: "g2",
        onChange: () => {},
        groups: [
          {
            label: "Томат",
            options: [
              { value: "g1", label: "5" },
              { value: "g2", label: "6" },
            ],
          },
        ],
      }),
    );
    expect(html).toContain("6");
  });
});
