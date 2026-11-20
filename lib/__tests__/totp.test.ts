/**
 * Ported from the client template lib/__tests__/totp.test.ts.
 * Changes: the database comes from ./support/test-db (this app's migrations), the
 * accounts are inserted without the template's role column (this app: users.is_admin), and
 * the otpauth issuer is this app's.
 *
 * lib/totp.ts against the RFC 6238 appendix vectors, the accept window, replay
 * protection, and lib/totp-store.ts (enrol, verify, backup codes used once)
 * on an in-memory SQLite with every migration applied.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => (await import("./support/test-db")).makeTestDbModule());

import {
  base32Decode,
  base32Encode,
  consumeBackupCode,
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  hotp,
  otpauthUri,
  totp,
  totpStep,
  verifyTotp,
} from "@/lib/totp";
import {
  adminResetTotp,
  cancelReenrolment,
  checkSecondFactor,
  enableTotp,
  getTotp,
  isTotpEnabled,
  needsSecondFactor,
  startEnrolment,
  TotpUnavailableError,
  startReenrolment,
} from "@/lib/totp-store";
import { sqlite as rawConn } from "@/lib/db";

const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET); // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ

describe("RFC 6238 appendix B (SHA1, secret 12345678901234567890)", () => {
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  it.each(vectors)("T=%s -> %s", (t, code) => {
    expect(totp(RFC_SECRET, t * 1000, { digits: 8 })).toBe(code);
    // 6 digits are the last six of the same truncation.
    expect(totp(RFC_SECRET, t * 1000)).toBe(code.slice(-6));
  });
  it("RFC 4226 HOTP vectors for counters 0..3", () => {
    expect(["755224", "287082", "359152", "969429"]).toEqual([0, 1, 2, 3].map((c) => hotp(RFC_SECRET, c)));
  });
  it("base32 round-trips and the RFC secret encodes as expected", () => {
    expect(RFC_SECRET_B32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(Buffer.from(base32Decode(RFC_SECRET_B32))).toEqual(RFC_SECRET);
    const s = generateSecret();
    expect(s).toHaveLength(32);
    expect(base32Decode(s)).toHaveLength(20);
  });
  it("builds an otpauth URI an app can import", () => {
    const uri = otpauthUri({ secretBase32: RFC_SECRET_B32, account: "a@b.ch", issuer: "Powercoders Job Radar" });
    expect(uri).toBe(
      `otpauth://totp/Powercoders%20Job%20Radar%3Aa%40b.ch?secret=${RFC_SECRET_B32}&issuer=Powercoders%20Job%20Radar&algorithm=SHA1&digits=6&period=30`,
    );
  });
});

describe("verifyTotp: window and replay", () => {
  const now = 1111111111 * 1000; // step 37037037
  const at = (stepDelta: number) => totp(RFC_SECRET, now + stepDelta * 30_000);

  it("accepts the current step and one either side, not two", () => {
    expect(verifyTotp(RFC_SECRET_B32, at(0), { nowMs: now })).toEqual({ ok: true, step: totpStep(now) });
    expect(verifyTotp(RFC_SECRET_B32, at(-1), { nowMs: now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, at(1), { nowMs: now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, at(2), { nowMs: now })).toEqual({ ok: false, reason: "mismatch" });
    expect(verifyTotp(RFC_SECRET_B32, at(-2), { nowMs: now })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("refuses a code at or before the last accepted step (replay)", () => {
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET_B32, at(0), { nowMs: now, lastUsedStep: step })).toEqual({ ok: false, reason: "replay" });
    expect(verifyTotp(RFC_SECRET_B32, at(-1), { nowMs: now, lastUsedStep: step })).toEqual({ ok: false, reason: "replay" });
    // The NEXT step is still fine (the phone is slightly ahead).
    expect(verifyTotp(RFC_SECRET_B32, at(1), { nowMs: now, lastUsedStep: step })).toEqual({ ok: true, step: step + 1 });
  });
  it("tolerates spaces and dashes, rejects anything but six digits", () => {
    const c = at(0);
    expect(verifyTotp(RFC_SECRET_B32, `${c.slice(0, 3)} ${c.slice(3)}`, { nowMs: now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, "12345", { nowMs: now })).toEqual({ ok: false, reason: "format" });
    expect(verifyTotp(RFC_SECRET_B32, "abcdef", { nowMs: now })).toEqual({ ok: false, reason: "format" });
  });
});

describe("backup codes", () => {
  it("generates 8 distinct codes, each usable once", () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((c) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(c))).toBe(true);
    const hashes = codes.map(hashBackupCode);
    const after = consumeBackupCode(hashes, codes[3].toUpperCase().replace("-", " "));
    expect(after).toHaveLength(7);
    expect(consumeBackupCode(after!, codes[3])).toBeNull();
    expect(consumeBackupCode(hashes, "nope-nope")).toBeNull();
  });
});

describe("totp-store on a real database", () => {
  const U = "u-ops";
  beforeEach(() => {
    rawConn.exec("DELETE FROM user_totp; DELETE FROM admin_audit_log; DELETE FROM users;");
    rawConn.prepare("INSERT INTO users (id, email, name, is_admin, created_at) VALUES (?, ?, ?, 1, '2026-01-01')").run(U, "ops@example.com", "Ops");
  });

  it("enrol: start, wrong code refused, right code enables and returns backup codes once", () => {
    expect(isTotpEnabled(U)).toBe(false);
    const started = startEnrolment(U);
    expect("secret" in started).toBe(true);
    const secret = (started as { secret: string }).secret;
    const now = Date.now();
    expect(enableTotp(U, "000000", now)).toEqual({ ok: false, error: "invalid_code" });
    expect(isTotpEnabled(U)).toBe(false);
    const code = totp(base32Decode(secret), now);
    const res = enableTotp(U, code, now);
    expect(res.ok).toBe(true);
    const codes = (res as { backupCodes: string[] }).backupCodes;
    expect(codes).toHaveLength(8);
    expect(isTotpEnabled(U)).toBe(true);
    // The row holds hashes only.
    expect(getTotp(U)!.backupCodes).not.toContain(codes[0]);
    expect(enableTotp(U, code, now)).toEqual({ ok: false, error: "already_enabled" });
    expect(startEnrolment(U)).toEqual({ error: "already_enabled" });

    // The enabling code's step is consumed: the same code is a replay.
    expect(checkSecondFactor(U, code, now)).toEqual({ ok: false });
    const next = totp(base32Decode(secret), now + 30_000);
    expect(checkSecondFactor(U, next, now + 30_000)).toEqual({ ok: true, via: "totp", backupCodesLeft: 8 });
    expect(checkSecondFactor(U, next, now + 30_000)).toEqual({ ok: false });

    // Backup code: once.
    expect(checkSecondFactor(U, codes[0], now + 60_000)).toEqual({ ok: true, via: "backup", backupCodesLeft: 7 });
    expect(checkSecondFactor(U, codes[0], now + 60_000)).toEqual({ ok: false });

    // There is no switch-off any more: an enabled factor stays.
    expect(isTotpEnabled(U)).toBe(true);
  });

  it("re-setup: needs a current code, the old secret stays live until the new one is confirmed", () => {
    const secret = (startEnrolment(U) as { secret: string }).secret;
    const t0 = Date.now();
    const first = enableTotp(U, totp(base32Decode(secret), t0), t0) as { ok: true; backupCodes: string[] };
    expect(first.ok).toBe(true);

    // Wrong code: nothing starts.
    expect(startReenrolment(U, "000000", t0 + 30_000)).toEqual({ ok: false, error: "invalid_code" });
    expect(getTotp(U)!.pendingSecret).toBeNull();

    // A backup code works as the proof (and is consumed).
    const started = startReenrolment(U, first.backupCodes[0], t0 + 30_000) as { ok: true; secret: string };
    expect(started.ok).toBe(true);
    expect(started.secret).not.toBe(secret);
    expect(getTotp(U)!.secret).toBe(secret);
    expect(getTotp(U)!.pendingSecret).toBe(started.secret);

    // Meanwhile the OLD secret still logs in; the new one does not (yet).
    const oldCode = totp(base32Decode(secret), t0 + 60_000);
    const newCode = totp(base32Decode(started.secret), t0 + 60_000);
    expect(checkSecondFactor(U, newCode, t0 + 60_000)).toEqual({ ok: false });
    expect(checkSecondFactor(U, oldCode, t0 + 60_000).ok).toBe(true);
    expect(isTotpEnabled(U)).toBe(true);

    // A code of the OLD secret does not confirm the new one.
    expect(enableTotp(U, totp(base32Decode(secret), t0 + 90_000), t0 + 90_000)).toEqual({ ok: false, error: "invalid_code" });
    expect(getTotp(U)!.secret).toBe(secret);

    // Confirming swaps the secret and replaces the backup codes.
    const done = enableTotp(U, totp(base32Decode(started.secret), t0 + 120_000), t0 + 120_000) as { ok: true; backupCodes: string[] };
    expect(done.ok).toBe(true);
    const row = getTotp(U)!;
    expect(row.secret).toBe(started.secret);
    expect(row.pendingSecret).toBeNull();
    expect(JSON.parse(row.backupCodes)).toHaveLength(8);
    expect(checkSecondFactor(U, first.backupCodes[1], t0 + 150_000)).toEqual({ ok: false });
    expect(checkSecondFactor(U, done.backupCodes[0], t0 + 150_000).ok).toBe(true);
  });

  it("re-setup can be cancelled; a not-enabled account cannot start one", () => {
    expect(startReenrolment(U, "123456")).toEqual({ ok: false, error: "not_enabled" });
    const secret = (startEnrolment(U) as { secret: string }).secret;
    const t0 = Date.now();
    enableTotp(U, totp(base32Decode(secret), t0), t0);
    startReenrolment(U, totp(base32Decode(secret), t0 + 30_000), t0 + 30_000);
    expect(getTotp(U)!.pendingSecret).not.toBeNull();
    cancelReenrolment(U);
    expect(getTotp(U)!.pendingSecret).toBeNull();
    expect(isTotpEnabled(U)).toBe(true);
  });

  it("admin reset: removes the row, audits, refuses self and strangers", () => {
    const A = "u-admin";
    rawConn.prepare("INSERT INTO users (id, email, name, is_admin, created_at) VALUES (?, ?, ?, 1, '2026-01-01')").run(A, "admin@example.com", "Admin");
    const secret = (startEnrolment(U) as { secret: string }).secret;
    const t0 = Date.now();
    enableTotp(U, totp(base32Decode(secret), t0), t0);

    expect(adminResetTotp({ actorId: U, targetUserId: U })).toEqual({ ok: false, error: "self_reset" });
    expect(isTotpEnabled(U)).toBe(true);
    expect(adminResetTotp({ actorId: A, targetUserId: "nobody" })).toEqual({ ok: false, error: "user_not_found" });
    expect(adminResetTotp({ actorId: A, targetUserId: A })).toEqual({ ok: false, error: "self_reset" });

    expect(adminResetTotp({ actorId: A, targetUserId: U })).toEqual({ ok: true });
    expect(getTotp(U)).toBeNull();
    expect(adminResetTotp({ actorId: A, targetUserId: U })).toEqual({ ok: false, error: "not_enrolled" });
    const log = rawConn.prepare("SELECT admin_user_id, action, target_id FROM admin_audit_log WHERE action = 'reset_2fa'").all();
    expect(log).toEqual([{ admin_user_id: A, action: "reset_2fa", target_id: U }]);
  });

  it("a read error is not «not enrolled»: it throws (this app fails closed, the template answered null)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    rawConn.exec("ALTER TABLE user_totp RENAME TO user_totp_gone;");
    try {
      expect(() => getTotp(U)).toThrow(TotpUnavailableError);
      expect(() => isTotpEnabled(U)).toThrow(TotpUnavailableError);
      expect(() => needsSecondFactor({ id: U, isAdmin: true })).toThrow(TotpUnavailableError);
    } finally {
      rawConn.exec("ALTER TABLE user_totp_gone RENAME TO user_totp;");
      err.mockRestore();
    }
  });

  it("an account that never enrolled has no second step", () => {
    expect(checkSecondFactor(U, "123456")).toEqual({ ok: false });
    expect(enableTotp(U, "123456")).toEqual({ ok: false, error: "not_started" });
  });
});
