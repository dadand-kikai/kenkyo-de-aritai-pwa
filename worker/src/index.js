const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_SEND_SIZE = 10000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") return corsResponse(null, 204, env, origin);
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") return corsResponse({ ok: true }, 200, env, origin);
    if (url.pathname !== "/api/subscription") return corsResponse({ error: "Not found" }, 404, env, origin);
    if (!allowedOrigin(origin, env)) return corsResponse({ error: "Origin not allowed" }, 403, env, origin);
    try {
      if (request.method === "PUT") return corsResponse(await upsertSubscription(request, env), 200, env, origin);
      if (request.method === "DELETE") return corsResponse(await removeSubscription(request, env), 200, env, origin);
      return corsResponse({ error: "Method not allowed" }, 405, env, origin);
    } catch (error) {
      const status = error.status ?? 500;
      if (status >= 500) console.error("subscription error", error);
      return corsResponse({ error: status >= 500 ? "Server error" : error.message }, status, env, origin);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(dispatchDueNotifications(env));
  }
};

function allowedOrigin(origin, env) {
  return origin && origin === env.ALLOWED_ORIGIN;
}

function corsResponse(value, status, env, origin) {
  const headers = new Headers(JSON_HEADERS);
  if (allowedOrigin(origin, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-methods", "GET, PUT, DELETE, OPTIONS");
    headers.set("access-control-allow-headers", "authorization, content-type, x-device-id");
    headers.set("access-control-max-age", "86400");
  }
  return new Response(value == null ? null : JSON.stringify(value), { status, headers });
}

function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}

function bearerSecret(request) {
  const match = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i);
  if (!match) fail("Invalid device credential", 401);
  return match[1].toLowerCase();
}

