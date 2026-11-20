/**
 * Guards for deploy/ (the production setup, ported from the client template's promote-no-build,
 * promote-ref-gate and compose-log-rotation tests, plus the CMC specifics).
 *
 *  - The server never builds: no `build:` key in the compose file, no build command and every
 *    `compose up` with --no-build in promote.sh (incident of the client template: a Next.js build on the
 *    client server froze the box).
 *  - promote.sh: ref-gate (only commits on origin/main), pull-gate (exit 2 when the CI image is not in
 *    GHCR), swap with automatic rollback. The blocks run as they stand in the file, with docker, curl,
 *    git and sleep replaced by stubs (the CI image has no git, and a skipped test would be RED there).
 *  - Compose and Caddyfile: memory limits, log rotation, localhost-only app port, the exact Caddy
 *    X-Real-IP snippet the app trusts, no Caddy header that overrides the app's
 *    per-page Referrer-Policy.
 *  - .env.example lists every environment variable the app reads.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { CADDY_REAL_IP_SNIPPET } from "@/lib/get-client-ip";
import { SECRET_QUERY_PARAMS } from "@/lib/referrer-policy";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

const COMPOSE = read("deploy/docker-compose.prod.yml");
const CADDYFILE = read("deploy/Caddyfile");
const PROMOTE = read("deploy/promote.sh");
const ENV_EXAMPLE = read("deploy/.env.example");

const GHCR_IMAGE = "ghcr.io/7hem4ster/powercoders-radar";

/** The text of one top-level compose service (from `  name:` to the next two-space key). */
function service(name: string): string {
  const m = COMPOSE.match(new RegExp(`^  ${name}:\\n((?:    .*\\n|\\s*\\n|      .*\\n)*)`, "m"));
  if (!m) throw new Error(`compose has no service ${name}`);
  return m[1]!;
}

