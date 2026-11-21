/** The wordmark: a small radar sign (CSS classes, colours from the tokens) and the name. */
export function Brand() {
  return (
    <span className="brand">
      <svg className="brand__mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <circle className="brand__ring" cx="12" cy="12" r="10" />
        <circle className="brand__ring" cx="12" cy="12" r="5.5" />
        <circle className="brand__dot" cx="12" cy="12" r="2" />
      </svg>
      <span className="brand__name">
        Aare<span className="brand__sub">Radar</span>
      </span>
    </span>
  );
}
