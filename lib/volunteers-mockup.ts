/**
 * «Volunteers» CONCEPT (21.11.2026, Isabella, panel thread 54; owner: a mockup with fictional profiles only).
 * Every profile below is MADE UP to show the idea: no real person, nothing from LinkedIn or any other site. In a real
 * version, experts would sign themselves up (opt-in) and could remove themselves at any time.
 */
export type Volunteer = { id: string; name: string; city: string; lat: number; lon: number; domains: string[]; offer: string };

/** Approximate city positions (degrees). */
const CITY: Record<string, [number, number]> = {
  Zürich: [47.377, 8.542],
  Bern: [46.948, 7.447],
  Basel: [47.56, 7.589],
  Lausanne: [46.52, 6.632],
  Genève: [46.204, 6.143],
  Luzern: [47.05, 8.309],
  "St. Gallen": [47.425, 9.377],
  Lugano: [46.004, 8.951],
  Winterthur: [47.5, 8.724],
  Fribourg: [46.807, 7.162],
  Zug: [47.166, 8.516],
  Chur: [46.85, 9.53],
};

const P = (id: string, name: string, city: string, domains: string[], offer: string): Volunteer => ({
  id,
  name,
  city,
  lat: CITY[city]![0],
  lon: CITY[city]![1],
  domains,
  offer,
});

export const VOLUNTEERS: Volunteer[] = [
  P("v1", "Example: Anna R.", "Zürich", ["Cloud", "AWS"], "one evening a month"),
  P("v2", "Example: Marc T.", "Zürich", ["Web", "React"], "a workshop per cohort"),
  P("v3", "Example: Leila B.", "Bern", ["Data", "SQL", "Power BI"], "two sessions per cohort"),
  P("v4", "Example: Jonas W.", "Basel", ["Security"], "one evening a month"),
  P("v5", "Example: Sofia M.", "Lausanne", ["Web", "JavaScript"], "mentoring, remote"),
  P("v6", "Example: Karim H.", "Genève", ["IT support", "Microsoft 365"], "a workshop per cohort"),
  P("v7", "Example: Nina F.", "Luzern", ["Data", "Python"], "one evening a month"),
  P("v8", "Example: David S.", "St. Gallen", ["DevOps", "Linux"], "two sessions per cohort"),
  P("v9", "Example: Elena C.", "Lugano", ["UX", "Design"], "mentoring, remote"),
  P("v10", "Example: Tom G.", "Winterthur", ["Testing", "QA"], "one evening a month"),
  P("v11", "Example: Aisha N.", "Fribourg", ["Cloud", "Azure"], "a workshop per cohort"),
  P("v12", "Example: Luca P.", "Zug", ["Data", "SQL"], "two sessions per cohort"),
  P("v13", "Example: Mia K.", "Chur", ["IT support", "Networking"], "one evening a month"),
  P("v14", "Example: Ben O.", "Bern", ["Web", "Java"], "mentoring, remote"),
];

/** Schematic outline of Switzerland as [lon, lat] points (simplified, for the concept map only). */
export const CH_OUTLINE: [number, number][] = [
  [5.97, 46.14], [6.14, 46.15], [6.31, 46.25], [6.22, 46.32], [6.11, 46.42], [6.1, 46.58], [6.43, 46.93], [6.74, 47.08],
  [6.94, 47.25], [7.0, 47.43], [7.18, 47.49], [7.44, 47.45], [7.59, 47.58], [7.93, 47.55], [8.22, 47.62], [8.45, 47.57],
  [8.62, 47.8], [8.82, 47.71], [9.18, 47.66], [9.56, 47.54], [9.67, 47.38], [9.53, 47.16], [9.48, 47.06], [9.88, 46.94],
  [10.12, 46.85], [10.47, 46.87], [10.45, 46.55], [10.13, 46.42], [10.05, 46.24], [9.55, 46.3], [9.28, 46.5], [9.03, 46.02],
  [8.95, 45.83], [8.79, 46.1], [8.45, 46.25], [8.15, 46.15], [7.87, 45.93], [7.55, 45.98], [7.04, 45.92], [6.79, 46.15],
  [6.8, 46.4], [6.52, 46.45], [6.23, 46.3], [5.97, 46.14],
];

export const BOX = { minLon: 5.9, maxLon: 10.55, minLat: 45.78, maxLat: 47.86 };

/** Equirectangular projection into a box of w x h (longitude squeezed by cos(46.8°) so the shape looks right). */
export function project(lon: number, lat: number, w: number, h: number): [number, number] {
  const k = Math.cos((46.8 * Math.PI) / 180);
  const spanX = (BOX.maxLon - BOX.minLon) * k;
  const spanY = BOX.maxLat - BOX.minLat;
  const s = Math.min(w / spanX, h / spanY);
  const ox = (w - spanX * s) / 2;
  const oy = (h - spanY * s) / 2;
  return [ox + (lon - BOX.minLon) * k * s, oy + (BOX.maxLat - lat) * s];
}
