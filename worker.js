const DEMO_PROVIDERS = [
  { code: "DEMO_LIVE", name: "Demo Live Casino", status: 1 },
  { code: "DEMO_SLOTS", name: "Demo Slots", status: 1 },
  { code: "DEMO_TABLE", name: "Demo Table Games", status: 1 }
];

const DEMO_GAMES = {
  DEMO_LIVE: [
    { game_code: "demo_roulette", game_name: "Demo Roulette", status: 1 },
    { game_code: "demo_blackjack", game_name: "Demo Blackjack", status: 1 },
    { game_code: "demo_baccarat", game_name: "Demo Baccarat", status: 1 }
  ],
  DEMO_SLOTS: [
    { game_code: "demo_slots_1", game_name: "Demo Fruit Slots", status: 1 },
    { game_code: "demo_slots_2", game_name: "Demo Lucky 7", status: 1 },
    { game_code: "demo_slots_3", game_name: "Demo Treasure", status: 1 }
  ],
  DEMO_TABLE: [
    { game_code: "demo_poker", game_name: "Demo Poker", status: 1 },
    { game_code: "demo_dice", game_name: "Demo Dice", status: 1 }
  ]
};

function isDemo(env) {
  return String(env.DEMO_MODE ?? "true").toLowerCase() !== "false";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function validUser(value) {
  const user = String(value || "");
  if (!/^[A-Za-z0-9_]{1,32}$/.test(user)) throw new Error("Invalid user");
  return user;
}

function validProvider(value) {
  const provider = String(value || "");
  if (!/^[A-Za-z0-9_]{1,32}$/.test(provider)) throw new Error("Invalid provider");
  return provider;
}

async function handleApi(request, env, url) {
  const action = url.searchParams.get("action") || url.pathname.split("/").pop();
  let input = Object.fromEntries(url.searchParams.entries());

  if (request.method === "POST") {
    input = await request.json().catch(() => ({}));
  }

  if (isDemo(env)) {
    if (action === "providers" && request.method === "GET") {
      return json({ ok: true, demo: true, providers: DEMO_PROVIDERS });
    }

    if (action === "games" && request.method === "GET") {
      const provider = validProvider(input.provider);
      return json({ ok: true, demo: true, games: DEMO_GAMES[provider] || [] });
    }

    if (action === "balance" && request.method === "GET") {
      validUser(input.user);
      return json({ ok: true, demo: true, agent_balance: 100000, user_balance: 1000 });
    }

    if ((action === "deposit" || action === "withdraw") && request.method === "POST") {
      validUser(input.user);
      const amount = Number(input.amount);
      if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: "Invalid amount" }, 400);
      return json({ ok: true, demo: true, agent_balance: 100000, user_balance: action === "deposit" ? 1000 + amount : Math.max(0, 1000 - amount) });
    }

    if (action === "launch" && request.method === "POST") {
      validUser(input.user);
      validProvider(input.provider);
      const game = String(input.game || "demo_game");
      return json({ ok: true, demo: true, launch_url: url.origin + "/demo-game?game=" + encodeURIComponent(game) });
    }

    return json({ ok: false, error: "Unknown demo action" }, 404);
  }

  return json({ ok: false, error: "Demo mode only. Configure the FiversCan API before enabling live mode." }, 503);
}

function demoGameHtml(game) {
  const title = game.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#10141c;color:#eef2f7;font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:grid;place-items:center;padding:18px}
.game{width:min(94vw,560px);padding:24px;border:1px solid #30394b;border-radius:20px;background:#1a202b;text-align:center;box-shadow:0 20px 60px #0008}
.badge{display:inline-block;padding:6px 12px;border-radius:99px;background:#f5b700;color:#171200;font-weight:800;font-size:12px}
h1{margin:12px 0 4px}.muted{color:#9aa5b7}.score{display:flex;gap:10px;margin:18px 0}.score div{flex:1;padding:12px;border:1px solid #30394b;border-radius:12px;background:#11161f}
.label{display:block;font-size:12px;color:#9aa5b7;margin-bottom:6px}.cards{min-height:72px;margin:8px 0 18px;padding:16px;border-radius:14px;background:#11161f;border:1px solid #30394b;font-size:30px;letter-spacing:3px}
.actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.actions button{border:0;border-radius:10px;padding:13px 22px;background:#f5b700;color:#171200;font-weight:800;font-size:16px}.actions button:disabled{opacity:.4}.status{min-height:28px;margin:14px 0;font-weight:700}
</style></head><body><main class="game">
<span class="badge">DEMO MODE • PLAY MONEY</span><h1>${title}</h1><p class="muted">Blackjack demonstration. No real money or external casino API.</p>
<div class="score"><div><span class="label">DEALER</span><strong id="ds">—</strong></div><div><span class="label">PLAYER</span><strong id="ps">—</strong></div></div>
<span class="label">Dealer cards</span><div id="dc" class="cards">—</div>
<span class="label">Your cards</span><div id="pc" class="cards">—</div>
<div id="st" class="status">Tap Deal to start</div>
<div class="actions"><button id="deal" type="button">Deal</button><button id="hit" type="button" disabled>Hit</button><button id="stand" type="button" disabled>Stand</button></div>
</main>
<script>
(function(){
const ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];let deck=[],p=[],d=[],done=true;
const $=id=>document.getElementById(id);
function shuffle(){deck=[];for(let s=0;s<4;s++)for(const r of ranks)deck.push(r);for(let i=deck.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}}
function draw(){return deck.pop()}
function val(h){let n=0,a=0;for(const r of h){if(r==="A"){n+=11;a++}else n+=["J","Q","K"].includes(r)?10:Number(r)}while(n>21&&a--)n-=10;return n}
function render(){ $("pc").textContent=p.join("  ")||"—";$("dc").textContent=done?d.join("  "):(d.length?"🂠  "+d.slice(1).join("  "):"—");$("ps").textContent=val(p)||"—";$("ds").textContent=done?val(d):"—"}
function finish(msg){done=true;$("st").textContent=msg;$("hit").disabled=true;$("stand").disabled=true;$("deal").disabled=false;render()}
function dealer(){while(val(d)<17)d.push(draw());let a=val(p),b=val(d);if(b>21)finish("Dealer busts — you win!");else if(a>b)finish("You win!");else if(a<b)finish("Dealer wins.");else finish("Push — tie.")}
$("deal").onclick=()=>{shuffle();p=[draw(),draw()];d=[draw(),draw()];done=false;$("deal").disabled=true;$("hit").disabled=false;$("stand").disabled=false;$("st").textContent="Hit or Stand";render();if(val(p)===21)dealer()};
$("hit").onclick=()=>{if(done)return;p.push(draw());if(val(p)>21)finish("Bust — dealer wins.");else if(val(p)===21)dealer();else render()};
$("stand").onclick=()=>{if(!done)dealer()};
render();
})();
</script></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (isDemo(env) && url.pathname === "/demo-game") {
        return new Response(demoGameHtml(url.searchParams.get("game") || "Demo Blackjack"), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
        });
      }

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Worker is online.", { status: 200 });
    } catch (e) {
      console.error(e);
      return json({ ok: false, error: e instanceof Error ? e.message : "Internal error" }, 500);
    }
  }
};
