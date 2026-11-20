/**
 * Route origin ratchet, ported from the client template
 * lib/__tests__/route-origin-ratchet.test.ts.
 *
 * Every route handler under app/ that reads the request body must call the
 * one same-origin check, isSameOrigin() from lib/same-origin.ts, BEFORE it
 * reads the body. This app addition: any exported POST/PUT/PATCH/DELETE handler
 * must call it at all (today the site has no state-changing route handler;
 * its forms are server actions, which Next checks itself, csrf.test.ts).
 *
 * EXCEPTIONS starts empty here; an entry needs a real reason (no session
 * authority: a token, a signature) and the list may only shrink.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { isSameOrigin, allowedOriginHosts } from "@/lib/same-origin";

const ROOT = join(__dirname, "..", "..");

type Kind = "no-check" | "read-before-check";

const EXCEPTIONS: Record<string, { kind: Kind; reason: string }> = {};

const BODY_METHODS = new Set(["formData", "json", "arrayBuffer", "text", "blob"]);
const CHECK_NAME = "isSameOrigin";

export type Finding = { handler: string; kind: Kind; detail: string };

/** Findings of one route source: per exported handler that reads its request's body. */
export function scanRoute(fileName: string, src: string): Finding[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings: Finding[] = [];

  const handlers: Array<{ name: string; fn: ts.FunctionLikeDeclaration }> = [];
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(st) && st.name && st.body) handlers.push({ name: st.name.text, fn: st });
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          handlers.push({ name: d.name.text, fn: init });
        }
      }
    }
  }

  for (const { name, fn } of handlers) {
    const p = fn.parameters[0];
    if (!p || !ts.isIdentifier(p.name)) continue;
    const reqName = p.name.text;
    let firstRead = -1;
    let readText = "";
    let firstCheck = -1;
    const visit = (n: ts.Node) => {
      // req.formData() / req.json() / ...
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const pa = n.expression;
        if (ts.isIdentifier(pa.expression) && pa.expression.text === reqName && BODY_METHODS.has(pa.name.text)) {
          if (firstRead < 0 || n.getStart() < firstRead) {
            firstRead = n.getStart();
            readText = `${reqName}.${pa.name.text}()`;
          }
        }
      }
      // req.body (a stream read)
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === reqName && n.name.text === "body") {
        if (firstRead < 0 || n.getStart() < firstRead) {
          firstRead = n.getStart();
          readText = `${reqName}.body`;
        }
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === CHECK_NAME) {
        if (firstCheck < 0 || n.getStart() < firstCheck) firstCheck = n.getStart();
      }
      ts.forEachChild(n, visit);
    };
    if (fn.body) visit(fn.body);
    if (firstRead < 0) continue;
    const lineOf = (pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;
    if (firstCheck < 0) {
      findings.push({ handler: name, kind: "no-check", detail: `${readText} at line ${lineOf(firstRead)}, no ${CHECK_NAME}() in the handler` });
    } else if (firstCheck > firstRead) {
      findings.push({
        handler: name,
        kind: "read-before-check",
        detail: `${readText} at line ${lineOf(firstRead)} before ${CHECK_NAME}() at line ${lineOf(firstCheck)}`,
      });
    }
  }
  return findings;
}

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (name === "route.ts" || name === "route.tsx") out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const STATE_METHODS = /export\s+(?:async\s+)?(?:function\s+|const\s+)(POST|PUT|PATCH|DELETE)\b/;

describe("route origin ratchet (the template G17b)", () => {
  const files = routeFiles(join(ROOT, "app"));
  const results = new Map<string, Finding[]>();
  for (const f of files) results.set(rel(f), scanRoute(f, readFileSync(f, "utf-8")));

  it("scans the app's route handlers", () => {
    expect(files.map(rel)).toContain("app/api/health/route.ts");
  });

  it("every route that reads a body calls isSameOrigin() first, or is a listed exception", () => {
    const bad: string[] = [];
    for (const [file, findings] of results) {
      const ex = EXCEPTIONS[file];
      for (const f of findings) {
        if (ex && ex.kind === f.kind) continue;
        bad.push(`${file} ${f.handler}: ${f.detail}`);
      }
    }
    expect(bad, "call isSameOrigin(req) before reading the body (lib/same-origin.ts)").toEqual([]);
  });

  it("this app: every state-changing handler (POST/PUT/PATCH/DELETE) calls isSameOrigin()", () => {
    const bad = files
      .filter((f) => STATE_METHODS.test(readFileSync(f, "utf-8")) && !readFileSync(f, "utf-8").includes("isSameOrigin("))
      .map(rel);
    expect(bad).toEqual([]);
  });

  it("the checker finds planted mistakes and accepts the right order", () => {
    const missing = `export async function POST(req: Request) { const f = await req.formData(); return f; }`;
    const late = `import { isSameOrigin } from "@/lib/same-origin";
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  return body;
}`;
    const stream = `export const PUT = async (r: Request) => { const s = r.body; return s; };`;
    const good = `import { isSameOrigin } from "@/lib/same-origin";
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const f = await req.formData();
  return f;
}`;
    const noBody = `export async function DELETE(req: Request) { return new Response(null); }`;
    const otherObject = `export async function POST(req: Request) { const r = await fetch("x"); return r.json(); }`;
    expect(scanRoute("missing.ts", missing).map((f) => f.kind)).toEqual(["no-check"]);
    expect(scanRoute("late.ts", late).map((f) => f.kind)).toEqual(["read-before-check"]);
    expect(scanRoute("stream.ts", stream).map((f) => f.kind)).toEqual(["no-check"]);
    expect(scanRoute("good.ts", good)).toEqual([]);
    expect(scanRoute("nobody.ts", noBody)).toEqual([]);
    expect(scanRoute("other.ts", otherObject)).toEqual([]);
  });
});

describe("isSameOrigin (the template lib/same-origin.ts)", () => {
  const req = (origin: string | null, host = "0.0.0.0:3000", fwd: string | null = null) => ({
    headers: { get: (n: string) => (n === "origin" ? origin : n === "x-forwarded-host" ? fwd : null) },
    nextUrl: { host },
  });
  it("accepts the public host, the forwarded host and the request host", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://radar.gnamak.ch";
    expect(isSameOrigin(req("https://radar.gnamak.ch"))).toBe(true);
    expect(isSameOrigin(req("https://www.example.ch", "0.0.0.0:3000", "www.example.ch"))).toBe(true);
    expect(isSameOrigin(req("http://localhost:3000", "localhost:3000"))).toBe(true);
    expect(allowedOriginHosts(req(null)).has("radar.gnamak.ch")).toBe(true);
  });
  it("refuses another site and a malformed Origin; no Origin = not a browser, the cookie is the gate", () => {
    expect(isSameOrigin(req("https://evil.example"))).toBe(false);
    expect(isSameOrigin(req("null"))).toBe(false);
    expect(isSameOrigin(req(null))).toBe(true);
  });
});
