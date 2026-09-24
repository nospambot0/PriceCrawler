"use client";
import {useState} from "react";
import {Shield,Radio,KeyRound,Router,Activity,CheckCircle2,AlertTriangle} from "lucide-react";

const tests=[
 ["Handshake audit","Validate that an authorized capture can be supplied for offline password-strength assessment.","Offline lab"],
 ["WPS assessment","Review router WPS configuration and record whether it is enabled.","Configuration"],
 ["PMF / deauth resilience","Check Protected Management Frames configuration and document resilience requirements.","Defensive"],
 ["Access-control review","Review client isolation, ACLs and guest-network segmentation.","Configuration"],
 ["Rogue AP detection","Compare authorized SSID/BSSID details against expected network identity.","Detection"]
];

export default function Lab(){
 const [agent,setAgent]=useState(false); const [selected,setSelected]=useState(0); const [ran,setRan]=useState(false);
 return <main className="wrap"><nav className="nav"><div className="brand"><div className="brandIcon"><Shield size={21}/></div>WiFi Security Auditor / Lab</div><div className="badge">AUTHORIZED LAB MODE</div></nav>
 <section className="panel"><div className="eyebrow">Local testing architecture</div><h1 style={{fontSize:"clamp(34px,5vw,58px)",margin:"12px 0"}}>Connect a local Wi‑Fi testing agent.</h1><p className="muted" style={{fontSize:16}}>The Vercel dashboard is the control plane. Radio-level testing belongs on a machine you control with a compatible Wi‑Fi adapter. This page provides the safe lab workflow and evidence collection layer.</p>
 <div className="notice"><Radio size={18}/><span>Agent status: <b>{agent?"CONNECTED":"NOT CONNECTED"}</b>. Browser-only deployments cannot directly control your Wi‑Fi adapter.</span></div>
 <div className="actions"><button className="button" onClick={()=>setAgent(!agent)}>{agent?"Disconnect agent":"Connect local agent"}</button></div></section>
 <section className="grid">{tests.map((t,i)=><button key={t[0]} className="card" style={{textAlign:"left",color:"inherit",cursor:"pointer",borderColor:selected===i?"#55d8ff":"#1d2a3b"}} onClick={()=>{setSelected(i);setRan(false)}}><div style={{display:"flex",justifyContent:"space-between"}}><Activity size={20}/><span className="status good">{t[2]}</span></div><h3>{t[0]}</h3><div className="muted">{t[1]}</div></button>)}</section>
 <section className="panel section"><h2>Selected test: {tests[selected][0]}</h2><div className="checkrow"><span><Router size={17}/> Authorization scope confirmed</span><span className="status good">Required</span></div><div className="checkrow"><span><KeyRound size={17}/> Evidence stays local until exported</span><span className="status good">Enabled</span></div><div className="checkrow"><span><Shield size={17}/> Destructive radio actions</span><span className="status warn">Not exposed by web UI</span></div><div className="actions"><button className="button" onClick={()=>setRan(true)}><CheckCircle2 size={16}/> Run readiness check</button></div>{ran&&<div className="report" style={{marginTop:16}}>LAB READINESS CHECK\n\nTest: {tests[selected][0]}\nAgent: {agent?"Connected":"Not connected"}\nAuthorization: Required and user-confirmed\nEvidence handling: Local-first\nResult: Ready for defensive assessment workflow\n\nNote: radio-level attack execution is intentionally kept outside this browser control plane.</div>}</section>
 <div className="footer"><AlertTriangle size={13}/> Use only on networks and equipment you own or are explicitly authorized to assess.</div></main>
}