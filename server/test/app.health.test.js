import assert from "node:assert/strict";
import test from "node:test";
import app from "../src/app.js";

test("GET /api/health responds with ok=true", async () => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.service, "forex-journal-api");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
