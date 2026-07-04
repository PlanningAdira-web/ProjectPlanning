"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

type Role  = "admin"|"planning"|"viewer"
type User  = { username:string; name:string; role:Role }
type Perms = { canRefreshAI:boolean; canChat:boolean; canBalancing:boolean; canToggleAI:boolean; canTodo:boolean }
type Page  = "exec"|"plan"|"sim"|"vis"|"ai"
type Msg   = { role:"user"|"assistant"; content:string }
type Todo  = { id:string; text:string; priority:"urgent"|"normal"; source:"ai"|"manual"; done:boolean; done_by:string|null }

const LOOKER_EMBED = "https://lookerstudio.google.com/embed/reporting/0325a3a3-4db1-4ee2-9728-ea977012e39e/page/p_first"
const LOOKER_FULL  = "https://lookerstudio.google.com/reporting/0325a3a3-4db1-4ee2-9728-ea977012e39e"

const ROLE_META: Record<Role,{label:string;color:string;bg:string}> = {
  admin    : { label:"Admin",        color:"#1a5c2a", bg:"#e8f5e9" },
  planning : { label:"Tim Planning", color:"#00695c", bg:"#e0f2f1" },
  viewer   : { label:"Viewer",       color:"#555",    bg:"#f3f4f6" },
}

const S: Record<string,React.CSSProperties> = {
  // Header
  hdr:      { background:"#1a5c2a", padding:"0 16px", display:"flex", alignItems:"center", gap:10, height:48, flexShrink:0 },
  hdrLogo:  { width:30, height:30, borderRadius:"50%", background:"#4caf50", display:"flex", alignItems:"center", justifyContent:"center" },
  hdrTitle: { color:"#fff", fontSize:14, fontWeight:500 },
  hdrSub:   { color:"#a5d6a7", fontSize:10 },
  hdrR:     { marginLeft:"auto", display:"flex", alignItems:"center", gap:8 },
  liveBadge:{ background:"#4caf50", color:"#fff", fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:500 },
  hdrDate:  { color:"#a5d6a7", fontSize:10 },
  // Tabs
  tabs:     { background:"#1a5c2a", padding:"0 16px", display:"flex", gap:0, borderTop:"1px solid rgba(255,255,255,.12)", flexShrink:0 },
  // Content
  content:  { flex:1, overflowY:"auto" as const, padding:"14px 16px" },
  // Section title
  stitle:   { fontSize:10, fontWeight:500, color:"#6b8f72", letterSpacing:".05em", textTransform:"uppercase" as const, marginBottom:8, marginTop:14, display:"flex", alignItems:"center", gap:5 },
  // Card
  card:     { background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8 },
  cardHead: { background:"#1a5c2a", borderRadius:"8px 8px 0 0", padding:"8px 12px", display:"flex", alignItems:"center", gap:6 },
  cardHs:   { color:"#fff", fontSize:11, fontWeight:500 },
  cardSub:  { color:"#a5d6a7", fontSize:9, marginLeft:"auto" },
  cardBody: { padding:"11px 12px" },
  // KPI
  kGrid:    { display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:8, marginBottom:12 },
  g2:       { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 },
  g4sim:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 },
  // Buttons
  refreshBtn: { display:"flex", alignItems:"center", gap:5, padding:"5px 14px", borderRadius:6, border:"none", color:"#fff", fontSize:11, fontWeight:500, cursor:"pointer" },
  logoutBtn:  { display:"flex", alignItems:"center", gap:5, padding:"8px 12px", border:"none", background:"transparent", cursor:"pointer", fontSize:11, color:"#a5d6a7", width:"100%", textAlign:"left" as const },
  // Chat
  chatInput:  { flex:1, padding:"9px 12px", borderRadius:"8px 0 0 8px", fontSize:12, border:"0.5px solid #c8e6c9", background:"#f4f9f4", outline:"none", fontFamily:"system-ui" },
  sendBtn:    { padding:"9px 16px", borderRadius:"0 8px 8px 0", border:"none", background:"#2e7d32", color:"#fff", fontSize:12, fontWeight:500, cursor:"pointer" },
}

