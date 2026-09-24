function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

function scoreDeal(price, typical) {
  if (!typical || typical <= 0 || price <= 0) return 0;
  const pct = Math.max(0, (typical - price) / typical * 100);
  return Math.min(100, Math.round(pct * 2));
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c] || c));
}

function money(n, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(Number(n));
  } catch {
    return "₹" + Number(n || 0).toLocaleString("en-IN");
  }
}

const MIN_DEAL_DISCOUNT_PCT = 50;
const MIN_DEAL_SCORE = MIN_DEAL_DISCOUNT_PCT * 2;

const DEFAULT_QUERIES = [
  "iphone",
  "laptop",
  "headphones",
  "smartwatch",
  "television",
  "gaming",
  "air conditioner",
  "washing machine"
];

function getQueries(env) {
  return String(env.PRICE_QUERIES || DEFAULT_QUERIES.join(","))
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .slice(0, 20);
}

async function scraperRequest(env, targetUrl, extra = {}) {
  if (!env.SCRAPERAPI_KEY) {
    throw new Error("SCRAPERAPI_KEY is not configured in Cloudflare");
  }

  const u = new URL("https://api.scraperapi.com/");
  u.searchParams.set("api_key", env.SCRAPERAPI_KEY);
  u.searchParams.set("url", targetUrl);

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null && value !== "") {
      u.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(u.toString(), {
    headers: { "accept": "*/*" }
  });

  if (!response.ok) {
    throw new Error("ScraperAPI returned HTTP " + response.status);
  }

  return response.text();
}

