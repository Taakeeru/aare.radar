/**
 * A drawn profile picture for the fictional example profiles (Volunteers concept, 21.11.2026): a silhouette on a
 * colour from the chart tokens, chosen by the id. Deliberately not a photo, so nobody takes an example for a real person.
 */
export function Avatar({ id, label, size = 48 }: { id: string; label: string; size?: number }) {
  const n = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5;
  return (
    <svg className="avatar" viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={label}>
      <circle cx="24" cy="24" r="24" style={{ fill: `var(--radar-chart-${n + 1})` }} />
      <circle className="avatar__shape" cx="24" cy="19" r="8" />
      <path className="avatar__shape" d="M8 42c2.5-8 9-12 16-12s13.5 4 16 12a24 24 0 0 1-32 0z" />
    </svg>
  );
}
