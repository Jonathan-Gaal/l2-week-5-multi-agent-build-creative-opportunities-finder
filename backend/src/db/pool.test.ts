import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";

import { sslOptions } from "./pool.ts";

describe("sslOptions", () => {
  it("encrypts by default; off only when asked", () => {
    assert.deepEqual(sslOptions({}), { rejectUnauthorized: false });
    assert.deepEqual(sslOptions({ DATABASE_SSL: "require" }), { rejectUnauthorized: false });
    assert.equal(sslOptions({ DATABASE_SSL: "off" }), false);
  });

  it("verify checks the certificate against the given CA, and needs one", () => {
    const ca = `${mkdtempSync(`${tmpdir()}/ca-`)}/ca.crt`;
    writeFileSync(ca, "CERT");
    assert.deepEqual(sslOptions({ DATABASE_SSL: "verify", DATABASE_SSL_CA: ca }), { rejectUnauthorized: true, ca: "CERT" });
    assert.throws(() => sslOptions({ DATABASE_SSL: "verify" }), /DATABASE_SSL_CA/);
  });

  it("an unknown mode is refused rather than falling back to plain text", () => {
    assert.throws(() => sslOptions({ DATABASE_SSL: "disable" }), /DATABASE_SSL/);
  });
});