/** Non-comment lines only. */
function code(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

describe("docker-compose.prod.yml: the server only pulls", () => {
  it("has no build key and names the GHCR image of the CI", () => {
    expect(code(COMPOSE)).not.toMatch(/^\s*build:/m);
    expect(service("radar")).toContain(`image: ${GHCR_IMAGE}:\${RADAR_TAG:?`);
  });

  it("pins the Caddy image by digest", () => {
    expect(service("caddy")).toMatch(/image: caddy:[\d.]+-alpine@sha256:[0-9a-f]{64}\n/);
  });

  it.each(["radar", "caddy"])("%s: restart, memory limit with swap = memory, rotated log", (name) => {
    const svc = code(service(name));
    expect(svc).toContain("restart: unless-stopped");
    const mem = svc.match(/^\s*mem_limit: (\d+m)$/m)?.[1];
    expect(mem, "mem_limit").toBeTruthy();
    expect(svc.match(/^\s*memswap_limit: (\d+m)$/m)?.[1]).toBe(mem);
    expect(svc).toMatch(/driver: json-file/);
    expect(svc).toMatch(/max-size: "10m"/);
    expect(svc).toMatch(/max-file: "5"/);
  });

  it("the app runs as production behind the proxy, never as a demo or with a stubbed mail", () => {
    const env = code(service("radar"));
    expect(env).toContain("- APP_ENV=production");
    expect(env).toContain("- TRUST_PROXY=true");
    expect(env).toContain("- DATABASE_URL=/app/data/local.db");
    expect(code(COMPOSE)).not.toMatch(/DEMO_INSTANCE|EMAIL_STUB/);
  });

  it("keeps the SQLite file on a host folder and publishes the app on localhost only", () => {
    const svc = code(service("radar"));
    expect(svc).toMatch(/- \$\{RADAR_DATA_DIR:-\/home\/ubuntu\/radar-data\}:\/app\/data/);
    const ports = [...svc.matchAll(/^\s*- "([^"]+:\d+:\d+)"$/gm)].map((m) => m[1]);
    expect(ports).toEqual(["127.0.0.1:3000:3000"]);
  });

  it("publishes only 80, 443 and 443/udp on Caddy", () => {
    const ports = [...code(service("caddy")).matchAll(/^\s*- "(\d+:\d+(?:\/udp)?)"/gm)].map((m) => m[1]);
    expect(ports.sort()).toEqual(["443:443", "443:443/udp", "80:80"]);
  });

  it("is named radar, so the container is radar-radar-1 as the scripts expect", () => {
    expect(COMPOSE).toMatch(/^name: radar$/m);
    for (const f of ["deploy/promote.sh"]) {
      expect(read(f), f).toContain("radar-radar-1");
    }
    expect(PROMOTE).toContain("radar-caddy-1");
  });
});

describe("Caddyfile", () => {
  it("the access log drops the reset token from the query and from the headers that repeat the URL", () => {
    for (const q of ["delete t", "delete token"]) expect(CADDYFILE).toContain(q);
    for (const h of ["Referer", "Next-Url", "Next-Router-State-Tree"]) {
      expect(CADDYFILE).toContain(`request>headers>${h} delete`);
    }
  });

  it("serves the apex through our reverse_proxy block, word for word the snippet the app trusts", () => {
    // The snippet is written without the indentation of the site block.
    const dedented = CADDYFILE.split("\n")
      .map((l) => l.replace(/^\t/, ""))
      .join("\n");
    expect(dedented).toContain(CADDY_REAL_IP_SNIPPET);
    expect(CADDYFILE).toMatch(/^radar\.gnamak\.ch \{$/m);
  });

  it("never trusts X-Forwarded-For", () => {
    expect(code(CADDYFILE)).not.toMatch(/X-Forwarded-For/i);
  });

  it("sets security headers only as defaults (`?`) and leaves Referrer-Policy to the app", () => {
    const block = code(CADDYFILE).match(/\theader \{\n([\s\S]*?)\n\t\}/)?.[1] ?? "";
    const lines = block.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.trim(), l).toMatch(/^\?/);
    expect(code(CADDYFILE)).not.toMatch(/Referrer-Policy/i);
  });

  it("removes every secret query parameter from the access log", () => {
    const del = [...CADDYFILE.matchAll(/^\s*delete (\w+)$/gm)].map((m) => m[1]);
    for (const p of SECRET_QUERY_PARAMS) expect(del, p).toContain(p);
  });
});

describe(".env.example", () => {
  const exampleKeys = [...ENV_EXAMPLE.matchAll(/^([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => ({ key: m[1]!, value: m[2]! }));
  const exampleNames = new Set(exampleKeys.map((k) => k.key));
  const composeSets = new Set([...code(service("radar")).matchAll(/^\s*- ([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!));

  /** Names the app reads in production code (tests, the CI demo seeder and the dev scripts excluded). */
  function appEnvNames(): Set<string> {
    const names = new Set<string>();
    const walk = (rel: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const child = path.join(rel, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__" && e.name !== "node_modules") walk(child);
        } else if (/\.(ts|tsx)$/.test(e.name)) {
          for (const m of read(child).matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]*)\b/g)) names.add(m[1]!);
        }
      }
    };
    for (const d of ["app", "lib", "components", "i18n"]) if (fs.existsSync(path.join(ROOT, d))) walk(d);
    for (const f of ["middleware.ts", "instrumentation.ts", "next.config.ts"]) {
      for (const m of read(f).matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]*)\b/g)) names.add(m[1]!);
    }
    return names;
  }

  // Set by Next itself, by the build, or deliberately NOT set on the server (see the compose file).
  // SITE_ENV: only the test environment's compose file sets it (deploy/test/, lib/__tests__/test-env.test.ts).
  const NOT_FOR_THE_SERVER = new Set(["NEXT_PHASE", "NEXT_RUNTIME", "DEMO_INSTANCE", "EMAIL_STUB", "SITE_ENV"]);

  it("covers every variable the app reads: in the compose environment or in this file", () => {
    const missing = [...appEnvNames()].filter(
      (n) => !NOT_FOR_THE_SERVER.has(n) && !composeSets.has(n) && !exampleNames.has(n),
    );
    expect(missing).toEqual([]);
  });

  it("lists every ${VAR} the compose file interpolates", () => {
    const used = [...COMPOSE.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:}-]/g)].map((m) => m[1]!);
    expect(used.filter((n) => !exampleNames.has(n))).toEqual([]);
  });

  it("holds no real value: secrets empty, the rest the documented defaults", () => {
    const allowed: Record<string, string> = { SMTP_PORT: "465", MAIL_FROM: "Powercoders Job Radar <noreply@radar.gnamak.ch>" };
    for (const { key, value } of exampleKeys) {
      expect(value, key).toBe(allowed[key] ?? "");
    }
  });

  it("never lists the demo or stub switches as settings", () => {
    expect(exampleNames.has("DEMO_INSTANCE")).toBe(false);
    expect(exampleNames.has("EMAIL_STUB")).toBe(false);
  });
});

