/**
 * The wordmark: a small radar sign (CSS classes, colours from the tokens) and the name. Four written forms
 * (lib/design-tokens.ts MARKS) are in the page; CSS shows the one html[data-mark] names (default D, as it was).
 * Braces and dot take the accent colour, like the {POWER.CODERS} logo.
 */
export function Brand() {
  return (
    <span className="brand">
      <svg className="brand__mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <circle className="brand__ring" cx="12" cy="12" r="10" />
        <circle className="brand__ring" cx="12" cy="12" r="5.5" />
        <circle className="brand__dot" cx="12" cy="12" r="2" />
      </svg>
      <span className="brand__name" data-mark="a">
        <span className="brand__brace">{"{"}</span> Aare<span className="brand__punct">.</span>Radar{" "}
        <span className="brand__brace">{"}"}</span>
      </span>
      <span className="brand__name" data-mark="b">
        <span className="brand__brace">{"{"}</span> AARE<span className="brand__punct">.</span>RADAR{" "}
        <span className="brand__brace">{"}"}</span>
      </span>
      <span className="brand__name" data-mark="c">
        <span className="brand__brace">{"{"}</span> aare<span className="brand__punct">.</span>radar{" "}
        <span className="brand__brace">{"}"}</span>
      </span>
      <span className="brand__name" data-mark="d">
        Aare<span className="brand__sub">Radar</span>
      </span>
    </span>
  );
}
