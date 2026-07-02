"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

type Role = "admin" | "analyst" | "planning" | "viewer"
type User = { username:string; name:string; role:Role }
type Perms = { canRefreshAI:boolean; canChat:boolean; canToggleAI:boolean }
type Page  = "executive" | "simulation" | "forecast" | "charts" | "chat"
type Msg   = { role:"user"|"assistant"; content:string }

const ROLE_LABEL: Record<Role, { label:string; color:string; bg:string }> = {
  admin    : { label:"Admin",       color:"#b91c1c", bg:"#fde8e8" },
  analyst  : { label:"Analyst",     color:"#1e40af", bg:"#dbeafe" },
  planning : { label:"Tim Planning", color:"#065f46", bg:"#d1fae5" },
  viewer   : { label:"Viewer",      color:"#555",    bg:"#f3f4f6" },
}

const NAV: {id:Page;icon:string;label:string}[] = [
  { id:"executive",  icon:"ti-layout-dashboard", label:"Executive Overview"    },
  { id:"simulation", icon:"ti-adjustments",       label:"Simulation Center"    },
  { id:"forecast",   icon:"ti-trending-up",       label:"Forecast & Strategic" },
  { id:"charts",     icon:"ti-chart-bar",         label:"Visual Charts"        },
  { id:"chat",       icon:"ti-message-2",         label:"AI Planning Assistant"},
]

const LOOKER_EMBED = "https://lookerstudio.google.com/embed/reporting/0325a3a3-4db1-4ee2-9728-ea977012e39e/page/p_first"
const LOOKER_FULL  = "https://lookerstudio.google.com/reporting/0325a3a3-4db1-4ee2-9728-ea977012e39e"

