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
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function html(body) {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function scoreDeal(price, typical) {
  if (!typical || typical <= 0 || price <= 0) return 0;
  const pct = Math.max(0, (typical - price) / typical * 100);
  return Math.min(100, Math.round(pct * 2));
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

async function fetchSource(env) {
  if (!env.DEALS_SOURCE_URL) return DEMO_DEALS;
  const r = await fetch(env.DEALS_SOURCE_URL, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error("Deal source returned " + r.status);
  const data = await r.json();
  return Array.isArray(data) ? data : (Array.isArray(data.deals) ? data.deals : []);
}

async function scan(env) {
  const now = new Date().toISOString();
  const items = await fetchSource(env);

  if (!env.DB) return { count: items.length, demo: !env.DEALS_SOURCE_URL };

  for (const raw of items) {
    if (!raw.title || !raw.store || !raw.price || !raw.url) continue;
    const id = String(raw.id || crypto.randomUUID());
    const price = Number(raw.price);
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
      .bind(id, String(raw.title), String(raw.store), price, previous, typical,
        String(raw.currency || "INR"), String(raw.url), raw.image_url || null,
        old ? undefined : now, now, score).run();

    if (!old || Number(old.price) !== price) {
      await env.DB.prepare("INSERT INTO price_history (deal_id,price,captured_at) VALUES (?,?,?)")
        .bind(id, price, now).run();
    }
  }
  return { count: items.length, demo: !env.DEALS_SOURCE_URL };
}

async function getDeals(env, savedOnly = false) {
  if (!env.DB) return DEMO_DEALS.map(x => ({ ...x, score: scoreDeal(x.price, x.typical_price), saved: false }));
  const query = savedOnly
    ? `SELECT d.*, 1 AS saved FROM deals d INNER JOIN saved_deals s ON s.deal_id=d.id ORDER BY d.score DESC, d.updated_at DESC`
    : `SELECT d.*, CASE WHEN s.deal_id IS NULL THEN 0 ELSE 1 END AS saved FROM deals d LEFT JOIN saved_deals s ON s.deal_id=d.id ORDER BY d.score DESC, d.updated_at DESC`;
  const { results } = await env.DB.prepare(query).all();
  return results;
}

const APP = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PriceCrawler</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#0b0d10;color:#f5f7fa}
header{padding:22px 18px 12px;position:sticky;top:0;background:#0b0d10ee;backdrop-filter:blur(12px);z-index:5}
h1{margin:0;font-size:26px}.sub{color:#9aa3af;margin-top:5px;font-size:13px}.status{display:inline-flex;gap:7px;align-items:center;margin-top:12px;font-size:12px;color:#aeb7c2}.dot{width:8px;height:8px;border-radius:50%;background:#48d597}
nav{display:flex;gap:8px;padding:12px 18px}.tab{border:1px solid #252a31;background:#15181d;color:#cbd1d8;padding:9px 14px;border-radius:999px}.active{background:#f5f7fa;color:#0b0d10}
main{padding:8px 18px 30px;max-width:900px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.card{background:#13161b;border:1px solid #242932;border-radius:18px;overflow:hidden}.pic{width:100%;height:170px;object-fit:cover;background:#20242b}.body{padding:15px}.store{font-size:12px;color:#8f99a5;text-transform:uppercase;letter-spacing:.08em}.title{font-size:17px;font-weight:700;margin:7px 0 12px}.price{font-size:25px;font-weight:800}.old{text-decoration:line-through;color:#777f89;font-size:13px;margin-left:6px}.deal{display:inline-block;margin-top:8px;padding:5px 8px;border-radius:8px;background:#173c2f;color:#63e6a9;font-size:12px;font-weight:700}
.actions{display:flex;gap:8px;margin-top:14px}.btn{flex:1;padding:10px;border-radius:10px;border:1px solid #303640;background:#1b1f25;color:#fff;text-decoration:none;text-align:center;font-weight:600;cursor:pointer}.buy{background:#fff;color:#0b0d10}
.empty{padding:40px 10px;text-align:center;color:#89929e}
</style></head>
<body>
<header><h1>PriceCrawler</h1><div class="sub">Automatic pricing-error & deal radar</div><div class="status"><span class="dot"></span><span id="status">Live scanner</span></div></header>
<nav><button class="tab active" id="liveBtn" onclick="show('live')">Live Deals</button><button class="tab" id="savedBtn" onclick="show('saved')">Saved</button></nav>
<main><div id="grid" class="grid"></div></main>
<script>
let mode='live';
const money = (n,c='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency:c,maximumFractionDigits:0}).format(n);
async function load(){
  const r=await fetch('/api/deals?view='+mode); const data=await r.json();
  const grid=document.getElementById('grid');
  if(!data.length){grid.innerHTML='<div class="empty">No deals yet. The scanner will populate this page automatically.</div>';return;}
  grid.innerHTML=data.map(d=>{
    const pct=d.typical_price?Math.max(0,Math.round((d.typical_price-d.price)/d.typical_price*100)):0;
    return '<article class="card">'+(d.image_url?'<img class="pic" src="'+d.image_url+'" alt="">':'')+
      '<div class="body"><div class="store">'+esc(d.store)+'</div><div class="title">'+esc(d.title)+'</div>'+
      '<div><span class="price">'+money(d.price,d.currency||'INR')+'</span>'+(d.previous_price?'<span class="old">'+money(d.previous_price,d.currency||'INR')+'</span>':'')+'</div>'+
      '<span class="deal">'+pct+'% below typical</span><div class="actions">'+
      '<button class="btn" onclick="saveDeal(\''+esc(d.id)+'\')">'+(d.saved?'Saved':'Save')+'</button>'+
      '<a class="btn buy" href="'+esc(d.url)+'" target="_blank" rel="noopener">View Deal</a></div></div></article>';
  }).join('');
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function saveDeal(id){await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deal_id:id})});load();}
function show(x){mode=x;document.getElementById('liveBtn').classList.toggle('active',x==='live');document.getElementById('savedBtn').classList.toggle('active',x==='saved');load();}
load(); setInterval(load,180000);
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/deals") return json(await getDeals(env, url.searchParams.get("view")==="saved"));
      if (url.pathname === "/api/scan" && request.method === "POST") return json(await scan(env));
      if (url.pathname === "/api/save" && request.method === "POST") {
        const { deal_id } = await request.json();
        if (!env.DB) return json({ ok:true });
        await env.DB.prepare("INSERT OR REPLACE INTO saved_deals (deal_id,saved_at) VALUES (?,?)")
          .bind(String(deal_id), new Date().toISOString()).run();
        return json({ ok:true });
      }
      return html(APP);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(scan(env));
  }
};
