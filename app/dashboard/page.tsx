"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

type Role  = "admin"|"planning"|"viewer"
type User  = { username:string; name:string; role:Role }
type Perms = { canRefreshAI:boolean; canChat:boolean; canBalancing:boolean; canToggleAI:boolean; canTodo:boolean }
type Page  = "vis"|"plan"|"sim"|"ai"
type Msg   = { role:"user"|"assistant"; content:string }
type Todo  = { id:string; text:string; priority:"urgent"|"normal"; source:"ai"|"manual"; done:boolean; done_by:string|null }

const LOOKER_EMBED = "https://lookerstudio.google.com/embed/reporting/0325a3a3-4db1-4ee2-9728-ea977012e39e/page/p_first"
const LOOKER_FULL  = "https://lookerstudio.google.com/reporting/0325a3a3-4db1-4ee2-9728-ea977012e39e"

const ROLE_META: Record<Role,{label:string;color:string;bg:string}> = {
  admin    : { label:"Admin",        color:"#1a5c2a", bg:"#e8f5e9" },
  planning : { label:"Tim Planning", color:"#00695c", bg:"#e0f2f1" },
  viewer   : { label:"Viewer",       color:"#555",    bg:"#f3f4f6" },
}

// -- Shared style constants ---------------------------------------
const C = {
  gdark:"#1a5c2a", gmid:"#2e7d32", glight:"#4caf50", gpale:"#e8f5e9", gxpale:"#f1f8f2",
  org:"#e65100", orl:"#ff9800", orp:"#fff3e0",
  red:"#c62828", rdp:"#ffebee",
  blue:"#1565c0", blp:"#e3f2fd",
  teal:"#00695c", tlp:"#e0f2f1",
  txt:"#1b2a1e", tx2:"#3d5a42", tx3:"#6b8f72",
  bdr:"#c8e6c9", wh:"#fff", bg:"#f4f9f4",
}