function numberFromPrice(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractJsonLdProducts(html) {
  const products = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\\s\\S]*?)<\/script>/gi;
  let m;

  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const list = Array.isArray(data) ? data : [data];

      for (const item of list) {
        if (item?.["@type"] === "Product") {
          const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          const price = numberFromPrice(offers?.price ?? item.price);
          if (item.name && price && offers?.url) {
            products.push({
              title: item.name,
              price,
              url: offers.url,
              image_url: Array.isArray(item.image) ? item.image[0] : item.image,
              store: "Flipkart",
              currency: offers.priceCurrency || "INR"
            });
          }
        }

        if (item?.itemListElement && Array.isArray(item.itemListElement)) {
          for (const entry of item.itemListElement) {
            const p = entry.item;
            const offers = Array.isArray(p?.offers) ? p.offers[0] : p?.offers;
            const price = numberFromPrice(offers?.price);
            if (p?.name && price && (p.url || offers?.url)) {
              products.push({
                title: p.name,
                price,
                typical_price: numberFromPrice(offers?.highPrice ?? p.highPrice ?? p.mrp),
                url: p.url || offers.url,
                image_url: Array.isArray(p.image) ? p.image[0] : p.image,
                store: "Flipkart",
                currency: offers.priceCurrency || "INR"
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  return products;
}

async function fetchAmazon(env, queries) {
  if (!env.SCRAPERAPI_KEY) return [];

  const all = [];

  for (const query of queries) {
    const u = new URL("https://api.scraperapi.com/structured/amazon/search");
    u.searchParams.set("api_key", env.SCRAPERAPI_KEY);
    u.searchParams.set("query", query);
    u.searchParams.set("country_code", "in");
    u.searchParams.set("tld", "in");
    u.searchParams.set("output_format", "json");

    const response = await fetch(u.toString());
    if (!response.ok) continue;

    let data;
    try { data = await response.json(); } catch (_) { continue; }

    for (const item of (data?.results || [])) {
      const price = numberFromPrice(item.price);
      if (!item?.name || !price || !item?.url) continue;

      all.push({
        id: item.asin ? "amazon-" + item.asin : undefined,
        title: item.name,
        store: "Amazon",
        price,
        typical_price: numberFromPrice(item.list_price ?? item.rrp ?? item.mrp ?? item.strikethrough_price),
        currency: "INR",
        url: item.url,
        image_url: item.image || null
      });
    }
  }

  return all;
}

async function fetchFlipkart(env, queries) {
  if (!env.SCRAPERAPI_KEY) return [];

  const all = [];

  for (const query of queries) {
    const target = "https://www.flipkart.com/search?q=" + encodeURIComponent(query);
    try {
      const html = await scraperRequest(env, target, {
        country_code: "in",
        render: "true"
      });
      all.push(...extractJsonLdProducts(html));
    } catch (_) {}
  }

  return all;
}


async function runDiagnostics(env) {
  const secretPresent = typeof env.SCRAPERAPI_KEY === "string" && env.SCRAPERAPI_KEY.trim().length > 0;
  const secretType = typeof env.SCRAPERAPI_KEY;
  const result = {
    scraperApi: {
      status: secretPresent ? "configured" : "missing",
      detail: secretPresent
        ? "Secret detected by Worker"
        : "Worker runtime cannot see a non-empty SCRAPERAPI_KEY"
    },
    runtime: {
      secretType,
      secretLength: secretPresent ? env.SCRAPERAPI_KEY.length : 0,
      bindings: Object.keys(env || {}).filter(k => !/key|secret|token|password/i.test(k)).join(", ") || "none"
    },
    amazon: { status: "not tested", detail: "Waiting for ScraperAPI" },
    flipkart: { status: "not tested", detail: "Waiting for ScraperAPI" }
  };

  if (!env.SCRAPERAPI_KEY) return result;

  // Lightweight live connectivity checks. Never expose the API key.
  try {
    const u = new URL("https://api.scraperapi.com/structured/amazon/search");
    u.searchParams.set("api_key", env.SCRAPERAPI_KEY);
    u.searchParams.set("query", "iphone");
    u.searchParams.set("country_code", "in");
    u.searchParams.set("tld", "in");
    u.searchParams.set("output_format", "json");
    const r = await fetch(u.toString());
    if (!r.ok) {
      result.amazon = { status: "error", detail: "ScraperAPI HTTP " + r.status };
    } else {
      let data = {};
      try { data = await r.json(); } catch (_) {}
      const count = Array.isArray(data?.results) ? data.results.length : 0;
      result.amazon = {
        status: count > 0 ? "ok" : "connected",
        detail: count > 0 ? count + " Amazon results received" : "ScraperAPI responded, but returned 0 Amazon results"
      };
    }
  } catch (e) {
    result.amazon = { status: "error", detail: e.message };
  }

  try {
    const target = "https://www.flipkart.com/search?q=" + encodeURIComponent("iphone");
    const r = await fetch(new URL("https://api.scraperapi.com/?api_key=" + encodeURIComponent(env.SCRAPERAPI_KEY) + "&url=" + encodeURIComponent(target) + "&country_code=in&render=true"));
    if (!r.ok) {
      result.flipkart = { status: "error", detail: "ScraperAPI HTTP " + r.status };
    } else {
      const body = await r.text();
      const products = extractJsonLdProducts(body);
      result.flipkart = {
        status: products.length > 0 ? "ok" : "connected",
        detail: products.length > 0 ? products.length + " Flipkart products parsed" : "ScraperAPI responded, but no structured Flipkart products were parsed"
      };
    }
  } catch (e) {
    result.flipkart = { status: "error", detail: e.message };
  }

  return result;
}

async function fetchSource(env) {
  if (env.DEALS_SOURCE_URL) {
    const r = await fetch(env.DEALS_SOURCE_URL, {
      headers: { "accept": "application/json", "cache-control": "no-cache" }
    });
    if (!r.ok) throw new Error("Deal source returned " + r.status);
    const data = await r.json();
    return Array.isArray(data) ? data : (Array.isArray(data.deals) ? data.deals : []);
  }

  if (!env.SCRAPERAPI_KEY) return [];

  const queries = getQueries(env);
  const [amazon, flipkart] = await Promise.all([
    fetchAmazon(env, queries),
    fetchFlipkart(env, queries)
  ]);

  const unique = new Map();
  for (const item of [...amazon, ...flipkart]) {
    const key = item.id || item.url;
    if (key && !unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()];
}

async function initDb(env) {
  if (!env.DB) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      store TEXT NOT NULL,
      price REAL NOT NULL,
      previous_price REAL,
      typical_price REAL,
      currency TEXT NOT NULL DEFAULT 'INR',
      url TEXT NOT NULL,
      image_url TEXT,
      detected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT NOT NULL,
      price REAL NOT NULL,
      captured_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS saved_deals (
      deal_id TEXT PRIMARY KEY,
      saved_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_deals_score ON deals(score DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_history_deal ON price_history(deal_id, captured_at DESC)`)
  ]);
  // One-time cleanup for demo records from earlier builds.
  await env.DB.prepare("DELETE FROM price_history WHERE deal_id IN ('demo-airpods-pro','demo-samsung-tv')").run();
  await env.DB.prepare("DELETE FROM saved_deals WHERE deal_id IN ('demo-airpods-pro','demo-samsung-tv')").run();
  await env.DB.prepare("DELETE FROM deals WHERE id IN ('demo-airpods-pro','demo-samsung-tv')").run();
}

async function seedDemoIfEmpty(env) {
  // Intentionally empty: PriceCrawler never creates fake/demo deals.
}
async function scan(env) {
  const now = new Date().toISOString();
  const items = await fetchSource(env);

  if (!env.DB) return { count: items.length, configured: Boolean(env.SCRAPERAPI_KEY || env.DEALS_SOURCE_URL) };

  for (const raw of items) {
    if (!raw?.title || !raw?.store || raw?.price == null || !raw?.url) continue;

    const id = String(raw.id || crypto.randomUUID());
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price <= 0) continue;

    const typical = Number(raw.typical_price || raw.previous_price || price);
    const previous = raw.previous_price == null ? null : Number(raw.previous_price);

    const old = await env.DB.prepare("SELECT price, typical_price FROM deals WHERE id = ?").bind(id).first();

    const historical = old?.price ? Number(old.price) : null;
    const suppliedTypical = raw.typical_price == null ? null : Number(raw.typical_price);
    const effectiveTypical = suppliedTypical && suppliedTypical > price
      ? suppliedTypical
      : (historical && historical > price ? historical : price);
    const effectivePrevious = previous != null
      ? previous
      : historical;

    const score = scoreDeal(price, effectiveTypical);

    await env.DB.prepare(`INSERT INTO deals
      (id,title,store,price,previous_price,typical_price,currency,url,image_url,detected_at,updated_at,score)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, store=excluded.store, price=excluded.price,
        previous_price=excluded.previous_price, typical_price=excluded.typical_price,
        currency=excluded.currency, url=excluded.url, image_url=excluded.image_url,
        updated_at=excluded.updated_at, score=excluded.score`)
      .bind(
        id,String(raw.title),String(raw.store),price,effectivePrevious,effectiveTypical,
        String(raw.currency || "INR"),String(raw.url),raw.image_url || null,
        now,now,score
      ).run();

    if (!old || Number(old.price) !== price) {
      await env.DB.prepare(
        "INSERT INTO price_history (deal_id,price,captured_at) VALUES (?,?,?)"
      ).bind(id,price,now).run();
    }
  }

  return {
    count: items.length,
    sources: [...new Set(items.map(x => x.store).filter(Boolean))],
    configured: Boolean(env.SCRAPERAPI_KEY || env.DEALS_SOURCE_URL)
  };
}

async function getDeals(env, savedOnly = false) {
  if (!env.DB) return [];

  const query = savedOnly
    ? `SELECT d.*, 1 AS saved
       FROM deals d INNER JOIN saved_deals s ON s.deal_id=d.id
       WHERE d.score >= ?
       ORDER BY d.score DESC,d.updated_at DESC`
    : `SELECT d.*, CASE WHEN s.deal_id IS NULL THEN 0 ELSE 1 END AS saved
       FROM deals d LEFT JOIN saved_deals s ON s.deal_id=d.id
       WHERE d.score >= ?
       ORDER BY d.score DESC,d.updated_at DESC`;

  const { results } = await env.DB.prepare(query).bind(MIN_DEAL_SCORE).all();
  return results || [];
}

function renderCard(d) {
  const pct = d.typical_price
    ? Math.max(0,Math.round((d.typical_price-d.price)/d.typical_price*100))
    : 0;

  return `<article class="card">
    ${d.image_url ? `<img class="pic" src="${esc(d.image_url)}" alt="">` : ""}
    <div class="body">
      <div class="store">${esc(d.store)}</div>
      <div class="title">${esc(d.title)}</div>
      <div>
        <span class="price">${esc(money(d.price,d.currency || "INR"))}</span>
        ${d.previous_price ? `<span class="old">${esc(money(d.previous_price,d.currency || "INR"))}</span>` : ""}
      </div>
      <span class="deal">${pct}% below typical</span>
      <div class="actions">
        <a class="btn" href="/api/save?deal_id=${encodeURIComponent(d.id)}">💾 ${d.saved ? "Saved" : "Save"}</a>
        <a class="btn buy" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">View Deal</a>
      </div>
    </div>
  </article>`;
}

function renderApp(deals, savedOnly, message = "", diagnostics = null) {
  const cards = deals.length
    ? deals.map(renderCard).join("")
    : `<div class="empty">${esc(message || (savedOnly ? "No saved deals yet." : "No deals at 50%+ below typical price yet."))}</div>`;
  const diagnosticHtml = diagnostics ? `
    <section class="diagnostics">
      <div class="diag-title">System Diagnostics</div>
      <div class="diag-grid">
        <div class="diag-item"><b>Worker</b><span class="ok">● Online</span><small>Cloudflare Worker is responding</small></div>
        <div class="diag-item"><b>Cloudflare D1</b><span class="${diagnostics.db ? "ok" : "bad"}">● ${diagnostics.db ? "Connected" : "Unavailable"}</span><small>${diagnostics.db ? "Database binding detected" : "DB binding is missing"}</small></div>
        <div class="diag-item"><b>ScraperAPI</b><span class="${diagnostics.scraperApi.status === "configured" ? "ok" : "bad"}">● ${esc(diagnostics.scraperApi.status)}</span><small>${esc(diagnostics.scraperApi.detail)}</small></div>
        <div class="diag-item"><b>Secret Runtime</b><span class="${diagnostics.runtime.secretLength > 0 ? "ok" : "bad"}">● ${diagnostics.runtime.secretLength > 0 ? "Detected" : "Not detected"}</span><small>Type: ${esc(diagnostics.runtime.secretType)} • Length: ${diagnostics.runtime.secretLength}</small><small>Non-secret bindings: ${esc(diagnostics.runtime.bindings)}</small></div>
        <div class="diag-item"><b>Amazon.in</b><span class="${diagnostics.amazon.status === "ok" ? "ok" : diagnostics.amazon.status === "connected" ? "warn" : "bad"}">● ${esc(diagnostics.amazon.status)}</span><small>${esc(diagnostics.amazon.detail)}</small></div>
        <div class="diag-item"><b>Flipkart</b><span class="${diagnostics.flipkart.status === "ok" ? "ok" : diagnostics.flipkart.status === "connected" ? "warn" : "bad"}">● ${esc(diagnostics.flipkart.status)}</span><small>${esc(diagnostics.flipkart.detail)}</small></div>
      </div>
    </section>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Cache-Control" content="no-cache,no-store,must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<meta http-equiv="refresh" content="180">
<title>PriceCrawler</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#0b0d10;color:#f5f7fa}
header{padding:22px 18px 12px;position:sticky;top:0;background:#0b0d10f2;backdrop-filter:blur(12px);z-index:5}
h1{margin:0;font-size:26px}.sub{color:#9aa3af;margin-top:5px;font-size:13px}
.status{display:inline-flex;gap:7px;align-items:center;margin-top:12px;font-size:12px;color:#aeb7c2}
.dot{width:8px;height:8px;border-radius:50%;background:#48d597}
nav{display:flex;gap:8px;padding:12px 18px}
.tab{border:1px solid #252a31;background:#15181d;color:#cbd1d8;padding:9px 14px;border-radius:999px;text-decoration:none;font-size:14px}
.active{background:#f5f7fa;color:#0b0d10}
main{padding:8px 18px 30px;max-width:900px;margin:auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.card{background:#13161b;border:1px solid #242932;border-radius:18px;overflow:hidden}
.pic{width:100%;height:170px;object-fit:cover;background:#20242b}
.body{padding:15px}.store{font-size:12px;color:#8f99a5;text-transform:uppercase;letter-spacing:.08em}
.title{font-size:17px;font-weight:700;margin:7px 0 12px}.price{font-size:25px;font-weight:800}
.old{text-decoration:line-through;color:#777f89;font-size:13px;margin-left:6px}
.deal{display:inline-block;margin-top:8px;padding:5px 8px;border-radius:8px;background:#173c2f;color:#63e6a9;font-size:12px;font-weight:700}
.actions{display:flex;gap:8px;margin-top:14px}.btn{flex:1;padding:11px 10px;border-radius:10px;border:1px solid #303640;background:#1b1f25;color:#fff;text-decoration:none;text-align:center;font-weight:700}
.buy{background:#fff;color:#0b0d10}.empty{padding:50px 10px;text-align:center;color:#89929e}
.toolbar{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}
.scan{display:inline-block;border:0;border-radius:10px;padding:11px 14px;background:#fff;color:#0b0d10;font-weight:800;text-decoration:none}
.note{font-size:11px;color:#737d89}
.diagnostics{margin:8px 0 18px;padding:14px;border:1px solid #242932;border-radius:16px;background:#101318}
.diag-title{font-weight:800;font-size:15px;margin-bottom:10px}
.diag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.diag-item{padding:11px;border:1px solid #252a31;border-radius:12px;background:#15181d}
.diag-item b{display:block;font-size:13px;margin-bottom:4px}
.diag-item span{font-size:12px;font-weight:800}
.diag-item small{display:block;color:#7f8995;font-size:11px;margin-top:4px;line-height:1.35}
.ok{color:#48d597}.warn{color:#f2c14e}.bad{color:#ff6b6b}
</style>
</head>
<body>
<header>
  <h1>PriceCrawler</h1>
  <div class="sub">Automatic pricing-error &amp; deal radar</div>
  <div class="status"><span class="dot"></span><span>Live scanner</span></div>
  <div class="toolbar">
    <a class="scan" href="/api/scan?redirect=1">↻ Scan Now</a>
    <span class="note">Scans when opened • auto-refreshes every 3 minutes</span>
  </div>
</header>
<nav>
  <a class="tab ${savedOnly ? "" : "active"}" href="/">Live Deals</a>
  <a class="tab ${savedOnly ? "active" : ""}" href="/?view=saved">Saved</a>
</nav>
<main>
  ${diagnosticHtml}
  <div class="grid">${cards}</div>
</main>
</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      await initDb(env);

      if (url.pathname === "/api/deals") {
        await seedDemoIfEmpty(env);
        return json(await getDeals(env,url.searchParams.get("view") === "saved"));
      }

      if (url.pathname === "/api/scan") {
        try {
          const result = await scan(env);
          if (url.searchParams.get("redirect") === "1") {
            return Response.redirect(new URL("/?updated=1",request.url),302);
          }
          return json({ ok:true,...result });
        } catch (e) {
          if (url.searchParams.get("redirect") === "1") {
            return Response.redirect(new URL("/?scan_error="+encodeURIComponent(e.message),request.url),302);
          }
          return json({ ok:false,error:e.message },500);
        }
      }

      if (url.pathname === "/api/save") {
        const dealId = url.searchParams.get("deal_id");
        if (!dealId) return json({ ok:false,error:"Missing deal_id" },400);

        if (env.DB) {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO saved_deals (deal_id,saved_at) VALUES (?,?)"
          ).bind(String(dealId),new Date().toISOString()).run();
        }

        return Response.redirect(new URL("/?saved=1",request.url),302);
      }

      await seedDemoIfEmpty(env);

      const savedOnly = url.searchParams.get("view") === "saved";
      let deals = [];
      let diagnostics;

      try {
        await scan(env);
      } catch (_) {}

      deals = await getDeals(env,savedOnly);
      diagnostics = await runDiagnostics(env);
      diagnostics.db = Boolean(env.DB);

      const message = url.searchParams.get("scan_error")
        ? "Fresh scan failed, so the last available deals are shown."
        : (!url.searchParams.get("view") && !env.DEALS_SOURCE_URL && !env.SCRAPERAPI_KEY
          ? "No scraper is connected yet. Add the SCRAPERAPI_KEY secret in Cloudflare."
          : "");

      return new Response(renderApp(deals,savedOnly,message,diagnostics),{
        headers:{
          "content-type":"text/html; charset=utf-8",
          "cache-control":"no-store,no-cache,must-revalidate,max-age=0",
          "pragma":"no-cache",
          "expires":"0"
        }
      });
    } catch (e) {
      return json({ error:e.message },500);
    }
  },

  async scheduled(event,env,ctx) {
    ctx.waitUntil(scan(env).catch(()=>{}));
  }
};