function Ring({pct,color,size=58}:{pct:number;color:string;size?:number}) {
  const r=size*.38,circ=2*Math.PI*r,dash=Math.min(pct,100)/100*circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,.07)" strokeWidth={size*.1}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*.1}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={size*.2} fontWeight="500" fill={color}>{pct}%</text>
    </svg>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [page,    setPage]    = useState<Page>("executive")
  const [user,    setUser]    = useState<User|null>(null)
  const [perms,   setPerms]   = useState<Perms>({canRefreshAI:false,canChat:false,canToggleAI:false})
  const [kpi,     setKpi]     = useState<any>({})
  const [cache,   setCache]   = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msgs,    setMsgs]    = useState<Msg[]>([{role:"assistant",content:"Halo! Saya AI Planning Assistant.\n\nSilakan tanya tentang status produksi, risiko, simulasi, atau forecasting."}])
  const [input,   setInput]   = useState("")
  const [typing,  setTyping]  = useState(false)
  const [clock,   setClock]   = useState("")
  const [demandD, setDemandD] = useState(10)
  const [otHrs,   setOtHrs]   = useState(2)
  const [effG,    setEffG]    = useState(5)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Clock
  useEffect(()=>{
    const tick=()=>setClock(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})+" WIB")
    tick(); const id=setInterval(tick,10000); return()=>clearInterval(id)
  },[])

  // Cek session
  useEffect(()=>{
    fetch("/api/auth/me").then(r=>r.json()).then(d=>{
      if (!d.authenticated) { router.push("/login"); return }
      setUser(d.user); setPerms(d.permissions)
    }).catch(()=>router.push("/login"))
  },[router])

  // Load cache saat mount
  useEffect(()=>{
    fetch("/api/dashboard").then(r=>r.json()).then(d=>{
      const {_cache,...rest}=d; setKpi(rest); setCache(_cache)
    }).catch(()=>{})
  },[])

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}) },[msgs,typing])

  // Refresh analisis (hanya admin/analyst)
  async function handleRefresh() {
    if (!perms.canRefreshAI||loading) return
    setLoading(true)
    try {
      const r = await fetch("/api/dashboard?refresh=1")
      const d = await r.json()
      if (d.error) { alert(d.error); return }
      const {_cache,...rest}=d; setKpi(rest); setCache(_cache)
    } catch { alert("Gagal refresh") }
    finally { setLoading(false) }
  }

  // Logout
  async function handleLogout() {
    await fetch("/api/auth/logout",{method:"POST"})
    router.push("/login")
  }

  // Chat
  async function sendChat(text?:string,hint?:string) {
    const msg=(text??input).trim(); if(!msg||typing) return
    setInput("")
    const full=hint?`[${hint}]\n${msg}`:msg
    const next:Msg[]=[...msgs,{role:"user",content:full}]
    setMsgs(next); setTyping(true)
    try {
      const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:full,history:msgs})})
      const reader=r.body!.getReader(); const dec=new TextDecoder(); let buf=""
      while(true){const{done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});setMsgs([...next,{role:"assistant",content:buf}])}
    } catch { setMsgs([...next,{role:"assistant",content:"❌ Gagal terhubung ke AI."}]) }
    finally  { setTyping(false) }
  }

  function runSim(p:string){setPage("chat");setTimeout(()=>sendChat(p,"Simulasi"),150)}
  const v=(x:any,s="")=>(x!=null&&x!=="")?`${x}${s}`:"—"
  const rl=user?ROLE_LABEL[user.role]:ROLE_LABEL.viewer

  const navStyle=(p:Page):React.CSSProperties=>({
    display:"flex",alignItems:"center",gap:9,padding:"9px 16px",border:"none",
    background:"transparent",cursor:"pointer",fontSize:12,width:"100%",textAlign:"left",
    color:page===p?"#2a78d6":"#777",borderLeft:`3px solid ${page===p?"#2a78d6":"transparent"}`,
    fontWeight:page===p?600:400,transition:"all .12s",
  })

  if (!user) return <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui"}}>Memuat...</div>

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"system-ui,sans-serif",background:"#fff"}}>

      {/* Sidebar */}
      <nav style={{width:196,background:"#f7f7f5",borderRight:"0.5px solid rgba(0,0,0,.08)",display:"flex",flexDirection:"column",flexShrink:0}}>
        <div style={{padding:"14px 16px",borderBottom:"0.5px solid rgba(0,0,0,.08)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111"}}>Planning AI</div>
          <div style={{fontSize:10,color:"#bbb",marginTop:2}}>{clock}</div>
          {/* Badge role */}
          <div style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:6,padding:"2px 8px",borderRadius:10,background:rl.bg,fontSize:10,fontWeight:500,color:rl.color}}>
            {user.name} · {rl.label}
          </div>
        </div>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)} style={navStyle(n.id)}>
            <i className={`ti ${n.icon}`} style={{fontSize:15,flexShrink:0}}/>
            {n.label}
            {n.id==="charts"&&<span style={{marginLeft:"auto",fontSize:9,background:"#d1fae5",color:"#065f46",padding:"1px 5px",borderRadius:8,fontWeight:500}}>Looker</span>}
          </button>
        ))}
        <div style={{flex:1}}/>
        {/* Cache info */}
        <div style={{padding:"10px 16px",borderTop:"0.5px solid rgba(0,0,0,.08)",fontSize:10,color:"#bbb",lineHeight:1.6}}>
          {cache?.has_cache
            ? <>{cache.is_expired?"⚠️ Data kadaluarsa":"✅ Data segar"}<br/>oleh {cache.cached_by}<br/>{cache.minutes_ago} menit lalu</>
            : "Belum ada analisis"}
        </div>
        {/* Logout */}
        <button onClick={handleLogout} style={{display:"flex",alignItems:"center",gap:7,padding:"10px 16px",border:"none",background:"transparent",cursor:"pointer",fontSize:12,color:"#999",borderTop:"0.5px solid rgba(0,0,0,.08)"}}>
          <i className="ti ti-logout" style={{fontSize:14}}/> Keluar
        </button>
      </nav>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:48,borderBottom:"0.5px solid rgba(0,0,0,.08)",display:"flex",alignItems:"center",padding:"0 20px",gap:10,flexShrink:0}}>
          <span style={{fontSize:14,fontWeight:600}}>{NAV.find(n=>n.id===page)?.label}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#d1fae5",color:"#065f46",fontWeight:500}}>Live</span>
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>

            {/* Tombol Refresh Analisis — hanya admin/analyst */}
            {perms.canRefreshAI ? (
              <button onClick={handleRefresh} disabled={loading}
                style={{display:"flex",alignItems:"center",gap:5,padding:"5px 14px",borderRadius:6,border:"none",background:loading?"#94a3b8":"#2a78d6",color:"#fff",cursor:loading?"not-allowed":"pointer",fontSize:11,fontWeight:500}}>
                <i className="ti ti-brain" style={{fontSize:13}}/>{loading?"Memuat...":"Refresh Analisis AI"}
              </button>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",color:"#bbb",fontSize:11}}>
                <i className="ti ti-lock" style={{fontSize:13}}/> Refresh (hanya Admin/Analyst)
              </div>
            )}

            <a href={LOOKER_FULL} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",color:"#555",textDecoration:"none",fontSize:11}}>
              <i className="ti ti-chart-bar" style={{fontSize:13}}/> Looker ↗
            </a>
          </div>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:page==="charts"?0:"18px 22px"}}>

          {/* Banner data cache jika expired */}
          {cache?.is_expired && page!=="charts" && (
            <div style={{background:"#fef3c7",border:"0.5px solid #fcd34d",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#92400e",display:"flex",alignItems:"center",gap:8}}>
              <i className="ti ti-clock" style={{fontSize:14,flexShrink:0}}/>
              Data terakhir diperbarui {cache.minutes_ago} menit lalu oleh <strong>{cache.cached_by}</strong>.
              {perms.canRefreshAI?" Klik \"Refresh Analisis AI\" untuk memperbarui.":" Hubungi Admin/Analyst untuk memperbarui."}
            </div>
          )}

          {/* ══ EXECUTIVE ══ */}
          {page==="executive"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:14}}>
                {[
                  {label:"Overall Capacity",val:v(kpi.overall_capacity_pct,"%"),color:"#2a78d6",ring:kpi.overall_capacity_pct??0,sub:"kapasitas terpakai"},
                  {label:"Achievement vs Plan",val:v(kpi.achievement_pct,"%"),color:Number(kpi.achievement_pct??0)>=90?"#1baf7a":"#e24b4a",ring:kpi.achievement_pct??0,sub:"output vs target"},
                  {label:"Material Readiness",val:v(kpi.material_readiness_pct,"%"),color:Number(kpi.material_readiness_pct??0)>=80?"#1baf7a":"#eda100",ring:kpi.material_readiness_pct??0,sub:"PO material lengkap"},
                  {label:"Lines at Risk",val:v(kpi.lines_at_risk," line"),color:"#e24b4a",ring:kpi.lines_at_risk??0,sub:"akan miss target"},
                ].map(c=>(
                  <div key={c.label} style={{background:"#f7f7f5",borderRadius:10,padding:"13px 15px",display:"flex",gap:10,alignItems:"center"}}>
                    <Ring pct={c.ring} color={c.color}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:10,color:"#999",marginBottom:3}}>{c.label}</div>
                      <div style={{fontSize:13,fontWeight:500,color:c.color}}>{c.val}</div>
                      <div style={{fontSize:10,color:"#bbb",marginTop:2}}>{c.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"13px 15px"}}>
                  <div style={{fontSize:11,color:"#999",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><i className="ti ti-list-check" style={{fontSize:12}}/>Prioritas tindakan hari ini</div>
                  <div style={{fontSize:12,color:"#111",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{kpi.top_priority||"—"}</div>
                </div>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"13px 15px"}}>
                  <div style={{fontSize:11,color:"#999",marginBottom:8,display:"flex",alignItems:"center",gap:5}}><i className="ti ti-shield-exclamation" style={{fontSize:12}}/>Risiko problem planning</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:500,background:kpi.planning_risk_level==="TINGGI"?"#fde8e8":kpi.planning_risk_level==="SEDANG"?"#fef3c7":"#d1fae5",color:kpi.planning_risk_level==="TINGGI"?"#b91c1c":kpi.planning_risk_level==="SEDANG"?"#92400e":"#065f46"}}>{kpi.planning_risk_level||"—"}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{background:"#fff",borderRadius:8,padding:"8px 10px",border:"0.5px solid rgba(0,0,0,.08)"}}>
                      <div style={{fontSize:10,color:"#999"}}>Kekurangan MP</div>
                      <div style={{fontSize:16,fontWeight:500,color:"#e24b4a"}}>{v(kpi.mp_shortage," org")}</div>
                    </div>
                    <div style={{background:"#fff",borderRadius:8,padding:"8px 10px",border:"0.5px solid rgba(0,0,0,.08)"}}>
                      <div style={{fontSize:10,color:"#999"}}>Penyesuaian Jadwal</div>
                      <div style={{fontSize:16,fontWeight:500,color:"#eda100"}}>{v(kpi.schedule_adjustment_needed," PO")}</div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Quick ask */}
              <div style={{marginBottom:4,fontSize:12,fontWeight:500,color:"#888"}}>Tanya AI langsung:</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {["Berikan executive summary status produksi hari ini","Line mana yang akan miss target dan penyebabnya?","Apa prioritas tindakan hari ini?","Bagaimana status material readiness?"].map(q=>(
                  perms.canChat ? (
                    <button key={q} onClick={()=>{setPage("chat");setTimeout(()=>sendChat(q),150)}}
                      style={{textAlign:"left",padding:"9px 13px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",cursor:"pointer",fontSize:12,color:"#2a78d6",lineHeight:1.5}}>
                      <i className="ti ti-arrow-right" style={{fontSize:12,marginRight:5}}/>{q}
                    </button>
                  ) : (
                    <div key={q} style={{padding:"9px 13px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.06)",background:"#f9f9f9",fontSize:12,color:"#bbb",lineHeight:1.5,display:"flex",alignItems:"center",gap:5}}>
                      <i className="ti ti-lock" style={{fontSize:12,flexShrink:0}}/>{q}
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* ══ SIMULATION ══ */}
          {page==="simulation"&&(
            <div>
              <div style={{background:"#eff6ff",border:"0.5px solid #bfdbfe",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#1e40af",display:"flex",gap:8}}>
                <i className="ti ti-info-circle" style={{fontSize:14,flexShrink:0,marginTop:1}}/>
                Atur parameter lalu klik "Jalankan" — Claude menganalisis dampak terhadap data spreadsheet Anda.
                {!perms.canChat&&<strong style={{marginLeft:"auto",color:"#b91c1c"}}> 🔒 Chat AI tidak tersedia untuk role Anda</strong>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  {title:"Dampak Perubahan Demand",icon:"ti-trending-up",color:"#2a78d6",val:demandD,setVal:setDemandD,min:-30,max:50,unit:"%",prompt:`Simulasikan dampak demand berubah ${demandD>=0?"+":""}${demandD}%`},
                  {title:"Dampak Overtime",icon:"ti-clock",color:"#ba7517",val:otHrs,setVal:setOtHrs,min:0,max:4,unit:" jam",prompt:`Simulasikan overtime ${otHrs} jam/hari selama seminggu`},
                  {title:"Dampak Kenaikan Efisiensi",icon:"ti-rocket",color:"#1baf7a",val:effG,setVal:setEffG,min:1,max:25,unit:"%",prompt:`Simulasikan efisiensi semua line naik ${effG}%`},
                ].map(s=>(
                  <div key={s.title} style={{background:"#f7f7f5",borderRadius:10,padding:"14px 15px"}}>
                    <div style={{fontSize:12,fontWeight:600,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                      <i className={`ti ${s.icon}`} style={{color:s.color}}/>{s.title}
                    </div>
                    <div style={{marginBottom:4,display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:"#666"}}>Nilai</span>
                      <span style={{fontWeight:500,color:s.color}}>{s.val}{s.unit}</span>
                    </div>
                    <input type="range" min={s.min} max={s.max} value={s.val} step="1"
                      onChange={e=>s.setVal(Number(e.target.value))} style={{width:"100%",accentColor:s.color,marginBottom:8}}/>
                    <button onClick={()=>perms.canChat?runSim(s.prompt):alert("Fitur chat tidak tersedia untuk role Anda")} disabled={!perms.canChat}
                      style={{width:"100%",padding:"7px",borderRadius:7,border:"none",background:perms.canChat?s.color:"#e5e5e5",color:perms.canChat?"#fff":"#aaa",cursor:perms.canChat?"pointer":"not-allowed",fontSize:11,fontWeight:500}}>
                      {perms.canChat?"Jalankan simulasi →":"🔒 Chat tidak tersedia"}
                    </button>
                  </div>
                ))}
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"14px 15px"}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><i className="ti ti-layout-grid" style={{color:"#4a3aa7"}}/>Dampak Penambahan Line</div>
                  <div style={{fontSize:11,color:"#666",lineHeight:1.6,marginBottom:10}}>Simulasi jika kapasitas ditambah dengan membuka line baru.</div>
                  <button onClick={()=>perms.canChat?runSim("Simulasikan penambahan 1 line produksi baru terhadap semua PO"):alert("Fitur chat tidak tersedia")} disabled={!perms.canChat}
                    style={{width:"100%",padding:"7px",borderRadius:7,border:"none",background:perms.canChat?"#4a3aa7":"#e5e5e5",color:perms.canChat?"#fff":"#aaa",cursor:perms.canChat?"pointer":"not-allowed",fontSize:11,fontWeight:500}}>
                    {perms.canChat?"Jalankan simulasi →":"🔒 Chat tidak tersedia"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ FORECAST ══ */}
          {page==="forecast"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:14}}>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"13px 15px"}}><div style={{fontSize:10,color:"#999",marginBottom:4}}>Forecast Demand 4 Minggu</div><div style={{fontSize:20,fontWeight:500,color:"#2a78d6"}}>{v(kpi.forecast_demand_4w," pcs")}</div></div>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"13px 15px"}}><div style={{fontSize:10,color:"#999",marginBottom:4}}>Gap Kapasitas</div><div style={{fontSize:20,fontWeight:500,color:Number(kpi.forecast_capacity_gap??0)>0?"#e24b4a":"#1baf7a"}}>{v(kpi.forecast_capacity_gap," pcs")}</div></div>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"13px 15px"}}><div style={{fontSize:10,color:"#999",marginBottom:4}}>Item Material Berisiko</div><div style={{fontSize:20,fontWeight:500,color:"#eda100"}}>{v(kpi.material_risk_items," item")}</div></div>
              </div>
              <div style={{marginBottom:10,fontSize:12,fontWeight:500,color:"#888"}}>Risiko 4–12 minggu:</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:14}}>
                {[{w:"4 minggu",c:"#b91c1c",bg:"#fde8e8",p:"Analisis risiko 4 minggu ke depan"},{w:"8 minggu",c:"#92400e",bg:"#fef3c7",p:"Analisis risiko 8 minggu ke depan"},{w:"12 minggu",c:"#1e40af",bg:"#eff6ff",p:"Analisis risiko 12 minggu ke depan"}].map(r=>(
                  perms.canChat?(
                    <button key={r.w} onClick={()=>{setPage("chat");setTimeout(()=>sendChat(r.p),150)}}
                      style={{background:r.bg,borderRadius:10,padding:"14px",border:`0.5px solid ${r.c}30`,cursor:"pointer",textAlign:"left"}}>
                      <div style={{fontSize:14,fontWeight:600,color:r.c,marginBottom:4}}>{r.w}</div>
                      <div style={{fontSize:10,color:r.c,opacity:.8}}>Klik untuk analisis AI →</div>
                    </button>
                  ):(
                    <div key={r.w} style={{background:r.bg,borderRadius:10,padding:"14px",border:`0.5px solid ${r.c}30`,opacity:.6}}>
                      <div style={{fontSize:14,fontWeight:600,color:r.c,marginBottom:4}}>{r.w}</div>
                      <div style={{fontSize:10,color:r.c}}>🔒 Login sebagai Analyst/Planning</div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* ══ CHARTS ══ */}
          {page==="charts"&&(
            <div style={{height:"calc(100vh - 48px)",display:"flex",flexDirection:"column"}}>
              <div style={{padding:"10px 20px",borderBottom:"0.5px solid rgba(0,0,0,.08)",display:"flex",alignItems:"center",gap:10,background:"#fff",flexShrink:0}}>
                <span style={{fontSize:13,fontWeight:500}}>Planning Production</span>
                <span style={{fontSize:10,background:"#eff6ff",color:"#1e40af",padding:"2px 8px",borderRadius:10,fontWeight:500}}>Looker Studio</span>
                <a href={LOOKER_FULL} target="_blank" rel="noreferrer" style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",color:"#555",textDecoration:"none",fontSize:11}}>
                  <i className="ti ti-external-link" style={{fontSize:12}}/> Buka fullscreen
                </a>
              </div>
              <iframe src={LOOKER_EMBED} width="100%" height="100%" style={{border:"none",flex:1}} allowFullScreen title="Planning Production"/>
            </div>
          )}

          {/* ══ CHAT ══ */}
          {page==="chat"&&(
            <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 90px)"}}>
              {!perms.canChat?(
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center"}}>
                  <div>
                    <div style={{fontSize:40,marginBottom:12}}>🔒</div>
                    <div style={{fontSize:14,fontWeight:500,color:"#555",marginBottom:6}}>Chat Room AI tidak tersedia</div>
                    <div style={{fontSize:12,color:"#999",lineHeight:1.7}}>Role <strong>{rl.label}</strong> tidak memiliki akses ke fitur chat.<br/>Fitur ini tersedia untuk Admin, Analyst, dan Tim Planning.</div>
                  </div>
                </div>
              ):(
                <>
                  <div style={{fontSize:10,color:"#bbb",marginBottom:6}}>Login sebagai: <strong style={{color:"#555"}}>{user.name}</strong> · {rl.label}</div>
                  <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingRight:2}}>
                    {msgs.map((m,i)=>(
                      <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",maxWidth:"88%",background:m.role==="user"?"rgba(42,120,214,.1)":"#f7f7f5",border:`0.5px solid ${m.role==="user"?"rgba(42,120,214,.25)":"rgba(0,0,0,.08)"}`,borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",padding:"10px 13px",fontSize:13,color:m.role==="user"?"#1e40af":"#111",lineHeight:1.65,whiteSpace:"pre-wrap"}}>
                        {m.content}{typing&&i===msgs.length-1&&m.role==="assistant"?"▍":""}
                      </div>
                    ))}
                    {typing&&msgs[msgs.length-1]?.role!=="assistant"&&(
                      <div style={{alignSelf:"flex-start",fontSize:12,color:"#bbb",display:"flex",alignItems:"center",gap:6}}>
                        <span>AI menganalisis</span>
                        {[0,1,2].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:"#bbb",display:"inline-block",animation:`pulse 1s ${i*.2}s infinite`}}/>)}
                      </div>
                    )}
                    <div ref={bottomRef}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}
                      placeholder="Tanya tentang produksi, risiko, simulasi..."
                      style={{flex:1,padding:"10px 13px",borderRadius:10,fontSize:13,border:"0.5px solid rgba(0,0,0,.15)",background:"#f7f7f5"}}/>
                    <button onClick={()=>sendChat()} disabled={typing||!input.trim()}
                      style={{padding:"10px 18px",borderRadius:10,fontSize:13,border:"none",background:typing||!input.trim()?"#e5e5e5":"#2a78d6",color:typing||!input.trim()?"#aaa":"#fff",cursor:typing||!input.trim()?"not-allowed":"pointer",fontWeight:500}}>
                      {typing?"...":"Kirim"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </div>
  )
}