// -- Sub-components -----------------------------------------------
function PlanningTable(props: { planLoading: boolean; planData: any; planFactory: string }) {
  const { planLoading, planData, planFactory } = props

  if (planLoading) {
    return (
      <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
        Memuat data planning dari spreadsheet...
      </div>
    )
  }
  if (!planData) {
    return (
      <div style={{ padding:"24px", textAlign:"center", background:C.orp, borderRadius:8, border:"0.5px solid #ffcc80", fontSize:12, color:C.org }}>
        Gagal memuat data planning. Pastikan sheet Data_Plan_DST tersedia.
      </div>
    )
  }

  const rows: any[]    = planData.rows[planFactory] ?? []
  const dates: string[]= planData.dateHeaders ?? []
  const today          = new Date()

  const currWeekDates = new Set(
    dates.filter(function(d: string) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      const parts  = d.split("-")
      const mIdx   = months.findIndex(function(m: string) { return m === parts[1] })
      const dt     = new Date(today.getFullYear(), mIdx, parseInt(parts[0]))
      const diff   = (dt.getTime() - today.getTime()) / 86400000
      return diff >= 0 && diff < 7
    })
  )

  const lines = Array.from(new Set(rows.map(function(r: any) { return r.line })))

  const stickyCell = function(l: number, bg: string, extra: any) {
    return Object.assign({
      padding:"5px 8px",
      borderBottom:"0.5px solid #e0ece0",
      borderRight:"0.5px solid #c8e6c9",
      background:bg,
      position:"sticky",
      left:l,
      zIndex:1,
      whiteSpace:"nowrap",
    }, extra || {})
  }

  const headerCols = [
    { h:"Line",     w:46,  a:"left",   l:0   },
    { h:"SPO",      w:74,  a:"left",   l:46  },
    { h:"Style",    w:172, a:"left",   l:120 },
    { h:"Note",     w:112, a:"left",   l:292 },
    { h:"Priority", w:88,  a:"center", l:404 },
  ]

  return (
    <div>
      <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9" }}>
        <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:10, minWidth:"max-content" }}>
          <thead>
            <tr>
              {headerCols.map(function(col, i) {
                return (
                  <th key={i} style={{
                    background: i===4 ? "#1b4d24" : C.gdark,
                    color:"#fff",
                    padding:"6px 8px",
                    fontWeight:500,
                    whiteSpace:"nowrap",
                    position:"sticky",
                    top:0,
                    left:col.l,
                    zIndex:5+i,
                    minWidth:col.w,
                    textAlign:col.a,
                    borderRight: i===4 ? "2px solid rgba(255,255,255,.3)" : "0.5px solid rgba(255,255,255,.15)",
                    borderBottom:"1px solid rgba(255,255,255,.2)",
                  }}>
                    {col.h}
                  </th>
                )
              })}
              {dates.map(function(d: string) {
                return (
                  <th key={d} style={{
                    background: currWeekDates.has(d) ? "#2e7d32" : C.gdark,
                    color:"#fff",
                    padding:"6px 8px",
                    fontWeight:500,
                    whiteSpace:"nowrap",
                    position:"sticky",
                    top:0,
                    zIndex:2,
                    minWidth:58,
                    textAlign:"center",
                    borderRight:"0.5px solid rgba(255,255,255,.1)",
                    borderBottom:"1px solid rgba(255,255,255,.2)",
                  }}>
                    {d}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lines.map(function(line: any, li: number) {
              const lineRows = rows.filter(function(r: any) { return r.line === line })
              const bg     = li % 2 === 0 ? "#e8f5e9" : "#fff"
              const bgCurr = li % 2 === 0 ? "#d0ecd3" : "#f1f8f2"
              return lineRows.map(function(row: any, ri: number) {
                return (
                  <tr key={String(li) + "-" + String(ri)}>
                    <td style={stickyCell(0, bg, { textAlign:"left", minWidth:46 })}>
                      {ri===0 && <strong style={{ color:C.gdark }}>{row.line}</strong>}
                    </td>
                    <td style={stickyCell(46, bg, { textAlign:"left", minWidth:74 })}>{row.spo}</td>
                    <td style={stickyCell(120, bg, { textAlign:"left", minWidth:172, maxWidth:172, overflow:"hidden", textOverflow:"ellipsis" })} title={row.style}>{row.style}</td>
                    <td style={stickyCell(292, bg, { textAlign:"left", minWidth:112, fontStyle:"italic", color:C.tx3 })}>{row.note || "--"}</td>
                    <td style={Object.assign(stickyCell(404, bg, {}), { borderRight:"2px solid #c8e6c9", textAlign:"center", minWidth:88 })}>
                      {!row.priority
                        ? <span style={{ color:"#9e9e9e" }}>--</span>
                        : (row.priority.toLowerCase()==="ka" || row.priority.toLowerCase()==="ki")
                          ? <span style={{ background:C.rdp, color:C.red, fontSize:9, padding:"1px 6px", borderRadius:8, fontWeight:500 }}>{row.priority}</span>
                          : row.priority.toLowerCase()==="lad"
                            ? <span style={{ background:C.blp, color:C.blue, fontSize:9, padding:"1px 6px", borderRadius:8, fontWeight:500 }}>Lad</span>
                            : <span style={{ fontSize:10, color:C.tx2 }}>{row.priority}</span>
                      }
                    </td>
                    {dates.map(function(d: string) {
                      const val    = row.dates[d]
                      const cellBg = currWeekDates.has(d) ? bgCurr : bg
                      return (
                        <td key={d} style={{ padding:"5px 8px", borderBottom:"0.5px solid #e0ece0", borderRight:"0.5px solid rgba(180,220,180,.35)", background:cellBg, textAlign:"center", whiteSpace:"nowrap", fontSize:10 }}>
                          {val === "F"
                            ? <span style={{ color:C.red, fontWeight:700 }}>F</span>
                            : (val !== "" && val !== undefined && val !== null)
                              ? <span style={{ color:C.gdark, fontWeight:500 }}>{Number(val).toLocaleString("id-ID")}</span>
                              : null
                          }
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop:8, fontSize:9, color:C.tx3, display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#e8f5e9", border:"0.5px solid #a5d6a7", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Line ganjil</span>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#fff", border:"0.5px solid #ddd", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Line genap</span>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#d0ecd3", border:"0.5px solid #a5d6a7", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Minggu ini</span>
        <span style={{ color:C.red, fontWeight:700 }}>F</span>
        <span>= Akhir planning SPO</span>
        <span style={{ marginLeft:"auto" }}>Scroll kanan untuk lihat semua tanggal</span>
      </div>
    </div>
  )
}

// -- Main component -----------------------------------------------
export default function DashboardPage() {
  const router = useRouter()
  const [page,       setPage]       = useState<Page>("vis")
  const [user,       setUser]       = useState<User|null>(null)
  const [perms,      setPerms]      = useState<Perms>({ canRefreshAI:false, canChat:false, canBalancing:false, canToggleAI:false, canTodo:false })
  const [kpi,        setKpi]        = useState<any>({})
  const [cache,      setCache]      = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [todos,      setTodos]      = useState<Todo[]>([])
  const [newTodo,    setNewTodo]    = useState("")
  const [showAddTodo,setShowAddTodo]= useState(false)
  const [planData,   setPlanData]   = useState<any>(null)
  const [planFactory,setPlanFactory]= useState("A")
  const [planLoading,setPlanLoading]= useState(false)
  const [aiMsgs,     setAiMsgs]    = useState<Msg[]>([{ role:"assistant", content:"Halo! Saya AI Planning Assistant PT Adira Semesta Industry.\n\nSaya terhubung ke Data_Plan_DST, Data Export, dan SPO Stock. Tanya apa saja tentang planning, SPO, material, atau kapasitas." }])
  const [aiInput,    setAiInput]   = useState("")
  const [aiTyping,   setAiTyping]  = useState(false)
  const [balMsgs,    setBalMsgs]   = useState<Msg[]>([{ role:"assistant", content:"Halo! Isi form order baru di atas lalu klik Analisis -- atau langsung ceritakan kebutuhan balancing di sini." }])
  const [balInput,   setBalInput]  = useState("")
  const [balTyping,  setBalTyping] = useState(false)
  const [bStyle,     setBStyle]    = useState("")
  const [bJenis,     setBJenis]    = useState("")
  const [bQty,       setBQty]      = useState("")
  const [bDate,      setBDate]     = useState("")
  const [bAnalyzing, setBAnalyzing]= useState(false)
  const [simD,  setSimD]  = useState(10)
  const [simE,  setSimE]  = useState(8)
  const [simOT, setSimOT] = useState(2)
  const [simL,  setSimL]  = useState(1)
  const [clock, setClock] = useState("")
  const aiBottom  = useRef<HTMLDivElement>(null)
  const balBottom = useRef<HTMLDivElement>(null)

  useEffect(function() {
    function tick() { setClock(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}) + " WIB") }
    tick()
    const id = setInterval(tick, 10000)
    return function() { clearInterval(id) }
  }, [])

  useEffect(function() {
    fetch("/api/auth/me").then(function(r) { return r.json() }).then(function(d) {
      if (!d.authenticated) { router.push("/login"); return }
      setUser(d.user); setPerms(d.permissions)
    }).catch(function() { router.push("/login") })
  }, [router])

  useEffect(function() {
    fetch("/api/dashboard").then(function(r) { return r.json() }).then(function(d) {
      const _cache = d._cache
      const rest = Object.assign({}, d)
      delete rest._cache
      setKpi(rest); setCache(_cache)
    }).catch(function() {})
    fetch("/api/todo").then(function(r) { return r.json() }).then(function(d) { setTodos(d.items ?? []) }).catch(function() {})
  }, [])

  useEffect(function() {
    if (page !== "plan" || planData) return
    setPlanLoading(true)
    fetch("/api/planning")
      .then(function(r) { return r.json() })
      .then(function(d) { if (d.ok) setPlanData(d.data) })
      .catch(function() {})
      .finally(function() { setPlanLoading(false) })
  }, [page, planData])

  useEffect(function() { aiBottom.current?.scrollIntoView({ behavior:"smooth" }) }, [aiMsgs, aiTyping])
  useEffect(function() { balBottom.current?.scrollIntoView({ behavior:"smooth" }) }, [balMsgs, balTyping])

  async function handleRefresh() {
    if (refreshing || !perms.canRefreshAI) return
    setRefreshing(true)
    try {
      const r = await fetch("/api/dashboard?refresh=1")
      const ct = r.headers.get("content-type") ?? ""
      if (!ct.includes("application/json")) {
        const txt = await r.text()
        alert("Server error:\n" + txt.slice(0, 200))
        return
      }
      const d = await r.json()
      if (d.error) { alert(d.hint ? d.error + "\nHint: " + d.hint : d.error); return }
      const _cache = d._cache
      const rest = Object.assign({}, d)
      delete rest._cache
      setKpi(rest); setCache(_cache)
      setPlanData(null)
      if (d.todo_ai && d.todo_ai.length > 0) {
        await fetch("/api/todo", { method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ action:"sync_ai", items:d.todo_ai }) })
        const td = await fetch("/api/todo").then(function(r) { return r.json() })
        setTodos(td.items ?? [])
      }
    } catch(err: any) {
      alert("Gagal refresh: " + (err?.message ?? "Network error"))
    } finally {
      setRefreshing(false)
    }
  }

  async function handleToggleTodo(id: string) {
    if (!perms.canTodo) return
    await fetch("/api/todo", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"toggle", id }) })
    const d = await fetch("/api/todo").then(function(r) { return r.json() })
    setTodos(d.items ?? [])
  }

  async function handleAddTodo() {
    if (!newTodo.trim() || !perms.canTodo) return
    await fetch("/api/todo", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"add", text:newTodo.trim(), priority:"normal" }) })
    const d = await fetch("/api/todo").then(function(r) { return r.json() })
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
      const reader = r.body!.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream:true })
        setAiMsgs([...next, { role:"assistant", content:buf }])
      }
    } catch {
      setAiMsgs([...next, { role:"assistant", content:"Gagal terhubung ke AI." }])
    } finally {
      setAiTyping(false)
    }
  }

  async function sendBalancing(text?: string, isAnalysis?: boolean) {
    const msg = (text ?? balInput).trim()
    if (!msg || balTyping) return
    setBalInput("")
    const orderCtx = isAnalysis && bStyle ? { style:bStyle, jenis:bJenis, qty:bQty, fProd:bDate } : undefined
    const next: Msg[] = [...balMsgs, { role:"user", content:msg }]
    setBalMsgs(next); setBalTyping(true)
    try {
      const r = await fetch("/api/balancing", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ message:msg, history:balMsgs, orderContext:orderCtx }) })
      const reader = r.body!.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream:true })
        setBalMsgs([...next, { role:"assistant", content:buf }])
      }
    } catch {
      setBalMsgs([...next, { role:"assistant", content:"Gagal terhubung ke AI." }])
    } finally {
      setBalTyping(false)
    }
  }

  async function runAnalysis() {
    if (!bStyle || !bJenis || !bQty || !bDate) { alert("Lengkapi semua field"); return }
    setBAnalyzing(true)
    const prompt = "Analisis ketersediaan line untuk order baru:\n" +
      "- Style: " + bStyle + "\n" +
      "- Jenis Style: " + bJenis + "\n" +
      "- Qty: " + parseInt(bQty).toLocaleString() + " pcs\n" +
      "- Rencana F. Prod: " + bDate + "\n\n" +
      "Rekomendasikan opsi balancing terbaik mempertimbangkan tanggal RENCANA F. PROD di Data_Plan_DST."
    await sendBalancing(prompt, true)
    setBAnalyzing(false)
  }

  function goChat(msg: string) { setPage("ai"); setTimeout(function() { sendAI(msg) }, 200) }

  const rl = user ? ROLE_META[user.role] : ROLE_META.viewer

  if (!user) {
    return <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui", color:C.tx3 }}>Memuat...</div>
  }

  const tabStyle = function(p: Page) {
    const active = page === p
    return {
      padding:"9px 14px", fontSize:11, cursor:"pointer",
      display:"flex", alignItems:"center", gap:5,
      color: active ? "#fff" : "#a5d6a7",
      fontWeight: active ? 500 : 400,
      background:"transparent",
      border:"none",
      borderBottom: active ? "3px solid #4caf50" : "3px solid transparent",
      transition:"all .15s",
    }
  }

  const msgBubble = function(r: string) {
    const isUser = r === "user"
    return {
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth:"90%",
      background: isUser ? "#e8f5e9" : "#fff",
      border: isUser ? "0.5px solid #a5d6a7" : "0.5px solid #c8e6c9",
      borderRadius: isUser ? "10px 10px 4px 10px" : "10px 10px 10px 4px",
      padding:"9px 12px", fontSize:11,
      color: isUser ? C.gdark : C.txt,
      lineHeight:1.65, whiteSpace:"pre-wrap",
    }
  }

  const TodoList = function() {
    return (
      <div>
        {todos.length === 0 && (
          <div style={{ fontSize:11, color:C.tx3, textAlign:"center", padding:"12px 0" }}>
            {perms.canRefreshAI ? "Klik Refresh Analisis AI untuk generate to-do." : "Menunggu Admin generate to-do pagi ini."}
          </div>
        )}
        {todos.map(function(t) {
          return (
            <div key={t.id} onClick={function() { handleToggleTodo(t.id) }}
              style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"7px 9px", borderRadius:7, marginBottom:5, border:"0.5px solid #c8e6c9", background:t.done?"#f1f8f2":"#fff", cursor:perms.canTodo?"pointer":"default", opacity:t.done?0.65:1 }}>
              <div style={{ width:17, height:17, borderRadius:4, border:"1.5px solid " + C.gmid, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, background:t.done?C.gmid:"transparent" }}>
                {t.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div style={{ flex:1, fontSize:11, color:C.txt, lineHeight:1.5, textDecoration:t.done?"line-through":"none", opacity:t.done?0.6:1 }}>{t.text}</div>
              <span style={{ fontSize:9, padding:"1px 6px", borderRadius:8, fontWeight:500, flexShrink:0,
                background:t.source==="ai"?C.tlp:t.priority==="urgent"?C.rdp:C.gpale,
                color:t.source==="ai"?C.teal:t.priority==="urgent"?C.red:C.tx3 }}>
                {t.source==="ai" ? "AI" : t.priority==="urgent" ? "Urgent" : "Manual"}
              </span>
            </div>
          )
        })}
        {perms.canTodo && (
          showAddTodo
            ? (
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                <input value={newTodo} onChange={function(e) { setNewTodo(e.target.value) }}
                  onKeyDown={function(e) { if (e.key==="Enter") handleAddTodo() }}
                  placeholder="Ketik to-do baru..." autoFocus
                  style={{ flex:1, padding:"6px 9px", borderRadius:7, border:"0.5px solid #c8e6c9", fontSize:11, outline:"none", fontFamily:"system-ui" }}/>
                <button onClick={handleAddTodo} style={{ padding:"6px 12px", borderRadius:7, border:"none", background:C.gmid, color:"#fff", fontSize:10, cursor:"pointer" }}>Tambah</button>
                <button onClick={function() { setShowAddTodo(false) }} style={{ padding:"6px 10px", borderRadius:7, border:"0.5px solid #c8e6c9", background:"#fff", fontSize:10, cursor:"pointer", color:C.tx3 }}>Batal</button>
              </div>
            )
            : (
              <div onClick={function() { setShowAddTodo(true) }} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 9px", borderRadius:7, border:"0.5px dashed #c8e6c9", color:C.tx3, fontSize:11, cursor:"pointer", marginTop:6 }}>
                + Tambah to-do manual
              </div>
            )
        )}
      </div>
    )
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"system-ui,sans-serif", background:C.bg }}>

      {/* Header */}
      <div style={{ background:C.gdark, padding:"0 16px", display:"flex", alignItems:"center", gap:10, height:48, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, padding:3, boxShadow:"0 1px 6px rgba(0,0,0,.15)" }}>
            <Image src="/Logo.svg" alt="Logo" width={30} height={30} style={{ objectFit:"contain" }} priority/>
          </div>
          <div>
            <div style={{ color:"#fff", fontSize:14, fontWeight:600, lineHeight:1.2 }}>Production Planning</div>
            <div style={{ color:"#a5d6a7", fontSize:10, lineHeight:1.2, marginTop:1 }}>PT. Adira Semesta Industry</div>
          </div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ background:C.glight, color:"#fff", fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:500 }}>Live</span>
          <span style={{ color:"#a5d6a7", fontSize:10 }}>{clock}</span>
          {cache?.has_cache && <span style={{ fontSize:10, color:"#a5d6a7" }}>Update: {cache.age_label} oleh {cache.cached_by}</span>}
          {perms.canRefreshAI && (
            <button onClick={handleRefresh} disabled={refreshing}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 14px", borderRadius:6, border:"none", color:"#fff", fontSize:11, fontWeight:500, cursor:refreshing?"not-allowed":"pointer", background:refreshing?"#388e3c":C.glight }}>
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
          <button onClick={async function() { await fetch("/api/auth/logout",{method:"POST"}); router.push("/login") }}
            style={{ background:"transparent", border:"none", cursor:"pointer", color:"#a5d6a7", fontSize:11 }}>
            Keluar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:C.gdark, padding:"0 16px", display:"flex", borderTop:"1px solid rgba(255,255,255,.12)", flexShrink:0 }}>
        {([
          ["vis","Dashboard Planning"],
          ["plan","Planning"],
          ["sim","Planning Simulation"],
          ["ai","AI Planning Assistant"],
        ] as [Page,string][]).map(function([p,label]) {
          return (
            <button key={p} onClick={function() { setPage(p) }} style={tabStyle(p)}>
              {label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>

        {/* == DASHBOARD PLANNING == */}
        {page==="vis" && (
          <div>
            <div style={{ padding:"10px 0", borderBottom:"0.5px solid #c8e6c9", display:"flex", alignItems:"center", gap:10, marginBottom:0, flexShrink:0 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.gdark }}>Dashboard Planning</span>
              <span style={{ fontSize:10, background:C.blp, color:C.blue, padding:"2px 8px", borderRadius:10, fontWeight:500 }}>Looker Studio</span>
              <span style={{ fontSize:10, color:C.tx3, marginLeft:"auto" }}>Data dari Google Sheets - 0 token</span>
              <a href={LOOKER_FULL} target="_blank" rel="noreferrer"
                style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"0.5px solid #c8e6c9", background:C.bg, color:C.tx2, textDecoration:"none", fontSize:11 }}>
                Buka fullscreen
              </a>
            </div>
            <iframe src={LOOKER_EMBED} width="100%" height="480" style={{ border:"none", display:"block" }} allowFullScreen title="Dashboard Planning"/>

            <div style={{ marginTop:14, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {/* Todo */}
              <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden" }}>
                <div style={{ background:C.gdark, padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ color:"#fff", fontSize:11, fontWeight:500 }}>Plan to-do hari ini</span>
                  <span style={{ color:"#a5d6a7", fontSize:9, marginLeft:"auto" }}>{new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</span>
                </div>
                <div style={{ padding:"10px 12px" }}>
                  <TodoList/>
                </div>
              </div>
              {/* KPI */}
              <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden" }}>
                <div style={{ background:C.gdark, padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ color:"#fff", fontSize:11, fontWeight:500 }}>Status analisis AI</span>
                </div>
                <div style={{ padding:"12px 14px" }}>
                  {cache?.has_cache ? (
                    <div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                        {[
                          { label:"KPI Score",       val:kpi.kpi_score       ? kpi.kpi_score+"%"       : "--", color:C.teal },
                          { label:"Scorecard",        val:kpi.scorecard_score ? kpi.scorecard_score+"%"  : "--", color:C.gdark },
                          { label:"Outstanding SPO",  val:kpi.outstanding_spo_pcs ? Number(kpi.outstanding_spo_pcs).toLocaleString("id-ID")+" pcs" : "--", color:C.org },
                          { label:"WIP > 1 Minggu",   val:kpi.wip_over_1week_pcs  ? Number(kpi.wip_over_1week_pcs).toLocaleString("id-ID")+" pcs"  : "--", color:C.red },
                        ].map(function(k) {
                          return (
                            <div key={k.label} style={{ background:C.bg, borderRadius:6, padding:"8px 10px" }}>
                              <div style={{ fontSize:9, color:C.tx3, marginBottom:2 }}>{k.label}</div>
                              <div style={{ fontSize:14, fontWeight:500, color:k.color }}>{k.val}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize:10, color:C.tx3, background:C.bg, borderRadius:6, padding:"7px 10px" }}>
                        <div>Update: <strong style={{ color:C.gdark }}>{cache.cached_at}</strong> - oleh <strong style={{ color:C.gdark }}>{cache.cached_by}</strong></div>
                        {kpi.planning_risk_level && (
                          <div style={{ marginTop:5, display:"flex", alignItems:"center", gap:5 }}>
                            Risk level:
                            <span style={{ fontSize:9, padding:"1px 8px", borderRadius:8, fontWeight:500,
                              background:kpi.planning_risk_level==="TINGGI"?C.rdp:kpi.planning_risk_level==="SEDANG"?C.orp:C.gpale,
                              color:kpi.planning_risk_level==="TINGGI"?C.red:kpi.planning_risk_level==="SEDANG"?C.org:C.gdark
                            }}>{kpi.planning_risk_level}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize:11, color:C.tx3, textAlign:"center", padding:"20px 0" }}>
                      {perms.canRefreshAI ? "Klik Refresh Analisis AI untuk generate analisis." : "Menunggu Admin melakukan refresh pagi ini."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* == PLANNING == */}
        {page==="plan" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".05em", textTransform:"uppercase" }}>Planning - Data_Plan_DST</span>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {planData?.factories?.map(function(f: string) {
                  return (
                    <button key={f} onClick={function() { setPlanFactory(f) }}
                      style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9",
                        background:planFactory===f?C.gdark:"#fff",
                        color:planFactory===f?"#fff":C.tx2, cursor:"pointer" }}>
                      Factory {f}
                    </button>
                  )
                })}
                {planData && <span style={{ fontSize:9, color:C.tx3, marginLeft:4 }}>Update: {planData.cached_at}</span>}
              </div>
            </div>
            <PlanningTable planLoading={planLoading} planData={planData} planFactory={planFactory}/>
          </div>
        )}

        {/* == PLANNING SIMULATION == */}
        {page==="sim" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
              {[
                { title:"Dampak perubahan demand",            color:C.gdark, val:simD,  setVal:setSimD,  min:-30, max:50, unit:"%",    prompt:"Simulasikan dampak demand berubah " + (simD>=0?"+":"") + simD + "% dari kondisi saat ini" },
                { title:"Dampak kenaikan efisiensi",          color:C.teal,  val:simE,  setVal:setSimE,  min:1,   max:25, unit:"%",    prompt:"Simulasikan efisiensi semua line naik " + simE + "%" },
                { title:"Dampak overtime",                    color:C.org,   val:simOT, setVal:setSimOT, min:0,   max:3,  unit:" jam", prompt:"Simulasikan overtime " + simOT + " jam/hari sesuai UU Ketenagakerjaan No.13/2003" },
                { title:"Dampak penambahan/pengurangan line", color:C.red,   val:simL,  setVal:setSimL,  min:-3,  max:5,  unit:"",     prompt:"Simulasikan perubahan " + (simL>=0?"+":"") + simL + " line produksi" },
              ].map(function(s) {
                return (
                  <div key={s.title} style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, padding:"12px 13px" }}>
                    <div style={{ fontSize:11, fontWeight:500, marginBottom:9, color:s.color }}>{s.title}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:10 }}>
                      <span style={{ color:C.tx2 }}>Nilai</span>
                      <span style={{ fontWeight:500, color:s.color }}>{s.val >= 0 && s.unit !== " jam" ? "+" : ""}{s.val}{s.unit}</span>
                    </div>
                    <input type="range" min={s.min} max={s.max} value={s.val} step={1}
                      onChange={function(e) { s.setVal(Number(e.target.value)) }}
                      style={{ width:"100%", marginBottom:6 }}/>
                    {s.unit === " jam" && <div style={{ fontSize:9, color:C.tx3, marginBottom:6 }}>Maks 3 jam sesuai UU Ketenagakerjaan No.13/2003</div>}
                    <button onClick={function() { goChat(s.prompt) }}
                      style={{ width:"100%", padding:"7px", borderRadius:7, border:"none", background:s.color, color:"#fff", fontSize:10, fontWeight:500, cursor:"pointer" }}>
                      Jalankan simulasi
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Balancing DST */}
            <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden", marginBottom:12 }}>
              <div style={{ background:C.gdark, padding:"8px 12px" }}>
                <span style={{ color:"#fff", fontSize:11, fontWeight:500 }}>Balancing Planning DST</span>
                <span style={{ color:"#a5d6a7", fontSize:9, marginLeft:8 }}>Data_Plan_DST (cache)</span>
              </div>
              <div style={{ padding:"11px 12px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                  {[
                    { label:"Style",           el:<input type="text" value={bStyle} onChange={function(e) { setBStyle(e.target.value) }} placeholder="Tour Authentic 2025 Men" style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11, fontFamily:"system-ui" }}/> },
                    { label:"Jenis Style",     el:<select value={bJenis} onChange={function(e) { setBJenis(e.target.value) }} style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11 }}><option value="">Pilih...</option><option>Full Pola</option><option>Synth</option><option>Patch + IJ</option></select> },
                    { label:"Qty (pcs)",       el:<input type="number" value={bQty} onChange={function(e) { setBQty(e.target.value) }} placeholder="200000" style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11, fontFamily:"system-ui" }}/> },
                    { label:"Rencana F. Prod", el:<input type="date" value={bDate} onChange={function(e) { setBDate(e.target.value) }} style={{ width:"100%", padding:"7px 9px", borderRadius:6, border:"0.5px solid #c8e6c9", fontSize:11, fontFamily:"system-ui" }}/> },
                  ].map(function(field) {
                    return (
                      <div key={field.label} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                        <label style={{ fontSize:10, fontWeight:500, color:C.tx3 }}>{field.label}</label>
                        {field.el}
                      </div>
                    )
                  })}
                </div>
                <button onClick={runAnalysis} disabled={bAnalyzing || !perms.canBalancing}
                  style={{ width:"100%", padding:"8px", borderRadius:7, border:"none",
                    background:!perms.canBalancing?"#e5e5e5":bAnalyzing?"#388e3c":C.gmid,
                    color:!perms.canBalancing?"#aaa":"#fff", fontSize:11, fontWeight:500,
                    cursor:!perms.canBalancing?"not-allowed":"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                  {!perms.canBalancing ? "Hanya Admin / Tim Planning" : bAnalyzing ? "Menganalisis..." : "Analisis ketersediaan & rekomendasi balancing"}
                </button>
              </div>
            </div>

            {/* Chat balancing */}
            <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:12 }}>
              <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden" }}>
                <div style={{ background:C.gdark, padding:"8px 12px" }}>
                  <span style={{ color:"#fff", fontSize:10, fontWeight:500 }}>Status Line</span>
                </div>
                <div style={{ padding:"8px", fontSize:10, color:C.tx3, textAlign:"center", paddingTop:12 }}>
                  Data line tersedia setelah refresh AI
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column" }}>
                <div style={{ height:260, overflowY:"auto", display:"flex", flexDirection:"column", gap:7, padding:9, background:C.bg, borderRadius:"7px 7px 0 0", border:"0.5px solid #c8e6c9", borderBottom:"none" }}>
                  {balMsgs.map(function(m, i) {
                    return (
                      <div key={i} style={msgBubble(m.role)}>
                        {m.content}
                      </div>
                    )
                  })}
                  {balTyping && (
                    <div style={{ alignSelf:"flex-start", fontSize:10, color:C.tx3 }}>AI menganalisis...</div>
                  )}
                  <div ref={balBottom}/>
                </div>
                <div style={{ border:"0.5px solid #c8e6c9", borderTop:"none", borderRadius:"0 0 7px 7px", background:"#fff", padding:"7px 9px", display:"flex", gap:6 }}>
                  <input value={balInput} onChange={function(e) { setBalInput(e.target.value) }}
                    onKeyDown={function(e) { if (e.key==="Enter") sendBalancing() }}
                    placeholder="Tanya lanjutan: jadwal detail, risiko material..."
                    style={{ flex:1, border:"none", outline:"none", fontSize:11, fontFamily:"system-ui", background:"transparent" }}/>
                  <button onClick={function() { sendBalancing() }} disabled={balTyping || !balInput.trim() || !perms.canBalancing}
                    style={{ padding:"5px 12px", borderRadius:6, border:"none", background:balTyping||!balInput.trim()||!perms.canBalancing?"#e5e5e5":C.gmid, color:balTyping||!balInput.trim()||!perms.canBalancing?"#aaa":"#fff", fontSize:10, cursor:"pointer" }}>
                    Kirim
                  </button>
                </div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:6 }}>
                  {["Geser F.Prod 1 minggu","Detail jadwal per line","Cek risiko material","Line alternatif factory lain"].map(function(q) {
                    return (
                      <div key={q} onClick={function() { setBalInput(q); setTimeout(function() { sendBalancing(q) }, 100) }}
                        style={{ fontSize:9, padding:"2px 8px", borderRadius:10, border:"0.5px solid #c8e6c9", background:"#fff", cursor:"pointer", color:C.tx2 }}>
                        {q}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* == AI PLANNING ASSISTANT == */}
        {page==="ai" && (
          <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 100px)" }}>
            <div style={{ fontSize:10, color:C.tx3, marginBottom:6 }}>
              Login sebagai: <strong style={{ color:C.gdark }}>{user.name}</strong> - {rl.label}
              {!perms.canChat && <span style={{ marginLeft:8, color:C.red }}>Chat tidak tersedia untuk role Viewer</span>}
            </div>
            {!perms.canChat ? (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}>
                <div style={{ fontSize:13, fontWeight:500, color:"#555" }}>Chat AI tidak tersedia</div>
                <div style={{ fontSize:12, color:C.tx3, textAlign:"center", lineHeight:1.7 }}>Role <strong>Viewer</strong> hanya bisa melihat dashboard.<br/>Login sebagai Analyst atau Planning untuk akses chat.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", flex:1 }}>
                <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:9 }}>
                  {aiMsgs.map(function(m, i) {
                    return (
                      <div key={i} style={msgBubble(m.role)}>
                        {m.content}{aiTyping && i===aiMsgs.length-1 && m.role==="assistant" ? "|" : ""}
                      </div>
                    )
                  })}
                  {aiTyping && aiMsgs[aiMsgs.length-1]?.role!=="assistant" && (
                    <div style={{ alignSelf:"flex-start", fontSize:12, color:C.tx3 }}>AI menganalisis data spreadsheet...</div>
                  )}
                  <div ref={aiBottom}/>
                </div>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap", margin:"8px 0" }}>
                  {["Status produksi hari ini","SPO paling berisiko terlambat","Balancing line optimal?","Risiko material minggu depan","Executive summary kapasitas"].map(function(q) {
                    return (
                      <div key={q} onClick={function() { sendAI(q) }}
                        style={{ fontSize:10, padding:"3px 9px", borderRadius:20, border:"0.5px solid #c8e6c9", background:"#fff", cursor:"pointer", color:C.tx2 }}>
                        {q}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:"flex" }}>
                  <input value={aiInput} onChange={function(e) { setAiInput(e.target.value) }}
                    onKeyDown={function(e) { if (e.key==="Enter") sendAI() }}
                    placeholder="Tanya tentang planning, SPO, material, kapasitas..."
                    style={{ flex:1, padding:"9px 12px", borderRadius:"8px 0 0 8px", fontSize:12, border:"0.5px solid #c8e6c9", background:C.bg, outline:"none", fontFamily:"system-ui" }}/>
                  <button onClick={function() { sendAI() }} disabled={aiTyping || !aiInput.trim()}
                    style={{ padding:"9px 16px", borderRadius:"0 8px 8px 0", border:"none", background:aiTyping||!aiInput.trim()?"#e5e5e5":C.gmid, color:aiTyping||!aiInput.trim()?"#aaa":"#fff", fontSize:12, fontWeight:500, cursor:"pointer" }}>
                    {aiTyping ? "..." : "Kirim"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
