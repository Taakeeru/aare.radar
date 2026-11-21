/**
 * The wordmark: a small radar sign (CSS classes, colours from the tokens) and the name. Four written forms
 * (lib/design-tokens.ts MARKS) are in the page; CSS shows the one html[data-mark] names (default D, as it was).
 * Braces and dot take the accent colour, like the {POWER.CODERS} logo. The sign is a radar with the Aare
 * flowing through it (Isabella, 21.11.: an icon that relates to the name, in Aare turquoise). The sign moves like the client
 * panels' sonar: an arm sweeps round and a ring spreads from the centre (none with reduced motion).
 */
export function Brand() {
  return (
    <span className="brand">
      <svg className="brand__mark" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" focusable="false">
        <circle className="brand__ring" cx="12" cy="12" r="10.5" />
        <circle className="brand__ring" cx="12" cy="12" r="6" />
        <circle className="brand__ping" cx="12" cy="12" r="10.5" />
        <line className="brand__arm" x1="12" y1="12" x2="12" y2="1.5" />
        <path className="brand__wave" d="M1.5 15.5c2.6-2.4 5.2-2.4 7.8 0s5.2 2.4 7.8 0 4.4-1.9 5.4-.9" />
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
