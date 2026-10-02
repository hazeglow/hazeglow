import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Afterglow } from "../src/Afterglow";
import { DEFAULT_CONFIG, type GradientConfig } from "../src/config";

const still: GradientConfig = { ...DEFAULT_CONFIG, hover: 0 };
const reactive: GradientConfig = { ...DEFAULT_CONFIG, hover: 0.5 };

describe("Afterglow", () => {
  it("renders on the server, where there is no window or document", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
    expect(renderToStaticMarkup(<Afterglow config={still} />)).toMatch(/^<canvas /);
  });

  it("fills its parent with inline styles, so no stylesheet is needed", () => {
    expect(renderToStaticMarkup(<Afterglow config={still} />)).toBe(
      '<canvas aria-hidden="true" style="display:block;width:100%;height:100%"></canvas>',
    );
  });

  it("leaves touch-action alone while hover is off", () => {
    expect(renderToStaticMarkup(<Afterglow config={still} />)).not.toContain("touch-action");
  });

  it("keeps vertical scrolling while hover is on", () => {
    expect(renderToStaticMarkup(<Afterglow config={reactive} />)).toContain("touch-action:pan-y");
  });

  it("lets the consumer override any style", () => {
    const markup = renderToStaticMarkup(
      <Afterglow config={reactive} style={{ touchAction: "none", height: 320, borderRadius: 24 }} />,
    );
    expect(markup).toContain("touch-action:none");
    expect(markup).not.toContain("pan-y");
    expect(markup).toContain("height:320px");
    expect(markup).not.toContain("height:100%");
    expect(markup).toContain("border-radius:24px");
  });

  it("passes the class name through", () => {
    expect(renderToStaticMarkup(<Afterglow config={still} className="hero" />)).toContain('class="hero"');
  });
});
