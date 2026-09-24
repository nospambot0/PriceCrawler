/**
 * Cloudflare Worker backend for the FiversCan/NexusGGR lobby.
 * Credentials are Cloudflare Worker secrets:
 * FVS_API_URL, FVS_AGENT_CODE, FVS_AGENT_TOKEN
 */
const CATALOG_TTL = 300;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function validUser(value) {
  const user = String(value || "");
  if (!/^[A-Za-z0-9_]{1,32}$/.test(user)) throw new Error("user must be 1-32 chars of [A-Za-z0-9_]");
  return user;
}

function validProvider(value) {
  const provider = String(value || "");
  if (!/^[A-Za-z0-9_]{1,32}$/.test(provider)) throw new Error("provider is required");
  return provider;
}

async function fiversCall(env, method, params = {}) {
  if (!env.FVS_API_URL || !env.FVS_AGENT_CODE || !env.FVS_AGENT_TOKEN) {
    throw new Error("FiversCan credentials are not configured");
  }

  const res = await fetch(env.FVS_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      method,
      agent_code: env.FVS_AGENT_CODE,
      agent_token: env.FVS_AGENT_TOKEN,
      ...params,
    }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`${method}: invalid API response`); }

  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  if (data.status !== 1) throw new Error(data.msg || `${method} failed`);
  return data;
}

async function cachedCatalog(request, env, key, loader) {
  const cache = caches.default;
  const cacheRequest = new Request(new URL(`https://catalog.local/${key}`), { method: "GET" });
  const cached = await cache.match(cacheRequest);
  if (cached) return cached;

  const data = await loader();
  const response = json(data);
  const cacheResponse = new Response(response.body, response);
  cacheResponse.headers.set("cache-control", `public, max-age=${CATALOG_TTL}`);
  await cache.put(cacheRequest, cacheResponse.clone());
  return cacheResponse;
}

async function handleApi(request, env, url) {
  const action = url.searchParams.get("action") || url.pathname.split("/").pop();
  let input = Object.fromEntries(url.searchParams.entries());

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";
    input = contentType.includes("application/json")
      ? (await request.json().catch(() => ({})))
      : Object.fromEntries(await request.formData());
  }

  if (action === "providers" && request.method === "GET") {
    return cachedCatalog(request, env, "providers", async () => ({
      ok: true,
      providers: (await fiversCall(env, "provider_list")).providers || [],
    }));
  }

  if (action === "games" && request.method === "GET") {
    const provider = validProvider(input.provider);
    return cachedCatalog(request, env, `games-${provider}`, async () => ({
      ok: true,
      games: (await fiversCall(env, "game_list", { provider_code: provider })).games || [],
    }));
  }

  if (action === "balance" && request.method === "GET") {
    const user = validUser(input.user);
    try {
      const info = await fiversCall(env, "money_info", { user_code: user });
      return json({ ok: true, agent_balance: info.agent?.balance ?? 0, user_balance: info.user?.balance ?? 0 });
    } catch (e) {
      if (/invalid user/i.test(e.message)) {
        const info = await fiversCall(env, "money_info");
        return json({ ok: true, agent_balance: info.agent?.balance ?? 0, user_balance: 0, new_user: true });
      }
      throw e;
    }
  }

  if (action === "launch") {
    if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
    const user = validUser(input.user);
    const provider = validProvider(input.provider);
    const game = String(input.game || "");
    const lang = /^[a-z]{2}(-[a-z]{2,4})?$/i.test(String(input.lang || "")) ? String(input.lang) : "en";
    const lobby = `${url.origin}/`;
    const data = await fiversCall(env, "game_launch", {
      user_code: user,
      provider_code: provider,
      game_code: game,
      lang,
      lobby_url: lobby,
    });
    const launchUrl = data.launch_url;
    if (!/^https?:\\/\\//i.test(launchUrl || "")) throw new Error("game service returned an invalid launch URL");
    return json({ ok: true, launch_url: launchUrl });
  }

  if (action === "deposit" || action === "withdraw") {
    if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
    const user = validUser(input.user);
    const amount = Number(input.amount);
    if (!(amount > 0) || !Number.isFinite(amount)) return json({ ok: false, error: "amount must be greater than 0" }, 400);
    const sign = `${action === "deposit" ? "dep" : "wd"}_${user}_${crypto.randomUUID().replaceAll("-", "")}`;
    const method = action === "deposit" ? "user_deposit" : "user_withdraw";
    const data = await fiversCall(env, method, { user_code: user, amount, agent_sign: sign });
    return json({ ok: true, agent_balance: data.agent_balance, user_balance: data.user_balance });
  }

  return json({ ok: false, error: "unknown action" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      // Keep the frontend assets on the same Worker. Requires the ASSETS binding from wrangler.toml.
      if (env.ASSETS) return env.ASSETS.fetch(request);

      return new Response("Worker is online. Configure static assets.", { status: 200 });
    } catch (e) {
      console.error(e);
      return json({ ok: false, error: e instanceof Error ? e.message : "internal error" }, 502);
    }
  },
};