// ── promote.sh ───────────────────────────────────────────────────────────────

function block(name: string): string {
  const m = PROMOTE.match(new RegExp(`# >>> ${name}[^\\n]*\\n([\\s\\S]*?)# <<< ${name}`));
  if (!m) throw new Error(`promote.sh has no ${name} block`);
  return m[1]!;
}

describe("promote.sh never builds on the server", () => {
  it("has no --build and no docker/compose build command", () => {
    expect(PROMOTE).not.toContain("--build");
    expect(PROMOTE).not.toMatch(/docker\s+(build|buildx|builder|image\s+build)\b/);
    expect(PROMOTE).not.toMatch(/compose\s+(-\S+\s+)*build\b/);
    expect(PROMOTE).not.toMatch(/\$COMPOSE\s+build\b/);
  });

  it("every compose up says --no-build", () => {
    const ups = PROMOTE.split("\n").filter((l) => /(docker compose|\$COMPOSE)\b.*\bup -d\b/.test(l) && !l.trim().startsWith("#"));
    expect(ups.length).toBeGreaterThan(0);
    for (const l of ups) expect(l).toContain("--no-build");
  });

  it("pulls the GHCR image of the CI for the FULL sha, after the ref-gate and before anything is swapped", () => {
    expect(PROMOTE).toContain(`GHCR_IMAGE="${GHCR_IMAGE}"`);
    expect(PROMOTE).toContain('FULL_SHA=$(git rev-parse "${REF}^{commit}")');
    expect(PROMOTE).toContain('GHCR_REF="${GHCR_IMAGE}:${FULL_SHA}"');
    const refGate = PROMOTE.indexOf("# <<< ref-gate");
    const pull = PROMOTE.indexOf('docker pull --quiet "$GHCR_REF"');
    expect(refGate).toBeGreaterThan(-1);
    expect(pull).toBeGreaterThan(refGate);
    for (const later of [
      'git checkout --detach --quiet "$REF"',
      'setenv RADAR_TAG "$FULL_SHA"',
      "$COMPOSE up -d --no-build --force-recreate radar \\\n",
    ]) {
      expect(PROMOTE.indexOf(later), later).toBeGreaterThan(pull);
    }
    expect(block("pull-gate")).toMatch(/exit 2\n/);
  });

  it("keeps the gates: preflight, backup check, swap assertion, 60 s health loop, content probe", () => {
    expect(PROMOTE).toContain("PREFLIGHT");
    expect(PROMOTE).toContain("AUTH_SECRET missing/too short");
    expect(PROMOTE).toContain("DEMO_INSTANCE must not be set");
    expect(PROMOTE).toContain("aborting promotion");
    expect(PROMOTE).toContain("PROMOTION DID NOT SWAP");
    expect(PROMOTE).toMatch(/for i in \$\(seq 1 60\)/);
    expect(PROMOTE).toContain("/api/health");
    expect(PROMOTE).toContain('grep -q "$PROD_URL"');
    expect(PROMOTE).toMatch(/^set -e$/m);
  });

  it("runs as one function called on the last line (the checkout rewrites the file under bash)", () => {
    expect(PROMOTE).toMatch(/^main\(\) \{$/m);
    expect(PROMOTE.trimEnd().split("\n").slice(-2)).toEqual(['main "$@"', "exit $?"]);
  });
});

// The blocks are POSIX: bash where it exists, otherwise the image's sh.
const SHELL = spawnSync("bash", ["--version"]).status === 0 ? "bash" : "sh";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLD = "fedcba9876543210fedcba9876543210fedcba98";
const GHCR_REF = `${GHCR_IMAGE}:${SHA}`;
const OLD_REF = `${GHCR_IMAGE}:${OLD}`;

describe("promote.sh ref-gate with a stubbed git", () => {
  let root = "";
  let bin = "";
  const gitStub = `#!/bin/sh
known=" main1 main2 tag-on-main side tag-off-main "
onmain=" main1 main2 tag-on-main "
strip() { printf '%s' "$1" | sed 's/\\^{commit}$//'; }
case "$1" in
  fetch) exit 0;;
  rev-parse) for a; do last=$a; done; r=$(strip "$last"); case "$known" in *" $r "*) exit 0;; esac; exit 1;;
  merge-base) r=$(strip "$3"); case "$onmain" in *" $r "*) exit 0;; esac; exit 1;;
esac
exit 0
`;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radar-promote-gate-"));
    bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "git"), gitStub, { mode: 0o755 });
    fs.writeFileSync(path.join(root, "gate.sh"), `set -e\nREF="$1"\n${block("ref-gate")}echo GATE-PASSED\n`);
  });
  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (ref: string) => {
    const r = spawnSync(SHELL, [path.join(root, "gate.sh"), ref], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it("fetches, checks the ref is on origin/main, and only then checks it out", () => {
    const fetchAt = PROMOTE.indexOf("git fetch --all --tags --quiet");
    const gateAt = PROMOTE.indexOf('git merge-base --is-ancestor "${REF}^{commit}" origin/main');
    const checkoutAt = PROMOTE.indexOf('git checkout --detach --quiet "$REF"');
    expect(fetchAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(fetchAt);
    expect(checkoutAt).toBeGreaterThan(gateAt);
  });

  it.each(["main1", "main2", "tag-on-main"])("lets %s through", (ref) => {
    const r = run(ref);
    expect(r.out).toContain("GATE-PASSED");
    expect(r.code).toBe(0);
  });

  it.each(["side", "tag-off-main"])("refuses %s (not merged)", (ref) => {
    const r = run(ref);
    expect(r.code).toBe(1);
    expect(r.out).toContain("is not on origin/main");
    expect(r.out).not.toContain("GATE-PASSED");
  });

  it("refuses an unknown ref", () => {
    const r = run("0000000000000000000000000000000000000000");
    expect(r.code).toBe(1);
    expect(r.out).toContain("unknown ref");
  });
});

const DOCKER_STUB = `#!/bin/sh
echo "docker $*" >> "$STUB_STATE/log"
T="$STUB_STATE/tags"
f() { printf '%s' "$1" | tr '/:' '__'; }
for a in "$@"; do last="$a"; done
case "$1" in
  pull)
    if [ "$STUB_PULL" = "missing" ]; then echo "Error response from daemon: manifest unknown" >&2; exit 1; fi
    echo "sha256:new" > "$T/$(f "$last")"; echo "$last";;
  image)
    [ -f "$T/$(f "$last")" ] || { echo "No such image: $last" >&2; exit 1; }
    case "$*" in *" -f "*) cat "$T/$(f "$last")";; esac;;
  compose)
    case "$*" in *" up "*) ;; *) exit 0;; esac
    tag=$(grep -E '^RADAR_TAG=' deploy/.env | head -1 | cut -d= -f2-)
    next=$(cat "$T/$(f "${GHCR_IMAGE}:$tag")")
    if [ "$STUB_COMPOSE" = "fail" ] && [ "$next" = "sha256:new" ]; then echo "container exited" >&2; exit 1; fi
    echo "$next" > "$STUB_STATE/running";;
  inspect) cat "$STUB_STATE/running";;
esac
exit 0
`;

const CURL_STUB = `#!/bin/sh
echo "curl $*" >> "$STUB_STATE/log"
run=$(cat "$STUB_STATE/running")
case "$*" in
  *"%{http_code}"*)
    if [ "$STUB_HEALTH" = "down" ] && [ "$run" = "sha256:new" ]; then printf 000; exit 7; fi
    printf 200;;
  *)
    if [ "$run" = "sha256:new" ] && [ "$STUB_PAGE" = "wrong-url" ]; then echo "Sitemap: https://example.org/sitemap.xml"
    else echo "Sitemap: https://radar.gnamak.ch/sitemap.xml"; fi;;
esac
`;

describe("promote.sh pull-gate and swap with a stubbed docker", () => {
  let root = "";
  let state = "";
  let bin = "";

  const tagFile = (ref: string) => path.join(state, "tags", ref.replace(/[/:]/g, "_"));
  const readText = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf-8").trim() : "");
  const envFile = () => path.join(root, "deploy", ".env");
  const envVal = (k: string) => readText(envFile()).match(new RegExp(`^${k}=(.*)$`, "m"))?.[1] ?? "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radar-promote-swap-"));
    state = path.join(root, "state");
    bin = path.join(root, "bin");
    fs.mkdirSync(path.join(state, "tags"), { recursive: true });
    fs.mkdirSync(path.join(root, "deploy"));
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "docker"), DOCKER_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "curl"), CURL_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    // Production before the promotion: the old image is tagged in .env and running.
    fs.writeFileSync(envFile(), `AUTH_SECRET=x\nRADAR_TAG=${OLD}\nRADAR_TAG_PREV=\n`);
    fs.writeFileSync(tagFile(OLD_REF), "sha256:old\n");
    fs.writeFileSync(path.join(state, "running"), "sha256:old\n");
    fs.writeFileSync(path.join(state, "log"), "");
  });
  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (name: "pull-gate" | "swap", stub: Record<string, string> = {}) => {
    const file = path.join(root, `${name}.sh`);
    fs.writeFileSync(
      file,
      [
        "set -e",
        'ENV_FILE="deploy/.env"',
        'COMPOSE="docker compose -f deploy/docker-compose.prod.yml"',
        'CONTAINER="radar-radar-1"',
        `GHCR_IMAGE="${GHCR_IMAGE}"`,
        `FULL_SHA="${SHA}"`,
        `GHCR_REF="${GHCR_REF}"`,
        `SHORT_SHA="${SHA.slice(0, 7)}"`,
        'PROD_URL="https://radar.gnamak.ch"',
        `BACKUP_DIR="${root}"`,
        'BK="pre-promote-test.db"',
        block("helpers"),
        block(name),
        "echo BLOCK-PASSED",
        "",
      ].join("\n"),
    );
    const r = spawnSync(SHELL, [file], {
      cwd: root,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_STATE: state, ...stub },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}`, log: readText(path.join(state, "log")) };
  };

  it("exits 2 with a clear message when the image for the sha is not in GHCR, and touches nothing", () => {
    const r = run("pull-gate", { STUB_PULL: "missing" });
    expect(r.code).toBe(2);
    expect(r.out).toContain(`NO CI IMAGE for ${SHA} in GHCR`);
    expect(r.out).toContain("never builds on this server");
    expect(r.out).not.toContain("BLOCK-PASSED");
    expect(r.log).toContain(`docker pull --quiet ${GHCR_REF}`);
    expect(r.log).not.toMatch(/docker (tag|compose)/);
    expect(readText(path.join(state, "running"))).toBe("sha256:old");
    expect(envVal("RADAR_TAG")).toBe(OLD);
  });

  it("lets the promotion go on when the sha image was pulled", () => {
    const r = run("pull-gate");
    expect(r.code).toBe(0);
    expect(r.out).toContain("BLOCK-PASSED");
    expect(readText(tagFile(GHCR_REF))).toBe("sha256:new");
  });

  describe("swap", () => {
    beforeEach(() => {
      fs.writeFileSync(tagFile(GHCR_REF), "sha256:new\n"); // pulled by the pull-gate
    });

    it("swaps in the pulled image with --no-build when every gate passes", () => {
      const r = run("swap");
      expect(r.out).toContain("BLOCK-PASSED");
      expect(r.code).toBe(0);
      expect(r.log).toContain("docker compose -f deploy/docker-compose.prod.yml up -d --no-build --force-recreate radar");
      expect(r.log).toContain("/api/health");
      expect(r.out).not.toContain("ROLLBACK");
      expect(readText(path.join(state, "running"))).toBe("sha256:new");
      expect(envVal("RADAR_TAG")).toBe(SHA);
      expect(envVal("RADAR_TAG_PREV")).toBe(OLD);
    });

    it.each([
      ["the health loop stays down", { STUB_HEALTH: "down" }, "did not come up within 60 s"],
      ["robots.txt names another address", { STUB_PAGE: "wrong-url" }, "does not reference"],
      ["compose up fails", { STUB_COMPOSE: "fail" }, "docker compose up failed"],
    ])("rolls back to the previous tag and exits non-zero when %s", (_n: string, stub: Record<string, string>, reason: string) => {
      const r = run("swap", stub);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain(reason);
      expect(r.out).toContain("AUTO-ROLLBACK");
      expect(r.out).toContain("ROLLED BACK");
      expect(r.out).not.toContain("BLOCK-PASSED");
      expect(envVal("RADAR_TAG")).toBe(OLD);
      expect(readText(path.join(state, "running"))).toBe("sha256:old");
      // The recreate after the rollback is --no-build as well.
      for (const l of r.log.split("\n").filter((x) => /compose .* up -d/.test(x))) expect(l).toContain("--no-build");
    });

    it("says so and exits non-zero when there is no previous image to roll back to", () => {
      fs.writeFileSync(envFile(), "AUTH_SECRET=x\nRADAR_TAG=\n"); // first promotion on a fresh host
      const r = run("swap", { STUB_HEALTH: "down" });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("AUTO-ROLLBACK IMPOSSIBLE");
      expect(r.out).not.toContain("BLOCK-PASSED");
    });
  });
});
