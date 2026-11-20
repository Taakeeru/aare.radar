/**
 * Question D (target group) has no data in v1. These are the sources planned
 * for it; the pages show them with a "data coming" state and no numbers.
 */
export const PLANNED_SOURCES = [
  { id: "sem", url: "https://www.sem.admin.ch/sem/de/home/publiservice/statistik/asylstatistik.html" },
  { id: "bfs", url: "https://www.bfs.admin.ch/bfs/de/home/statistiken/bevoelkerung/migration-integration.html" },
] as const;
