const DEMO_DEALS = [
  {
    id: "demo-airpods-pro",
    title: "Apple AirPods Pro",
    store: "Amazon",
    price: 8999,
    previous_price: 14900,
    typical_price: 14900,
    currency: "INR",
    url: "https://www.amazon.in/",
    image_url: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "demo-samsung-tv",
    title: "Samsung 55-inch 4K Smart TV",
    store: "Flipkart",
    price: 32999,
    previous_price: 49999,
    typical_price: 49999,
    currency: "INR",
    url: "https://www.flipkart.com/",
    image_url: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80"
  }
];

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

async function fetchSource(env) {
  if (!env.DEALS_SOURCE_URL) return DEMO_DEALS;
  const r = await fetch(env.DEALS_SOURCE_URL, {
    headers: { "accept": "application/json", "cache-control": "no-cache" }
  });
  if (!r.ok) throw new Error("Deal source returned " + r.status);
  const data = await r.json();
  return Array.isArray(data) ? data : (Array.isArray(data.deals) ? data.deals : []);
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
}

async function seedDemoIfEmpty(env) {
  if (!env.DB) return;
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM deals").first();
  if (Number(row?.n || 0) > 0) return;

  const now = new Date().toISOString();
  for (const d of DEMO_DEALS) {
    await env.DB.prepare(`INSERT OR IGNORE INTO deals
      (id,title,store,price,previous_price,typical_price,currency,url,image_url,detected_at,updated_at,score)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        d.id,d.title,d.store,d.price,d.previous_price,d.typical_price,
        d.currency,d.url,d.image_url,now,now,scoreDeal(d.price,d.typical_price)
      ).run();

    await env.DB.prepare(
      "INSERT OR IGNORE INTO price_history (deal_id,price,captured_at) VALUES (?,?,?)"
    ).bind(d.id,d.price,now).run();
  }
}

async function scan(env) {
  const now = new Date().toISOString();
  const items = await fetchSource(env);

  if (!env.DB) return { count: items.length, demo: !env.DEALS_SOURCE_URL };

  for (const raw of items) {
    if (!raw?.title || !raw?.store || raw?.price == null || !raw?.url) continue;

    const id = String(raw.id || crypto.randomUUID());
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price <= 0) continue;

    const typical = Number(raw.typical_price || raw.previous_price || price);
    const previous = raw.previous_price == null ? null : Number(raw.previous_price);
    const score = scoreDeal(price, typical);

    const old = await env.DB.prepare("SELECT price FROM deals WHERE id = ?").bind(id).first();

    await env.DB.prepare(`INSERT INTO deals
      (id,title,store,price,previous_price,typical_price,currency,url,image_url,detected_at,updated_at,score)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, store=excluded.store, price=excluded.price,
        previous_price=excluded.previous_price, typical_price=excluded.typical_price,
        currency=excluded.currency, url=excluded.url, image_url=excluded.image_url,
        updated_at=excluded.updated_at, score=excluded.score`)
      .bind(
        id,String(raw.title),String(raw.store),price,previous,typical,
        String(raw.currency || "INR"),String(raw.url),raw.image_url || null,
        now,now,score
      ).run();

    if (!old || Number(old.price) !== price) {
      await env.DB.prepare(
        "INSERT INTO price_history (deal_id,price,captured_at) VALUES (?,?,?)"
      ).bind(id,price,now).run();
    }
  }

  return { count: items.length, demo: !env.DEALS_SOURCE_URL };
}

async function getDeals(env, savedOnly = false) {
  if (!env.DB) {
    return DEMO_DEALS.map(d => ({
      ...d,
      score: scoreDeal(d.price,d.typical_price),
      saved: false
    }));
  }

  const query = savedOnly
    ? `SELECT d.*, 1 AS saved
       FROM deals d INNER JOIN saved_deals s ON s.deal_id=d.id
       ORDER BY d.score DESC,d.updated_at DESC`
    : `SELECT d.*, CASE WHEN s.deal_id IS NULL THEN 0 ELSE 1 END AS saved
       FROM deals d LEFT JOIN saved_deals s ON s.deal_id=d.id
       ORDER BY d.score DESC,d.updated_at DESC`;

  const { results } = await env.DB.prepare(query).all();
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

function renderApp(deals, savedOnly, message = "") {
  const cards = deals.length
    ? deals.map(renderCard).join("")
    : `<div class="empty">${esc(message || (savedOnly ? "No saved deals yet." : "No deals found."))}</div>`;

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

      // Always attempt a fresh scan when the page is opened.
      // A source failure never prevents the existing database/deals from rendering.
      try {
        await scan(env);
      } catch (_) {}

      deals = await getDeals(env,savedOnly);

      const message = url.searchParams.get("scan_error")
        ? "Fresh scan failed, so the last available deals are shown."
        : "";

      return new Response(renderApp(deals,savedOnly,message),{
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
