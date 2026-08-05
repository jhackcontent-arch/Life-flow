// LifeFlow cloud sync API — Cloudflare Worker + D1
//
// Endpoints:
//   POST /sync   body: { code, data }   -> saves/overwrites the blob for that sync code
//   GET  /sync?code=XXXX-XXXX           -> returns the saved blob for that sync code
//
// Setup: bind a D1 database to this Worker with the binding name "DB"
// (Dashboard: Workers & Pages -> your worker -> Settings -> Bindings -> D1 Database).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isValidCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9-]{4,64}$/.test(code);
}

const MAX_PAYLOAD_BYTES = 2_000_000; // 2MB — plenty for this app's JSON state, guards against abuse

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/sync" && request.method === "GET") {
      const code = url.searchParams.get("code");
      if (!isValidCode(code)) return json({ error: "invalid code" }, 400);

      const row = await env.DB.prepare(
        "SELECT data, updated_at FROM user_data WHERE sync_code = ?"
      ).bind(code).first();

      if (!row) return json({ error: "not found" }, 404);
      return json({ data: JSON.parse(row.data), updatedAt: row.updated_at });
    }

    if (url.pathname === "/sync" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json body" }, 400);
      }

      const { code, data } = body || {};
      if (!isValidCode(code)) return json({ error: "invalid code" }, 400);

      const payload = JSON.stringify(data ?? {});
      if (payload.length > MAX_PAYLOAD_BYTES) return json({ error: "payload too large" }, 413);

      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO user_data (sync_code, data, updated_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(sync_code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).bind(code, payload, now, now).run();

      return json({ ok: true, updatedAt: now });
    }

    return json({ error: "not found", hint: "use GET or POST /sync?code=..." }, 404);
  },
};