async function upsertSubscription(request, env) {
  const secret = bearerSecret(request);
  const body = await request.json().catch(() => fail("Invalid JSON"));
  validateSubscription(body);
  const secretHash = await sha256Hex(secret);
  const existing = await env.DB.prepare("SELECT secret_hash FROM notification_subscriptions WHERE device_id = ?").bind(body.deviceId).first();
  if (existing && !constantTimeEqual(existing.secret_hash, secretHash)) fail("Invalid device credential", 403);
  const now = Math.floor(Date.now() / 1000);
  const nextDue = nextOccurrence(body.timezone, body.minuteOfDay, now * 1000);
  if (existing) {
    await env.DB.prepare(`UPDATE notification_subscriptions SET onesignal_subscription_id=?, timezone=?, minute_of_day=?, enabled=?, next_due=?, updated_at=? WHERE device_id=?`)
      .bind(body.subscriptionId, body.timezone, body.minuteOfDay, body.enabled ? 1 : 0, nextDue, now, body.deviceId).run();
  } else {
    await env.DB.prepare(`INSERT INTO notification_subscriptions (device_id,secret_hash,onesignal_subscription_id,timezone,minute_of_day,enabled,next_due,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(body.deviceId, secretHash, body.subscriptionId, body.timezone, body.minuteOfDay, body.enabled ? 1 : 0, nextDue, now, now).run();
  }
  return { ok: true, nextDue };
}

async function removeSubscription(request, env) {
  const secretHash = await sha256Hex(bearerSecret(request));
  const deviceId = request.headers.get("x-device-id");
  if (!isUuid(deviceId)) fail("Invalid device id");
  const existing = await env.DB.prepare("SELECT secret_hash FROM notification_subscriptions WHERE device_id = ?").bind(deviceId).first();
  if (existing && !constantTimeEqual(existing.secret_hash, secretHash)) fail("Invalid device credential", 403);
  if (existing) await env.DB.prepare("DELETE FROM notification_subscriptions WHERE device_id = ?").bind(deviceId).run();
  return { ok: true };
}

function validateSubscription(body) {
  if (!body || !isUuid(body.deviceId)) fail("Invalid device id");
  if (typeof body.subscriptionId !== "string" || !/^[A-Za-z0-9_-]{8,200}$/.test(body.subscriptionId)) fail("Invalid subscription id");
  if (!Number.isInteger(body.minuteOfDay) || body.minuteOfDay < 0 || body.minuteOfDay >= 1440 || body.minuteOfDay % 15 !== 0) fail("Notification time must use 15 minute intervals");
  if (typeof body.enabled !== "boolean") fail("Invalid enabled state");
  if (typeof body.timezone !== "string" || body.timezone.length > 64) fail("Invalid timezone");
  try { new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }).format(); } catch { fail("Invalid timezone"); }
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function zonedParts(epochMs, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epochMs));
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}

function zonedDateToUtc(parts, timezone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let candidate = target;
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(candidate, timezone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    candidate += target - actualAsUtc;
  }
  return candidate;
}

export function nextOccurrence(timezone, minuteOfDay, nowMs = Date.now()) {
  const now = zonedParts(nowMs, timezone);
  const desired = { year: now.year, month: now.month, day: now.day, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 };
  let candidate = zonedDateToUtc(desired, timezone);
  if (candidate <= nowMs + 30000) {
    const nextDay = new Date(Date.UTC(now.year, now.month - 1, now.day + 1));
    desired.year = nextDay.getUTCFullYear(); desired.month = nextDay.getUTCMonth() + 1; desired.day = nextDay.getUTCDate();
    candidate = zonedDateToUtc(desired, timezone);
  }
  return Math.floor(candidate / 1000);
}

function localDateAt(epochMs, timezone) {
  const p = zonedParts(epochMs, timezone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export async function dispatchDueNotifications(env, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  const result = await env.DB.prepare("SELECT device_id, onesignal_subscription_id, timezone, minute_of_day FROM notification_subscriptions WHERE enabled=1 AND next_due<=? ORDER BY next_due LIMIT 10000").bind(now).all();
  const due = result.results ?? [];
  const groups = new Map();
  for (const row of due) {
    const key = localDateAt(nowMs, row.timezone);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  let sent = 0;
  for (const [localDate, rows] of groups) {
    for (let start = 0; start < rows.length; start += MAX_SEND_SIZE) {
      const chunk = rows.slice(start, start + MAX_SEND_SIZE);
      await sendOneSignal(env, chunk.map((row) => row.onesignal_subscription_id), localDate);
      const updates = chunk.map((row) => ({ deviceId: row.device_id, nextDue: nextOccurrence(row.timezone, row.minute_of_day, nowMs + 60000) }));
      await applyDueUpdates(env, updates, localDate, now);
      sent += chunk.length;
    }
  }
  return { due: due.length, sent };
}

async function sendOneSignal(env, subscriptionIds, localDate) {
  if (!subscriptionIds.length) return;
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Key ${env.ONESIGNAL_REST_API_KEY}` },
    body: JSON.stringify({
      app_id: env.ONESIGNAL_APP_ID,
      include_subscription_ids: subscriptionIds,
      headings: { en: "謙虚でありたい", ja: "謙虚でありたい" },
      contents: { en: "今日の自分を、少し振り返ってみませんか？", ja: "今日の自分を、少し振り返ってみませんか？" },
      url: `${env.APP_URL}/?from=notification#today`,
      collapse_id: `kenkyo-daily-${localDate}`
    })
  });
  if (!response.ok) throw new Error(`OneSignal ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function applyDueUpdates(env, updates, localDate, updatedAt) {
  if (!updates.length) return;
  const json = JSON.stringify(updates);
  await env.DB.prepare(`WITH updates AS (SELECT json_extract(value,'$.deviceId') AS id, CAST(json_extract(value,'$.nextDue') AS INTEGER) AS next_due FROM json_each(?))
    UPDATE notification_subscriptions SET next_due=(SELECT next_due FROM updates WHERE id=device_id), last_sent_local_date=?, updated_at=? WHERE device_id IN (SELECT id FROM updates)`)
    .bind(json, localDate, updatedAt).run();
}
