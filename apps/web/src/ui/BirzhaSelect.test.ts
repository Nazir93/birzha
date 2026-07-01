import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BirzhaSelect, splitBirzhaSelectStyle } from "./BirzhaSelect.js";

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

  it("раскладывает minWidth на обёртку", () => {
    const split = splitBirzhaSelectStyle({
      width: "100%",
      minWidth: "16rem",
      padding: "0.5rem 0.75rem",
    });
    expect(split.wrapperStyle).toEqual({ width: "100%", minWidth: "16rem" });
    expect(split.triggerStyle).toEqual({ padding: "0.5rem 0.75rem" });
  });

  it("раскладывает style: layout на обёртку, оформление на триггер", () => {
    const split = splitBirzhaSelectStyle({
      width: "100%",
      marginTop: "0.35rem",
      padding: "0.5rem 0.75rem",
      minHeight: "2.625rem",
    });
    expect(split.wrapperStyle).toEqual({ width: "100%", marginTop: "0.35rem" });
    expect(split.triggerStyle).toEqual({ padding: "0.5rem 0.75rem", minHeight: "2.625rem" });

    const html = renderToStaticMarkup(
      createElement(BirzhaSelect, {
        value: "w1",
        onChange: () => {},
        style: {
          width: "100%",
          marginTop: "0.35rem",
          padding: "0.5rem 0.75rem",
          minHeight: "2.625rem",
        },
        options: [{ value: "w1", label: "Склад" }],
      }),
    );
    expect(html).toContain('class="birzha-select" style="width:100%;margin-top:0.35rem"');
    expect(html).toContain('class="birzha-select__trigger" style="padding:0.5rem 0.75rem;min-height:2.625rem"');
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
