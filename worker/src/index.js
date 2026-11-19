const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY = 64 * 1024;

function response(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "https://xerobrin9908-blip.github.io").split(",").map(x => x.trim());
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0],
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}
function validClientId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
}
function validConfig(config) {
  if (!config || typeof config !== "object") return false;
  if (!["casegraph", "cursor"].includes(config.type)) return false;
  if (typeof config.name !== "string" || !config.name.trim() || config.name.length > 80) return false;
  if (typeof config.data !== "object" || !config.data) return false;
  if (config.type === "casegraph") return config.data.s && typeof config.data.s === "object" && !Array.isArray(config.data.s);
  return config.data.c && typeof config.data.c === "object" && !Array.isArray(config.data.c);
}
async function readBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(text);
}
function admin(request, env) {
  const token = env.ADMIN_TOKEN;
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return !!token && supplied.length > 0 && supplied === token;
}
async function stats(db, id) {
  const row = await db.prepare(
    "SELECT (SELECT COUNT(*) FROM votes WHERE config_id=? AND value=1) AS likes, (SELECT COUNT(*) FROM votes WHERE config_id=? AND value=-1) AS dislikes, (SELECT downloads FROM config_stats WHERE config_id=?) AS downloads"
  ).bind(id, id, id).first();
  return { likes: row?.likes || 0, dislikes: row?.dislikes || 0, downloads: row?.downloads || 0 };
}
async function route(request, env) {
  if (!env.DB) return response({ error: "D1 binding DB is not configured" }, 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "GET" && path === "/api/health") {
    return response({ ok: true, service: "casegraph-api", database: "bound" });
  }

  if (method === "GET" && path === "/api/configs") {
    const result = await env.DB.prepare(
      "SELECT id,type,name,author,created_at,data_json FROM configs WHERE status='approved' ORDER BY created_at DESC"
    ).all();
    const configs = await Promise.all((result.results || []).map(async row => ({
      id: row.id, type: row.type, name: row.name, author: row.author,
      created: row.created_at, data: JSON.parse(row.data_json), stats: await stats(env.DB, row.id)
    })));
    return response({ configs });
  }

  if (method === "GET" && path === "/api/me/submissions") {
    const clientId = url.searchParams.get("client_id") || "";
    if (!validClientId(clientId)) return response({ error: "Invalid client_id" }, 400);
    const result = await env.DB.prepare(
      "SELECT id,type,name,author,created_at,data_json,status,review_note FROM submissions WHERE client_id=? ORDER BY created_at DESC LIMIT 100"
    ).bind(clientId).all();
    return response({ submissions: (result.results || []).map(row => ({
      id: row.id, type: row.type, name: row.name, author: row.author, created: row.created_at,
      data: JSON.parse(row.data_json), status: row.status, review_note: row.review_note
    })) });
  }

  if (method === "POST" && path === "/api/submissions") {
    let body;
    try { body = await readBody(request); } catch (error) {
      return response({ error: error.message === "BODY_TOO_LARGE" ? "Payload is too large" : "Invalid JSON" }, error.message === "BODY_TOO_LARGE" ? 413 : 400);
    }
    if (!validClientId(body.client_id)) return response({ error: "Invalid client_id" }, 400);
    if (!validConfig(body.config)) return response({ error: "Invalid config format" }, 400);
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM submissions WHERE client_id=? AND created_at >= datetime('now','-1 hour')"
    ).bind(body.client_id).first();
    if ((recent?.n || 0) >= 5) return response({ error: "Submission limit reached. Try again later." }, 429);
    const id = crypto.randomUUID();
    const created = new Date().toISOString();
    const config = body.config;
    await env.DB.prepare(
      "INSERT INTO submissions (id,client_id,type,name,author,created_at,data_json,status) VALUES (?,?,?,?,?,?,?,'pending')"
    ).bind(id, body.client_id, config.type, config.name.trim().slice(0,80),
      String(config.author || "Community").slice(0,60), created, JSON.stringify(config.data)).run();
    return response({ ok: true, submission: { id, status: "pending", created_at: created } }, 201);
  }

  if (method === "POST" && path === "/api/votes") {
    let body;
    try { body = await readBody(request); } catch { return response({ error: "Invalid JSON" }, 400); }
    if (!validClientId(body.client_id) || typeof body.config_id !== "string" || !["like","dislike","clear"].includes(body.vote)) {
      return response({ error: "Invalid vote payload" }, 400);
    }
    const exists = await env.DB.prepare("SELECT id FROM configs WHERE id=? AND status='approved'").bind(body.config_id).first();
    if (!exists) return response({ error: "Config not found" }, 404);
    if (body.vote === "clear") {
      await env.DB.prepare("DELETE FROM votes WHERE config_id=? AND client_id=?").bind(body.config_id, body.client_id).run();
    } else {
      const value = body.vote === "like" ? 1 : -1;
      await env.DB.prepare(
        "INSERT INTO votes (config_id,client_id,value,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(config_id,client_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
      ).bind(body.config_id, body.client_id, value).run();
    }
    return response({ ok: true, stats: await stats(env.DB, body.config_id) });
  }

  if (method === "POST" && path === "/api/downloads") {
    let body;
    try { body = await readBody(request); } catch { return response({ error: "Invalid JSON" }, 400); }
    if (typeof body.config_id !== "string") return response({ error: "Invalid config_id" }, 400);
    const exists = await env.DB.prepare("SELECT id FROM configs WHERE id=? AND status='approved'").bind(body.config_id).first();
    if (!exists) return response({ error: "Config not found" }, 404);
    await env.DB.prepare(
      "INSERT INTO config_stats (config_id,downloads) VALUES (?,1) ON CONFLICT(config_id) DO UPDATE SET downloads=downloads+1"
    ).bind(body.config_id).run();
    return response({ ok: true, stats: await stats(env.DB, body.config_id) });
  }

  if (path.startsWith("/api/admin/")) {
    if (!admin(request, env)) return response({ error: "Unauthorized" }, 401);
    if (method === "GET" && path === "/api/admin/submissions") {
      const result = await env.DB.prepare(
        "SELECT id,client_id,type,name,author,created_at,data_json,status,review_note FROM submissions WHERE status='pending' ORDER BY created_at ASC"
      ).all();
      return response({ submissions: (result.results || []).map(row => ({
        id: row.id, client_id: row.client_id, type: row.type, name: row.name, author: row.author,
        created: row.created_at, data: JSON.parse(row.data_json), status: row.status
      })) });
    }
    if (method === "POST" && path === "/api/admin/moderate") {
      let body;
      try { body = await readBody(request); } catch { return response({ error: "Invalid JSON" }, 400); }
      if (typeof body.id !== "string" || !["approve","reject"].includes(body.action)) return response({ error: "Invalid moderation payload" }, 400);
      const row = await env.DB.prepare(
        "SELECT id,type,name,author,created_at,data_json,status FROM submissions WHERE id=?"
      ).bind(body.id).first();
      if (!row) return response({ error: "Submission not found" }, 404);
      if (row.status !== "pending") return response({ error: "Submission has already been reviewed" }, 409);
      const note = String(body.note || "").slice(0,500);
      if (body.action === "approve") {
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO configs (id,submission_id,type,name,author,created_at,data_json,status) VALUES (?,?,?,?,?,?,?,'approved')"
          ).bind(row.id, row.id, row.type, row.name, row.author, row.created_at, row.data_json),
          env.DB.prepare("INSERT INTO config_stats (config_id,downloads) VALUES (?,0)").bind(row.id),
          env.DB.prepare("UPDATE submissions SET status='approved',review_note=? WHERE id=?").bind(note, row.id)
        ]);
      } else {
        await env.DB.prepare("UPDATE submissions SET status='rejected',review_note=? WHERE id=?").bind(note, row.id).run();
      }
      return response({ ok: true, id: row.id, status: body.action === "approve" ? "approved" : "rejected" });
    }
  }
  return response({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const result = await route(request, env);
      const merged = new Headers(result.headers);
      for (const [key, value] of Object.entries(headers)) merged.set(key, value);
      return new Response(result.body, { status: result.status, headers: merged });
    } catch (error) {
      console.error("CaseGraph API error", error);
      return response({ error: "Internal server error" }, 500, headers);
    }
  }
};