function KPICard({ label, val, sub, color="#1a5c2a", left="#4caf50" }: any) {
  return (
    <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, padding:"9px 11px", borderLeft:`3px solid ${left}` }}>
      <div style={{ fontSize:10, color:"#6b8f72", marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:500, color, lineHeight:1.1 }}>{val ?? "—"}</div>
      {sub && <div style={{ fontSize:9, color:"#6b8f72", marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function Dot({ color }: { color:string }) {
  return <span style={{ width:6, height:6, borderRadius:"50%", background:color, display:"inline-block", marginRight:3, verticalAlign:"middle" }}/>
}

function PBar({ pct, color }: { pct:number; color:string }) {
  return (
    <span style={{ display:"inline-block", width:64, height:5, borderRadius:3, background:"#c8e6c9", overflow:"hidden", verticalAlign:"middle", marginRight:3 }}>
      <span style={{ display:"block", height:"100%", width:`${Math.min(pct,100)}%`, borderRadius:3, background:color }}/>
    </span>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [page,         setPage]         = useState<Page>("exec")
  const [user,         setUser]         = useState<User|null>(null)
  const [perms,        setPerms]        = useState<Perms>({ canRefreshAI:false, canChat:false, canBalancing:false, canToggleAI:false, canTodo:false })
  const [kpi,          setKpi]          = useState<any>({})
  const [cache,        setCache]        = useState<any>(null)
  const [refreshing,   setRefreshing]   = useState(false)
  const [todos,        setTodos]        = useState<Todo[]>([])
  const [newTodo,      setNewTodo]      = useState("")
  const [showAddTodo,  setShowAddTodo]  = useState(false)
  // Chat AI
  const [aiMsgs,       setAiMsgs]       = useState<Msg[]>([{ role:"assistant", content:"Halo! Saya AI Planning Assistant PT Adira Semesta Industry.\n\nSaya terhubung ke Data_Plan_DST, Data Export, dan SPO Stock. Tanya apa saja tentang planning, SPO, material, atau kapasitas." }])
  const [aiInput,      setAiInput]      = useState("")
  const [aiTyping,     setAiTyping]     = useState(false)
  // Chat Balancing
  const [balMsgs,      setBalMsgs]      = useState<Msg[]>([{ role:"assistant", content:"Halo! Isi form order baru di atas lalu klik \"Analisis\" — atau langsung ceritakan kebutuhan balancing Anda di sini.\n\nData diambil dari cache Data_Plan_DST." }])
  const [balInput,     setBalInput]     = useState("")
  const [balTyping,    setBalTyping]    = useState(false)
  const [balHistory,   setBalHistory]   = useState<any[]>([])
  // Form balancing
  const [bStyle,       setBStyle]       = useState("")
  const [bJenis,       setBJenis]       = useState("")
  const [bQty,         setBQty]         = useState("")
  const [bDate,        setBDate]        = useState("")
  const [bAnalyzing,   setBAnalyzing]   = useState(false)
  // Sim sliders
  const [simD,  setSimD]  = useState(10)
  const [simE,  setSimE]  = useState(8)
  const [simOT, setSimOT] = useState(2)
  const [simL,  setSimL]  = useState(1)
  // Clock
  const [clock, setClock] = useState("")
  const aiBottom  = useRef<HTMLDivElement>(null)
  const balBottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})+" WIB")
    tick(); const id = setInterval(tick, 10000); return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch("/api/auth/me").then(r=>r.json()).then(d => {
      if (!d.authenticated) { router.push("/login"); return }
      setUser(d.user); setPerms(d.permissions)
    }).catch(() => router.push("/login"))
  }, [router])

  useEffect(() => {
    fetch("/api/dashboard").then(r=>r.json()).then(d => {
      const { _cache, ...rest } = d; setKpi(rest); setCache(_cache)
    }).catch(() => {})
    fetch("/api/todo").then(r=>r.json()).then(d => setTodos(d.items ?? [])).catch(() => {})
  }, [])

  useEffect(() => { aiBottom.current?.scrollIntoView({ behavior:"smooth" }) }, [aiMsgs, aiTyping])
  useEffect(() => { balBottom.current?.scrollIntoView({ behavior:"smooth" }) }, [balMsgs, balTyping])

  async function handleRefresh() {
    if (refreshing || !perms.canRefreshAI) return
    setRefreshing(true)
    try {
      const r = await fetch("/api/dashboard?refresh=1")
      const d = await r.json()
      if (d.error) { alert(d.error); return }
      const { _cache, ...rest } = d; setKpi(rest); setCache(_cache)
      // Sync AI todos
      if (d.todo_ai?.length) {
        await fetch("/api/todo", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ action:"sync_ai", items:d.todo_ai }) })
        const td = await fetch("/api/todo").then(r=>r.json())
        setTodos(td.items ?? [])
      }
    } catch { alert("Gagal refresh") }
    finally { setRefreshing(false) }
  }

  async function handleToggleTodo(id: string) {
    if (!perms.canTodo) return
    await fetch("/api/todo", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"toggle", id }) })
    const d = await fetch("/api/todo").then(r=>r.json())
    setTodos(d.items ?? [])
  }

  async function handleAddTodo() {
    if (!newTodo.trim() || !perms.canTodo) return
    await fetch("/api/todo", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"add", text:newTodo.trim(), priority:"normal" }) })
    const d = await fetch("/api/todo").then(r=>r.json())
    setTodos(d.items ?? []); setNewTodo(""); setShowAddTodo(false)
  }

  async function sendAI(text?: string) {
    const msg = (text ?? aiInput).trim()
    if (!msg || aiTyping) return
    setAiInput("")
    const next: Msg[] = [...aiMsgs, { role:"user", content:msg }]
    setAiMsgs(next); setAiTyping(true)
    try {
      const r = await fetch("/api/chat", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ message:msg, history:aiMsgs }) })
      const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = ""
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream:true })
        setAiMsgs([...next, { role:"assistant", content:buf }])
      }
    } catch { setAiMsgs([...next, { role:"assistant", content:"❌ Gagal terhubung ke AI." }]) }
    finally { setAiTyping(false) }
  }

  async function sendBalancing(text?: string, isAnalysis = false) {
    const msg = (text ?? balInput).trim()
    if (!msg || balTyping) return
    setBalInput("")
    const orderCtx = isAnalysis && bStyle ? { style:bStyle, jenis:bJenis, qty:bQty, fProd:bDate } : undefined
    const next: Msg[] = [...balMsgs, { role:"user", content:msg }]
    setBalMsgs(next); setBalTyping(true)
    try {
      const r = await fetch("/api/balancing", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ message:msg, history:balMsgs, orderContext:orderCtx }) })
      const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = ""
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream:true })
        setBalMsgs([...next, { role:"assistant", content:buf }])
      }
      // Simpan ke history
      const histLabel = (bStyle || "Balancing") + (bQty ? " · " + parseInt(bQty).toLocaleString() + " pcs" : "")
      setBalHistory(h => [{date: new Date().toLocaleString("id-ID"), label: histLabel, msgs:[...next, { role:"assistant" as const, content:buf }]}, ...h.slice(0,9)])
    } catch { setBalMsgs([...next, { role:"assistant", content:"❌ Gagal terhubung ke AI." }]) }
    finally { setBalTyping(false) }
  }

  async function runAnalysis() {
    if (!bStyle || !bJenis || !bQty || !bDate) { alert("Lengkapi semua field"); return }
    setBAnalyzing(true)
    const prompt = `Analisis ketersediaan line untuk order baru:\n- Style: ${bStyle}\n- Jenis Style: ${bJenis}\n- Qty: ${parseInt(bQty).toLocaleString()} pcs\n- Rencana F. Prod: ${bDate}\n\nSemua line yang bisa mengerjakan ${bJenis} sudah full atau ada yang tersedia? Rekomendasikan opsi balancing terbaik dengan mempertimbangkan tanggal RENCANA F. PROD di Data_Plan_DST.`
    await sendBalancing(prompt, true)
    setBAnalyzing(false)
  }

  function goChat(msg: string) { setPage("ai"); setTimeout(() => sendAI(msg), 200) }

  const v = (x: any, s = "") => (x != null && x !== "") ? `${x}${s}` : "—"
  const rl = user ? ROLE_META[user.role] : ROLE_META.viewer

  const navStyle = (p: Page): React.CSSProperties => ({
    padding:"9px 14px", fontSize:11, cursor:"pointer",
    display:"flex", alignItems:"center", gap:5, color:page===p?"#fff":"#a5d6a7", fontWeight:page===p?500:400, transition:"all .15s",
    background:"transparent", border:"none", borderBottom:`3px solid ${page===p?"#4caf50":"transparent"}`,
  })

  const msgStyle = (r: "user"|"assistant"): React.CSSProperties => ({
    alignSelf: r==="user"?"flex-end":"flex-start", maxWidth:"90%",
    background: r==="user"?"#e8f5e9":"#fff",
    border:`0.5px solid ${r==="user"?"#a5d6a7":"#c8e6c9"}`,
    borderRadius: r==="user"?"10px 10px 4px 10px":"10px 10px 10px 4px",
    padding:"9px 12px", fontSize:11, color:r==="user"?"#1a5c2a":"#1b2a1e",
    lineHeight:1.65, whiteSpace:"pre-wrap" as const,
  })

  if (!user) return <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui", color:"#6b8f72" }}>Memuat...</div>

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"system-ui,sans-serif", background:"#f4f9f4" }}>

      {/* Header */}
      <div style={S.hdr}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
            <Image src="/Logo.svg" alt="Logo" width={32} height={32} style={{ objectFit:"contain" }} priority/>
          </div>
          <Image src="/Tulisan.svg" alt="Production Planning PT Adira Semesta Industry" width={180} height={55} style={{ objectFit:"contain" }} priority/>
        </div>
        <div style={S.hdrR}>
          <span style={S.liveBadge}>Live</span>
          <span style={S.hdrDate}>{clock}</span>
          {cache?.has_cache && <span style={{ fontSize:10, color:"#a5d6a7" }}>Update: {cache.age_label} oleh {cache.cached_by}</span>}
          {perms.canRefreshAI && (
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ ...S.refreshBtn, background:refreshing?"#388e3c":"#4caf50" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              {refreshing ? "Memuat..." : "Refresh Analisis AI"}
            </button>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(255,255,255,.12)", borderRadius:20, padding:"3px 10px" }}>
            <div style={{ width:22, height:22, borderRadius:"50%", background:"#ff9800", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:500, color:"#fff" }}>
              {user.name.slice(0,2).toUpperCase()}
            </div>
            <span style={{ color:"#fff", fontSize:11 }}>{user.name}</span>
            <span style={{ fontSize:9, background:rl.bg, color:rl.color, padding:"1px 6px", borderRadius:8, fontWeight:500 }}>{rl.label}</span>
          </div>
          <button onClick={async()=>{ await fetch("/api/auth/logout",{method:"POST"}); router.push("/login") }}
            style={{ background:"transparent", border:"none", cursor:"pointer", color:"#a5d6a7", fontSize:11 }}>Keluar</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {([["exec","ti-layout-dashboard","Executive Summary"],["plan","ti-calendar-stats","Planning"],["sim","ti-adjustments","Simulation Center"],["vis","ti-chart-bar","Visual Chart"],["ai","ti-message-2","AI Planning Assistant"]] as [Page,string,string][]).map(([p,icon,label]) => (
          <button key={p} onClick={()=>setPage(p)} style={navStyle(p)}>
            <i className={`ti ${icon}`} style={{ fontSize:13 }} aria-hidden="true"/>
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={S.content}>

        {/* ══ EXECUTIVE SUMMARY ══ */}
        {page==="exec" && (
          <div>
            {!cache?.has_cache && (
              <div style={{ background:"#fff3e0", border:"0.5px solid #ffcc80", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#e65100", display:"flex", alignItems:"center", gap:8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Belum ada analisis hari ini.{perms.canRefreshAI ? " Klik \"Refresh Analisis AI\" di kanan atas untuk memulai." : " Tunggu Admin/Analyst melakukan refresh pagi ini."}
              </div>
            )}

            <div style={{ ...S.stitle, marginTop:0 }}><i className="ti ti-chart-pie" aria-hidden="true" style={{ fontSize:12 }}/>KPI & overall capacity</div>
            <div style={S.kGrid}>
              <KPICard label="KPI Score"        val={v(kpi.kpi_score,"%")}              left="#4caf50" color="#1a5c2a"/>
              <KPICard label="Scorecard"         val={v(kpi.scorecard_score,"%")}         left="#00897b" color="#00695c"/>
              <KPICard label="Outstanding SPO"   val={kpi.outstanding_spo_pcs ? Number(kpi.outstanding_spo_pcs).toLocaleString("id-ID")+" pcs" : "—"} left="#ff9800" color="#e65100"/>
              <KPICard label="WIP > 1 Minggu"   val={kpi.wip_over_1week_pcs ? Number(kpi.wip_over_1week_pcs).toLocaleString("id-ID")+" pcs" : "—"} left="#c62828" color="#c62828"/>
            </div>

            {/* Capacity per style */}
            <div style={{ ...S.card, overflow:"hidden", marginBottom:12 }}>
              <div style={S.cardHead}><i className="ti ti-shirt" style={{ fontSize:13, color:"#a5d6a7" }} aria-hidden="true"/><span style={S.cardHs}>Capacity per style — Data Export vs SPO Stock</span><span style={S.cardSub}>per style & size</span></div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead><tr>{["Style","Order (pcs)","Produksi (pcs)","Sisa","% Pencapaian","Status"].map(h=>(
                  <th key={h} style={{ background:"#1a5c2a", color:"#fff", padding:"6px 9px", textAlign:"left", fontWeight:500, fontSize:10 }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {(kpi.capacity_by_style ?? [
                    { style:"Tour Authentic 2025 Men",   order_pcs:10224, produksi_pcs:7856, sisa_pcs:2368, pct:77,  status:"On Track"       },
                    { style:"Tour Authentic 2025 Women", order_pcs:7776,  produksi_pcs:7776, sisa_pcs:0,    pct:100, status:"Selesai"         },
                    { style:"Tour Auth UV Custom",        order_pcs:9936,  produksi_pcs:5400, sisa_pcs:4536, pct:54,  status:"Perlu Perhatian" },
                    { style:"Dynagrip Elite No Logo",     order_pcs:3600,  produksi_pcs:900,  sisa_pcs:2700, pct:25,  status:"Kritis"          },
                    { style:"PXG Cabretta",               order_pcs:4608,  produksi_pcs:3200, sisa_pcs:1408, pct:69,  status:"On Track"       },
                  ]).map((r: any, i: number) => {
                    const col = r.pct>=90?"#4caf50":r.pct>=60?"#ff9800":"#c62828"
                    const scol: Record<string,string> = { "Selesai":"#4caf50","On Track":"#ff9800","Perlu Perhatian":"#e65100","Kritis":"#c62828" }
                    return (
                      <tr key={i} style={{ background:i%2===0?"#fff":"#f9fdf9" }}>
                        <td style={{ padding:"6px 9px", borderBottom:"0.5px solid #c8e6c9" }}>{r.style}</td>
                        <td style={{ padding:"6px 9px", borderBottom:"0.5px solid #c8e6c9", textAlign:"right" }}>{Number(r.order_pcs).toLocaleString("id-ID")}</td>
                        <td style={{ padding:"6px 9px", borderBottom:"0.5px solid #c8e6c9", textAlign:"right" }}>{Number(r.produksi_pcs).toLocaleString("id-ID")}</td>
                        <td style={{ padding:"6px 9px", borderBottom:"0.5px solid #c8e6c9", textAlign:"right" }}>{Number(r.sisa_pcs).toLocaleString("id-ID")}</td>
                        <td style={{ padding:"6px 9px", borderBottom:"0.5px solid #c8e6c9" }}><PBar pct={r.pct} color={col}/>{r.pct}%</td>
                        <td style={{ padding:"6px 9px", borderBottom:"0.5px solid #c8e6c9" }}><Dot color={scol[r.status] ?? "#999"}/>{r.status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={S.g2}>
              {/* Material belum lengkap */}
              <div style={{ ...S.card, overflow:"hidden" }}>
                <div style={{ ...S.cardHead, background:"#e65100" }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize:13, color:"#fff" }} aria-hidden="true"/>
                  <span style={S.cardHs}>Material & preprod belum lengkap</span>
                  <span style={S.cardSub}>{(kpi.material_incomplete ?? []).length || 5} SPO</span>
                </div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead><tr>{["SPO","Style","Kekurangan","DST"].map(h=>(
                    <th key={h} style={{ background:"#bf360c", color:"#fff", padding:"5px 8px", textAlign:"left", fontWeight:500, fontSize:10 }}>{h}</th>
                  ))}</tr></thead>
                  <tbody>
                    {(kpi.material_incomplete ?? [
                      { spo:"0904/26", style:"Tour Auth Men",    kekurangan:"KA 288",              dst_date:"3 Jul"  },
                      { spo:"1012/26", style:"Tour Auth UV",     kekurangan:"LAD 2880, LADKA 864", dst_date:"8 Jul"  },
                      { spo:"1013/26", style:"Tour Auth UV",     kekurangan:"LAD 2592, LADKA 288", dst_date:"8 Jul"  },
                      { spo:"1147/26", style:"Tour Auth UV",     kekurangan:"LAD 2304",            dst_date:"12 Jul" },
                      { spo:"1222/26", style:"Tour Auth Custom", kekurangan:"LAD 288",             dst_date:"15 Jul" },
                    ]).map((r: any, i: number) => (
                      <tr key={i}>
                        <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #c8e6c9" }}>{r.spo}</td>
                        <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #c8e6c9", fontSize:10 }}>{r.style}</td>
                        <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #c8e6c9", color:"#c62828", fontSize:10, fontStyle:"italic" }}>{r.kekurangan}</td>
                        <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #c8e6c9", color:i<2?"#c62828":"#e65100", fontWeight:500 }}>{r.dst_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Plan To-Do */}
              <div style={{ ...S.card, overflow:"hidden" }}>
                <div style={S.cardHead}>
                  <i className="ti ti-checklist" style={{ fontSize:13, color:"#a5d6a7" }} aria-hidden="true"/>
                  <span style={S.cardHs}>Plan to-do hari ini</span>
                  <span style={S.cardSub}>{new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</span>
                </div>
                <div style={{ padding:"10px 12px" }}>
                  {todos.length === 0 && (
                    <div style={{ fontSize:11, color:"#6b8f72", textAlign:"center", padding:"12px 0" }}>
                      {perms.canRefreshAI ? "Klik \"Refresh Analisis AI\" untuk generate to-do hari ini." : "Menunggu Admin generate to-do pagi ini."}
                    </div>
                  )}
                  {todos.map(t => (
                    <div key={t.id} onClick={()=>handleToggleTodo(t.id)}
                      style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"7px 9px", borderRadius:7, marginBottom:5, border:"0.5px solid #c8e6c9", background:t.done?"#f1f8f2":"#fff", cursor:perms.canTodo?"pointer":"default", opacity:t.done ? 0.65 : 1 }}>
                      <div style={{ width:17, height:17, borderRadius:4, border:`1.5px solid ${t.done?"#2e7d32":"#2e7d32"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, background:t.done?"#2e7d32":"transparent" }}>
                        {t.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div style={{ flex:1, fontSize:11, color:"#1b2a1e", lineHeight:1.5, textDecoration:t.done?"line-through":"none", opacity:t.done ? 0.6 : 1 }}>{t.text}</div>
                      <span style={{ fontSize:9, padding:"1px 6px", borderRadius:8, fontWeight:500, flexShrink:0,
                        background: t.source==="ai" ? "#e0f2f1" : t.priority==="urgent" ? "#ffebee" : "#f1f8f2",
                        color: t.source==="ai" ? "#00695c" : t.priority==="urgent" ? "#c62828" : "#6b8f72" }}>
                        {t.source==="ai" ? "AI" : t.priority==="urgent" ? "Urgent" : "Manual"}
                      </span>
                    </div>
                  ))}
                  {perms.canTodo && (
                    showAddTodo ? (
                      <div style={{ display:"flex", gap:6, marginTop:6 }}>
                        <input value={newTodo} onChange={e=>setNewTodo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddTodo()}
                          placeholder="Ketik to-do baru..." autoFocus
                          style={{ flex:1, padding:"6px 9px", borderRadius:7, border:"0.5px solid #c8e6c9", fontSize:11, outline:"none", fontFamily:"system-ui" }}/>
                        <button onClick={handleAddTodo} style={{ padding:"6px 12px", borderRadius:7, border:"none", background:"#2e7d32", color:"#fff", fontSize:10, cursor:"pointer" }}>Tambah</button>
                        <button onClick={()=>setShowAddTodo(false)} style={{ padding:"6px 10px", borderRadius:7, border:"0.5px solid #c8e6c9", background:"#fff", fontSize:10, cursor:"pointer", color:"#6b8f72" }}>Batal</button>
                      </div>
                    ) : (
                      <div onClick={()=>setShowAddTodo(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 9px", borderRadius:7, border:"0.5px dashed #c8e6c9", color:"#6b8f72", fontSize:11, cursor:"pointer", marginTop:6 }}>
                        <i className="ti ti-plus" style={{ fontSize:12 }} aria-hidden="true"/>Tambah to-do manual
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ PLANNING ══ */}
        {page==="plan" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ ...S.stitle, margin:0 }}><i className="ti ti-calendar-stats" aria-hidden="true" style={{ fontSize:12 }}/>Planning per factory</div>
              <div style={{ display:"flex", gap:6 }}>
                <select style={{ fontSize:10, padding:"4px 7px", borderRadius:6, border:"0.5px solid #c8e6c9" }}>
                  <option>Factory A (K01–K05)</option><option>Factory B (K06–K10)</option><option>Factory C (K11–K15)</option>
                </select>
                <button style={{ fontSize:10, padding:"4px 8px", borderRadius:5, border:"0.5px solid #c8e6c9", background:"#fff", cursor:"pointer" }}>◀</button>
                <button style={{ fontSize:10, padding:"4px 8px", borderRadius:5, border:"0.5px solid #c8e6c9", background:"#fff", cursor:"pointer" }}>▶</button>
              </div>
            </div>
            <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9" }}>
              <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:10, width:"100%" }}>
                <thead>
                  <tr>
                    {([ ["Line",44,"left",0],["SPO",68,"left",44],["Style",155,"left",112],["Qty Plan",72,"right",267],["Note",120,"left",339],["Priority",85,"center",459] ] as [string,number,string,number][]).map(([h,w,a,l],i) => (
                      <th key={i} style={{ background:"#1a5c2a", color:"#fff", padding:"7px 9px", fontWeight:500, whiteSpace:"nowrap" as const, position:"sticky", top:0, zIndex:4, textAlign:a as any, minWidth:w, left:l, borderRight:i===5?"2px solid rgba(255,255,255,.3)":"0.5px solid rgba(255,255,255,.15)" }}>{h}</th>
                    ))}
                    {[["29-Jun","#1b4d24"],["30-Jun","#1b4d24"],["01-Jul","#1b4d24"],["02-Jul","#1b4d24"],["03-Jul","#245c2a"],["04-Jul","#245c2a"],["05-Jul","#245c2a"],["06-Jul","#245c2a"],["07-Jul","#1a5c2a"],["08-Jul","#1a5c2a"],["09-Jul","#1a5c2a"],["10-Jul","#1a5c2a"],["11-Jul","#1a5c2a"],["12-Jul","#1a5c2a"]].map(([d,bg]) => (
                      <th key={d} style={{ background:bg, color:"#fff", padding:"7px 9px", fontWeight:500, whiteSpace:"nowrap", position:"sticky", top:0, zIndex:2, minWidth:60, textAlign:"center", borderRight:"0.5px solid rgba(255,255,255,.1)" }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { factory:"Factory A", line:"K01", rows:[
                      { spo:"0911/26", style:"Tour Authentic 2025 Men",     qty:"8,928", note:"—",                   prio:"Normal",    ph:false, dates:{ "29-Jun":900,"30-Jun":576,"01-Jul":957,"02-Jul":411,"03-Jul":756,"04-Jul":540 } },
                      { spo:"0904/26", style:"Tour Authentic 2025 Women",   qty:"7,776", note:"KA 288",              prio:"KA DULU",   ph:true,  dates:{ "30-Jun":288,"02-Jul":467,"03-Jul":288 } },
                      { spo:"1012/26", style:"Tour Auth UV Custom 2025",    qty:"3,744", note:"LAD 2880, LADKA 864", prio:"LAD, KA DULU", ph:true, dates:{ "05-Jul":480,"06-Jul":480,"07-Jul":480,"08-Jul":480,"09-Jul":480 } },
                      { spo:"1147/26", style:"Tour Auth UV Custom 2025",    qty:"2,304", note:"LAD 2304",            prio:"LAD",       ph:true,  dates:{ "08-Jul":384,"09-Jul":384,"10-Jul":384 } },
                    ]},
                    { factory:"Factory A", line:"K02", rows:[
                      { spo:"0911/26", style:"Tour Authentic 2025 Men",     qty:"10,224", note:"—",  prio:"Normal", ph:false, dates:{ "29-Jun":792,"30-Jun":36,"01-Jul":892,"02-Jul":768,"03-Jul":672,"04-Jul":480 } },
                      { spo:"0904/26", style:"Tour Authentic 2025 Men",     qty:"9,648",  note:"—",  prio:"Normal", ph:false, dates:{ "30-Jun":432,"03-Jul":480,"04-Jul":480 } },
                      { spo:"1028/26", style:"Tour Authentic 2025 Men",     qty:"3,600",  note:"—",  prio:"Normal", ph:false, dates:{ "05-Jul":480,"06-Jul":480,"07-Jul":480 } },
                    ]},
                    { factory:"Factory B", line:"K06", rows:[
                      { spo:"1244/26", style:"Tour Authentic 2025 Men",     qty:"6,480", note:"size S dulu 2304", prio:"KI DULU", ph:true, dates:{ "01-Jul":480,"02-Jul":480,"03-Jul":480,"04-Jul":480,"05-Jul":480 } },
                      { spo:"1215/26", style:"Tour Authentic 2025 Men",     qty:"2,016", note:"—", prio:"Normal", ph:false, dates:{ "06-Jul":480,"07-Jul":480,"08-Jul":480 } },
                    ]},
                  ].map(({ factory, line, rows }) => {
                    const dateCols = ["29-Jun","30-Jun","01-Jul","02-Jul","03-Jul","04-Jul","05-Jul","06-Jul","07-Jul","08-Jul","09-Jul","10-Jul","11-Jul","12-Jul"]
                    const twCols   = new Set(["03-Jul","04-Jul","05-Jul","06-Jul"])
                    const scBase: React.CSSProperties = { padding:"5px 9px", borderBottom:"0.5px solid #c8e6c9", borderRight:"0.5px solid rgba(200,230,201,.4)", whiteSpace:"nowrap" }
                    const scSticky = (left: number, extra: React.CSSProperties = {}): React.CSSProperties => ({ ...scBase, position:"sticky", left, background:"#fff", zIndex:1, ...extra })
                    return [
                      <tr key={`${line}-sep`} style={{ background:"#e8f5e9" }}>
                        <td style={{ ...scSticky(0), fontWeight:500, color:"#1a5c2a", fontSize:11 }}>{factory}</td>
                        <td style={scSticky(44)}>—</td>
                        <td style={{ ...scSticky(112), fontWeight:500, color:"#1a5c2a" }}>Line {line}</td>
                        <td style={scSticky(267,{ textAlign:"right" })}></td>
                        <td style={scSticky(339)}></td>
                        <td style={{ ...scSticky(459), borderRight:"2px solid #c8e6c9" }}></td>
                        {dateCols.map(d => <td key={d} style={{ ...scBase, background:"#e8f5e9" }}></td>)}
                      </tr>,
                      ...rows.map((r, ri) => (
                        <tr key={`${line}-${ri}`}>
                          <td style={scSticky(0)}><strong>{line}</strong></td>
                          <td style={scSticky(44)}>{r.spo}</td>
                          <td style={scSticky(112)}>{r.style}</td>
                          <td style={{ ...scSticky(267), textAlign:"right" }}>{r.qty}</td>
                          <td style={{ ...scSticky(339), color:r.note==="—"?"#6b8f72":"#e65100", fontStyle:r.note==="—"?"normal":"italic", fontSize:10 }}>{r.note}</td>
                          <td style={{ ...scSticky(459), borderRight:"2px solid #c8e6c9", textAlign:"center",
                            color:r.ph?"#c62828":"#6b8f72", fontWeight:r.ph?500:400, fontSize:10,
                            background:r.ph?"#fff8f8":"#fff" }}>
                            {r.ph ? (
                              <span style={{ background:"#ffebee", color:"#c62828", fontSize:9, padding:"2px 7px", borderRadius:8, fontWeight:500 }}>{r.prio}</span>
                            ) : (
                              <span style={{ background:"#e8f5e9", color:"#6b8f72", fontSize:9, padding:"2px 7px", borderRadius:8 }}>{r.prio}</span>
                            )}
                          </td>
                          {dateCols.map(d => {
                            const val = (r.dates as any)[d]
                            const isTw = twCols.has(d)
                            return (
                              <td key={d} style={{ ...scBase, textAlign:"center", background:isTw?"#f1f8f2":"#fff",
                                color:"#1a5c2a", fontWeight:val?500:400 }}>
                                {val ? val.toLocaleString("id-ID") : ""}
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    ]
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop:8, fontSize:9, color:"#6b8f72", display:"flex", gap:14, flexWrap:"wrap" }}>
              <span><span style={{ display:"inline-block", width:9, height:9, background:"#f1f8f2", border:"0.5px solid #c8e6c9", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Minggu ini</span>
              <span><span style={{ display:"inline-block", width:9, height:9, background:"#ffebee", border:"0.5px solid #ef9a9a", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Priority tinggi</span>
              <span style={{ marginLeft:"auto", color:"#6b8f72" }}>Line · SPO · Style · Qty · Note · Priority dikunci — Scroll → untuk tanggal</span>
            </div>
          </div>
        )}

        {/* ══ SIMULATION CENTER ══ */}
        {page==="sim" && (
          <div>
            {/* 4 Sim cards */}
            <div style={{ ...S.stitle, marginTop:0 }}><i className="ti ti-adjustments" aria-hidden="true" style={{ fontSize:12 }}/>Simulasi dampak</div>
            <div style={S.g4sim}>
              {[
                { title:"Dampak perubahan demand", color:"#1a5c2a", val:simD, setVal:setSimD, min:-30, max:50, unit:"%", hint:"", prompt:`Simulasikan dampak demand berubah ${simD>=0?"+":""}${simD}% dari kondisi saat ini` },
                { title:"Dampak kenaikan efisiensi", color:"#00695c", val:simE, setVal:setSimE, min:1, max:25, unit:"%", hint:"", prompt:`Simulasikan efisiensi semua line naik ${simE}%` },
                { title:"Dampak overtime", color:"#e65100", val:simOT, setVal:setSimOT, min:0, max:3, unit:" jam", hint:"Maks 3 jam sesuai UU Ketenagakerjaan No.13/2003 Ps.78", prompt:`Simulasikan overtime ${simOT} jam/hari, pertimbangkan UU Ketenagakerjaan No.13/2003` },
                { title:"Dampak penambahan/pengurangan line", color:"#c62828", val:simL, setVal:setSimL, min:-3, max:5, unit:"", hint:"", prompt:`Simulasikan perubahan ${simL>=0?"+":""}${simL} line produksi` },
              ].map(s => (
                <div key={s.title} style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, padding:"12px 13px" }}>
                  <div style={{ fontSize:11, fontWeight:500, marginBottom:9, color:s.color }}>{s.title}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:10 }}>
                    <span style={{ color:"#3d5a42" }}>Nilai</span>
                    <span style={{ fontWeight:500, color:s.color }}>{s.val>=0&&s.unit!=="jam"?"+":""}{s.val}{s.unit}</span>
                  </div>
                  <input type="range" min={s.min} max={s.max} value={s.val} step={1}
                    onChange={e => s.setVal(Number(e.target.value))}
                    style={{ width:"100%", accentColor:s.color, marginBottom:6 }}/>
                  {s.hint && <div style={{ fontSize:9, color:"#6b8f72", marginBottom:6 }}>{s.hint}</div>}
                  <button onClick={()=>goChat(s.prompt)}
                    style={{ width:"100%", padding:"7px", borderRadius:7, border:"none", background:s.color, color:"#fff", fontSize:10, fontWeight:500, cursor:"pointer" }}>
                    Jalankan simulasi ↗
                  </button>
                </div>
              ))}
            </div>

            {/* Balancing DST */}
            <div style={{ ...S.stitle }}><i className="ti ti-scale" aria-hidden="true" style={{ fontSize:12 }}/>Balancing planning DST</div>
            <div style={{ ...S.card, overflow:"hidden", marginBottom:12 }}>
              <div style={S.cardHead}><i className="ti ti-package" style={{ fontSize:13, color:"#a5d6a7" }} aria-hidden="true"/><span style={S.cardHs}>Input order baru</span><span style={S.cardSub}>Data_Plan_DST (cache)</span></div>
              <div style={{ padding:"11px 12px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                  {[
                    { label:"Style", el:<input type="text" value={bStyle} onChange={e=>setBStyle(e.target.value)} placeholder="Tour Authentic 2025 Men" style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11, fontFamily:"system-ui" }}/> },
                    { label:"Jenis Style", el:<select value={bJenis} onChange={e=>setBJenis(e.target.value)} style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11 }}><option value="">Pilih...</option><option>Full Pola</option><option>Synth</option><option>Patch + IJ</option></select> },
                    { label:"Qty (pcs)", el:<input type="number" value={bQty} onChange={e=>setBQty(e.target.value)} placeholder="200000" style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11, fontFamily:"system-ui" }}/> },
                    { label:"Rencana F. Prod", el:<input type="date" value={bDate} onChange={e=>setBDate(e.target.value)} style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11, fontFamily:"system-ui" }}/> },
                  ].map(({ label, el }) => (
                    <div key={label} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                      <label style={{ fontSize:10, fontWeight:500, color:"#6b8f72" }}>{label}</label>
                      {el}
                    </div>
                  ))}
                </div>
                <button onClick={runAnalysis} disabled={bAnalyzing || !perms.canBalancing}
                  style={{ width:"100%", padding:"8px", borderRadius:7, border:"none",
                    background:!perms.canBalancing?"#e5e5e5":bAnalyzing?"#388e3c":"#2e7d32",
                    color:!perms.canBalancing?"#aaa":"#fff", fontSize:11, fontWeight:500,
                    cursor:!perms.canBalancing?"not-allowed":"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  <i className="ti ti-brain" style={{ fontSize:13 }} aria-hidden="true"/>
                  {!perms.canBalancing ? "🔒 Hanya Admin / Tim Planning" : bAnalyzing ? "Menganalisis..." : "Analisis ketersediaan & rekomendasi balancing"}
                </button>
              </div>
            </div>

            {/* Chat Balancing */}
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:12 }}>
              {/* Status line mini */}
              <div style={{ ...S.card, overflow:"hidden" }}>
                <div style={S.cardHead}><i className="ti ti-layout-grid" style={{ fontSize:12, color:"#a5d6a7" }} aria-hidden="true"/><span style={{ ...S.cardHs, fontSize:10 }}>Status line</span></div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
                  <thead><tr>{["Line","Jenis","Status"].map(h=><th key={h} style={{ background:"#1a5c2a", color:"#fff", padding:"5px 7px", textAlign:"left", fontWeight:500, fontSize:9 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[{f:"A"},{l:"K01",j:"Full Pola, Synth",s:"Full",c:"#c62828",bc:"#ffebee"},{l:"K02",j:"Full Pola, Synth",s:"Full",c:"#c62828",bc:"#ffebee"},{l:"K03",j:"Full Pola",s:"Parsial",c:"#e65100",bc:"#fff3e0"},{l:"K04",j:"Synth, Patch+IJ",s:"Tersedia",c:"#1a5c2a",bc:"#e8f5e9"},
                      {f:"B"},{l:"K06",j:"Full Pola, Synth",s:"Parsial",c:"#e65100",bc:"#fff3e0"},{l:"K09",j:"Synth",s:"Tersedia",c:"#1a5c2a",bc:"#e8f5e9"},
                      {f:"C"},{l:"K11",j:"Full Pola, Synth",s:"Tersedia",c:"#1a5c2a",bc:"#e8f5e9"},{l:"K12",j:"Patch+IJ",s:"Parsial",c:"#e65100",bc:"#fff3e0"},
                    ].map((r: any, i) => r.f ? (
                      <tr key={i}><td colSpan={3} style={{ background:"#e8f5e9", padding:"4px 7px", fontWeight:500, color:"#1a5c2a", fontSize:10 }}>Factory {r.f}</td></tr>
                    ) : (
                      <tr key={i}><td style={{ padding:"5px 7px", borderBottom:"0.5px solid #c8e6c9" }}><strong>{r.l}</strong></td><td style={{ padding:"5px 7px", borderBottom:"0.5px solid #c8e6c9", fontSize:9, color:"#3d5a42" }}>{r.j}</td><td style={{ padding:"5px 7px", borderBottom:"0.5px solid #c8e6c9" }}><span style={{ fontSize:8, padding:"1px 5px", borderRadius:8, background:r.bc, color:r.c, fontWeight:500 }}>{r.s}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Chat */}
              <div style={{ display:"flex", flexDirection:"column" }}>
                <div style={{ fontSize:10, fontWeight:500, color:"#6b8f72", letterSpacing:".04em", marginBottom:6, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  CHAT BALANCING AI
                  {balHistory.length > 0 && <span style={{ fontSize:10, color:"#2e7d32", cursor:"pointer" }}><i className="ti ti-history" style={{ fontSize:11 }} aria-hidden="true"/> {balHistory.length} riwayat</span>}
                </div>
                <div style={{ height:260, overflowY:"auto", display:"flex", flexDirection:"column", gap:7, padding:9, background:"#f4f9f4", borderRadius:"7px 7px 0 0", border:"0.5px solid #c8e6c9", borderBottom:"none" }}>
                  {balMsgs.map((m,i) => (
                    <div key={i} style={{ ...msgStyle(m.role), fontSize:10 }}>
                      {m.content}{balTyping&&i===balMsgs.length-1&&m.role==="assistant"?"▍":""}
                    </div>
                  ))}
                  {balTyping && balMsgs[balMsgs.length-1]?.role!=="assistant" && (
                    <div style={{ alignSelf:"flex-start", fontSize:10, color:"#6b8f72", display:"flex", gap:3 }}>
                      {[0,1,2].map(i=><span key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#4caf50", display:"inline-block", animation:`pulse 0.8s ${i*.15}s infinite` }}/>)}
                      <span style={{ marginLeft:4 }}>AI menganalisis data line...</span>
                    </div>
                  )}
                  <div ref={balBottom}/>
                </div>
                <div style={{ border:"0.5px solid #c8e6c9", borderTop:"none", borderRadius:"0 0 7px 7px", background:"#fff", padding:"7px 9px", display:"flex", gap:6 }}>
                  <input value={balInput} onChange={e=>setBalInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendBalancing()}
                    placeholder="Tanya lanjutan: jadwal detail, risiko material, biaya overtime..."
                    style={{ flex:1, border:"none", outline:"none", fontSize:11, fontFamily:"system-ui", background:"transparent" }}/>
                  <button onClick={()=>sendBalancing()} disabled={balTyping||!balInput.trim()||!perms.canBalancing}
                    style={{ padding:"5px 12px", borderRadius:6, border:"none", background:balTyping||!balInput.trim()||!perms.canBalancing?"#e5e5e5":"#2e7d32", color:balTyping||!balInput.trim()||!perms.canBalancing?"#aaa":"#fff", fontSize:10, fontWeight:500, cursor:"pointer" }}>
                    Kirim
                  </button>
                </div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:6 }}>
                  {["Geser F.Prod 1 minggu","Detail jadwal per line","Cek risiko material","Line alternatif factory lain","Estimasi biaya overtime"].map(q=>(
                    <div key={q} onClick={()=>{setBalInput(q); setTimeout(()=>sendBalancing(q),100)}}
                      style={{ fontSize:9, padding:"2px 8px", borderRadius:10, border:"0.5px solid #c8e6c9", background:"#fff", cursor:"pointer", color:"#3d5a42" }}>
                      {q}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ VISUAL CHART ══ */}
        {page==="vis" && (
          <div style={{ height:"calc(100vh - 100px)", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"10px 0", borderBottom:"0.5px solid #c8e6c9", display:"flex", alignItems:"center", gap:10, marginBottom:0, flexShrink:0 }}>
              <span style={{ fontSize:13, fontWeight:500, color:"#1a5c2a" }}>Planning Production</span>
              <span style={{ fontSize:10, background:"#e3f2fd", color:"#1565c0", padding:"2px 8px", borderRadius:10, fontWeight:500 }}>Looker Studio</span>
              <span style={{ fontSize:10, color:"#6b8f72", marginLeft:"auto" }}>Data dari Google Sheets yang sama · 0 token</span>
              <a href={LOOKER_FULL} target="_blank" rel="noreferrer"
                style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#f4f9f4", color:"#3d5a42", textDecoration:"none", fontSize:11 }}>
                <i className="ti ti-external-link" style={{ fontSize:12 }} aria-hidden="true"/>Buka fullscreen
              </a>
            </div>
            <iframe src={LOOKER_EMBED} width="100%" height="100%" style={{ border:"none", flex:1 }} allowFullScreen title="Planning Production — Looker Studio"/>
          </div>
        )}

        {/* ══ AI PLANNING ASSISTANT ══ */}
        {page==="ai" && (
          <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 100px)" }}>
            <div style={{ fontSize:10, color:"#6b8f72", marginBottom:6 }}>
              Login sebagai: <strong style={{ color:"#1a5c2a" }}>{user.name}</strong> · {rl.label}
              {!perms.canChat && <span style={{ marginLeft:8, color:"#c62828" }}>🔒 Chat tidak tersedia untuk role Viewer</span>}
            </div>
            {!perms.canChat ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}>
                <div style={{ fontSize:32 }}>🔒</div>
                <div style={{ fontSize:13, fontWeight:500, color:"#555" }}>Chat AI tidak tersedia</div>
                <div style={{ fontSize:12, color:"#6b8f72", textAlign:"center", lineHeight:1.7 }}>Role <strong>Viewer</strong> hanya bisa melihat dashboard.<br/>Login sebagai Analyst atau Planning untuk akses chat.</div>
              </div>
            ) : (
              <>
                <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:9, paddingRight:2 }}>
                  {aiMsgs.map((m,i) => (
                    <div key={i} style={msgStyle(m.role)}>
                      {m.content}{aiTyping&&i===aiMsgs.length-1&&m.role==="assistant"?"▍":""}
                    </div>
                  ))}
                  {aiTyping && aiMsgs[aiMsgs.length-1]?.role!=="assistant" && (
                    <div style={{ alignSelf:"flex-start", fontSize:12, color:"#6b8f72", display:"flex", alignItems:"center", gap:4 }}>
                      {[0,1,2].map(i=><span key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#4caf50", display:"inline-block", animation:`pulse 0.8s ${i*.15}s infinite` }}/>)}
                      <span style={{ marginLeft:4 }}>AI menganalisis data spreadsheet...</span>
                    </div>
                  )}
                  <div ref={aiBottom}/>
                </div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", margin:"8px 0" }}>
                  {["Status produksi hari ini","SPO paling berisiko terlambat","Balancing line K01 optimal?","Risiko material minggu depan","Executive summary kapasitas"].map(q=>(
                    <div key={q} onClick={()=>sendAI(q)}
                      style={{ fontSize:10, padding:"3px 9px", borderRadius:20, border:"0.5px solid #c8e6c9", background:"#fff", cursor:"pointer", color:"#3d5a42" }}>
                      {q}
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex" }}>
                  <input value={aiInput} onChange={e=>setAiInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendAI()}
                    placeholder="Tanya tentang planning, SPO, material, kapasitas..."
                    style={S.chatInput}/>
                  <button onClick={()=>sendAI()} disabled={aiTyping||!aiInput.trim()}
                    style={{ ...S.sendBtn, borderRadius:"0 8px 8px 0", opacity:(aiTyping||!aiInput.trim()) ? 0.5 : 1 }}>
                    {aiTyping?"...":"Kirim"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </div>
  )
}
