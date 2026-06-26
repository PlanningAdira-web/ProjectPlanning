"use client"
import { useEffect, useRef, useState } from "react"

type Page = "executive" | "simulation" | "forecast" | "charts" | "chat"
type Msg  = { role: "user" | "assistant"; content: string }

// ── ID Report Looker Studio ──────────────────────────────────
const LOOKER_REPORT_ID = "0325a3a3-4db1-4ee2-9728-ea977012e39e"
const LOOKER_EMBED_URL = `https://lookerstudio.google.com/embed/reporting/${LOOKER_REPORT_ID}/page/p_first`
const LOOKER_FULL_URL  = `https://lookerstudio.google.com/reporting/${LOOKER_REPORT_ID}`

const NAV: { id: Page; icon: string; label: string }[] = [
  { id: "executive",  icon: "ti-layout-dashboard", label: "Executive Overview"    },
  { id: "simulation", icon: "ti-adjustments",       label: "Simulation Center"    },
  { id: "forecast",   icon: "ti-trending-up",       label: "Forecast & Strategic" },
  { id: "charts",     icon: "ti-chart-bar",         label: "Visual Charts"        },
  { id: "chat",       icon: "ti-message-2",         label: "AI Planning Assistant"},
]

const QUICK_EXEC = [
  "Berikan executive summary status produksi hari ini",
  "Line mana yang akan miss target minggu ini?",
  "Apa prioritas tindakan yang harus dilakukan hari ini?",
  "Bagaimana status material readiness untuk semua PO aktif?",
]
const QUICK_SIM = [
  "Simulasikan dampak jika demand naik 20% bulan depan",
  "Berapa output tambahan jika overtime 2 jam per hari selama seminggu?",
  "Jika efisiensi line naik 10%, berapa PO yang bisa selesai lebih cepat?",
  "Simulasikan balancing jika satu line ditambahkan untuk PO terbesar",
]
const QUICK_FORE = [
  "Prediksi demand untuk 4 minggu ke depan berdasarkan history",
  "Berapa kapasitas yang dibutuhkan untuk memenuhi forecast?",
  "Material apa yang berisiko tidak tersedia dalam 8 minggu ke depan?",
  "Identifikasi risiko planning paling kritis 12 minggu ke depan",
]

type KPI = {
  overall_capacity_pct?: number; achievement_pct?: number
  material_readiness_pct?: number; lines_at_risk?: number
  top_priority?: string; planning_risk_level?: string
  mp_shortage?: number; schedule_adjustment_needed?: number
  forecast_demand_4w?: number; forecast_capacity_gap?: number
  material_risk_items?: number; risk_score_12w?: string
  sheet_names?: string[]; updated_at?: string
}

function Ring({ pct, color, size = 58 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.38; const circ = 2 * Math.PI * r
  const dash = Math.min(pct, 100) / 100 * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,.07)" strokeWidth={size*0.1}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.1}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={size*0.2} fontWeight="500" fill={color}>
        {pct}%
      </text>
    </svg>
  )
}

function MetricCard({ label, value, sub, color, ring, children }:
  { label:string; value:string; sub?:string; color?:string; ring?:number; children?:React.ReactNode }) {
  return (
    <div style={{ background:"#f7f7f5", borderRadius:10, padding:"13px 15px", display:"flex", gap:10, alignItems:"center" }}>
      {ring !== undefined && <Ring pct={ring} color={color ?? "#2a78d6"}/>}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, color:"#999", marginBottom:3 }}>{label}</div>
        <div style={{ fontSize: ring !== undefined ? 13 : 20, fontWeight:500, color: color ?? "#111", lineHeight:1.2 }}>{value}</div>
        {sub && <div style={{ fontSize:10, color:"#bbb", marginTop:3 }}>{sub}</div>}
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ icon, title, sub }: { icon:string; title:string; sub?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:10, marginTop:18 }}>
      <i className={`ti ${icon}`} style={{ fontSize:14, color:"#999" }}/>
      <span style={{ fontSize:12, fontWeight:600, color:"#111" }}>{title}</span>
      {sub && <span style={{ fontSize:11, color:"#bbb" }}>{sub}</span>}
    </div>
  )
}

function RiskBadge({ level }: { level:string }) {
  const map: Record<string,{bg:string;color:string}> = {
    "TINGGI": {bg:"#fde8e8",color:"#b91c1c"},
    "SEDANG": {bg:"#fef3c7",color:"#92400e"},
    "RENDAH": {bg:"#d1fae5",color:"#065f46"},
  }
  const s = map[level?.toUpperCase()] ?? {bg:"#f3f4f6",color:"#555"}
  return <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:500, background:s.bg, color:s.color }}>{level||"—"}</span>
}

function SimSlider({ label, min, max, defaultVal, unit, onChange }:
  { label:string; min:number; max:number; defaultVal:number; unit:string; onChange:(v:number)=>void }) {
  const [val, setVal] = useState(defaultVal)
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:11, color:"#666" }}>{label}</span>
        <span style={{ fontSize:11, fontWeight:500, color:"#2a78d6" }}>{val}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={val} step="1"
        onChange={e => { const v = Number(e.target.value); setVal(v); onChange(v) }}
        style={{ width:"100%", accentColor:"#2a78d6" }}/>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#bbb" }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [page,    setPage]    = useState<Page>("executive")
  const [kpi,     setKpi]     = useState<KPI>({})
  const [kpiLoad, setKpiLoad] = useState(true)
  const [lookerLoading, setLookerLoading] = useState(true)
  const [msgs,    setMsgs]    = useState<Msg[]>([
    { role:"assistant", content:"Halo! Saya AI Planning Assistant Anda.\n\nSaya terhubung ke spreadsheet dan siap membantu analisis executive, simulasi, dan forecasting. Tab \"Visual Charts\" menampilkan dashboard Looker Studio Anda secara langsung.\n\nApa yang ingin Anda ketahui?" }
  ])
  const [input,  setInput]  = useState("")
  const [typing, setTyping] = useState(false)
  const [clock,  setClock]  = useState("")
  const [demandDelta,  setDemandDelta]  = useState(10)
  const [overtimeHrs,  setOvertimeHrs]  = useState(2)
  const [effGain,      setEffGain]      = useState(5)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})+" WIB")
    tick(); const id = setInterval(tick, 10000); return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => { setKpi(d); setKpiLoad(false) })
      .catch(() => setKpiLoad(false))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  }, [msgs, typing])

  const val = (v: any, suffix = "") =>
    (v !== undefined && v !== null && v !== "") ? `${v}${suffix}` : "—"

  async function sendChat(text?: string, hint?: string) {
    const userText = (text ?? input).trim()
    if (!userText || typing) return
    setInput("")
    const msg = hint ? `[${hint}]\n${userText}` : userText
    const next: Msg[] = [...msgs, { role:"user", content: msg }]
    setMsgs(next); setTyping(true)
    try {
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ message: msg, history: msgs }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder(); let full = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += dec.decode(value, { stream:true })
        setMsgs([...next, { role:"assistant", content:full }])
      }
    } catch {
      setMsgs([...next, { role:"assistant", content:"❌ Gagal terhubung ke AI. Coba lagi." }])
    } finally { setTyping(false) }
  }

  function runSim(prompt: string) { setPage("chat"); setTimeout(() => sendChat(prompt, "Simulation"), 150) }

  const updated = kpi.updated_at
    ? new Date(kpi.updated_at).toLocaleString("id-ID")
    : ""

  const navStyle = (p: Page): React.CSSProperties => ({
    display:"flex", alignItems:"center", gap:9, padding:"9px 16px",
    border:"none", background:"transparent", cursor:"pointer", fontSize:12,
    color: page === p ? "#2a78d6" : "#777",
    borderLeft: `3px solid ${page === p ? "#2a78d6" : "transparent"}`,
    fontWeight: page === p ? 600 : 400, width:"100%", textAlign:"left",
    transition:"all .12s",
  })

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"system-ui,sans-serif", background:"#fff" }}>

      {/* ── Sidebar ── */}
      <nav style={{ width:196, background:"#f7f7f5", borderRight:"0.5px solid rgba(0,0,0,.08)", display:"flex", flexDirection:"column", flexShrink:0 }}>
        <div style={{ padding:"14px 16px", borderBottom:"0.5px solid rgba(0,0,0,.08)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#111" }}>Planning AI</div>
          <div style={{ fontSize:10, color:"#bbb", marginTop:2 }}>
            {kpi.sheet_names?.length ?? 0} sheets · {clock}
          </div>
        </div>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)} style={navStyle(n.id)}>
            <i className={`ti ${n.icon}`} style={{ fontSize:15, flexShrink:0 }}/>
            {n.label}
            {n.id === "charts" && (
              <span style={{ marginLeft:"auto", fontSize:9, background:"#d1fae5", color:"#065f46", padding:"1px 6px", borderRadius:8, fontWeight:500 }}>
                Looker
              </span>
            )}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <div style={{ padding:"12px 16px", borderTop:"0.5px solid rgba(0,0,0,.08)", fontSize:10, color:"#bbb" }}>
          {kpiLoad ? "Memuat data..." : updated ? `Update: ${updated}` : ""}
        </div>
      </nav>

      {/* ── Main ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Topbar */}
        <div style={{ height:48, borderBottom:"0.5px solid rgba(0,0,0,.08)", display:"flex", alignItems:"center", padding:"0 20px", gap:10, flexShrink:0 }}>
          <span style={{ fontSize:14, fontWeight:600 }}>
            {NAV.find(n => n.id === page)?.label}
          </span>
          <span style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background:"#d1fae5", color:"#065f46", fontWeight:500 }}>
            Live
          </span>
          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
            {/* Tombol buka Looker fullscreen */}
            <a href={LOOKER_FULL_URL} target="_blank" rel="noreferrer"
              style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"0.5px solid rgba(0,0,0,.1)", background:"#f7f7f5", color:"#555", textDecoration:"none", fontSize:11 }}>
              <i className="ti ti-chart-bar" style={{ fontSize:13 }}/> Looker ↗
            </a>
            <button onClick={() => window.location.reload()}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"0.5px solid rgba(0,0,0,.1)", background:"#f7f7f5", color:"#555", cursor:"pointer", fontSize:11 }}>
              <i className="ti ti-refresh" style={{ fontSize:13 }}/> Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding: page === "charts" ? 0 : "18px 22px" }}>

          {/* ══ EXECUTIVE ══ */}
          {page === "executive" && (
            <div>
              <SectionTitle icon="ti-chart-pie" title="Kapasitas & pencapaian" sub="real-time dari spreadsheet"/>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10, marginBottom:14 }}>
                <MetricCard label="Overall capacity" value={val(kpi.overall_capacity_pct,"%")} color="#2a78d6" ring={kpi.overall_capacity_pct??0} sub="kapasitas terpakai"/>
                <MetricCard label="Achievement vs plan" value={val(kpi.achievement_pct,"%")} color={Number(kpi.achievement_pct??0)>=90?"#1baf7a":"#e24b4a"} ring={kpi.achievement_pct??0} sub="output aktual vs target"/>
                <MetricCard label="Material readiness" value={val(kpi.material_readiness_pct,"%")} color={Number(kpi.material_readiness_pct??0)>=80?"#1baf7a":"#eda100"} ring={kpi.material_readiness_pct??0} sub="PO material lengkap"/>
                <MetricCard label="Lines at risk" value={val(kpi.lines_at_risk," line")} color="#e24b4a" sub="akan miss target">
                  {Number(kpi.lines_at_risk??0) > 0 && (
                    <div style={{ marginTop:5, fontSize:10, color:"#b91c1c", background:"#fde8e8", padding:"2px 7px", borderRadius:4, display:"inline-block" }}>⚠ Perlu segera</div>
                  )}
                </MetricCard>
              </div>

              <SectionTitle icon="ti-alert-triangle" title="Prioritas & risiko hari ini"/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div style={{ background:"#f7f7f5", borderRadius:10, padding:"13px 15px" }}>
                  <div style={{ fontSize:11, color:"#999", marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                    <i className="ti ti-list-check" style={{ fontSize:12 }}/> Prioritas tindakan hari ini
                  </div>
                  {kpiLoad
                    ? <div style={{ color:"#bbb", fontSize:12 }}>Memuat dari AI...</div>
                    : <div style={{ fontSize:12, color:"#111", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{kpi.top_priority || "—"}</div>
                  }
                </div>
                <div style={{ background:"#f7f7f5", borderRadius:10, padding:"13px 15px" }}>
                  <div style={{ fontSize:11, color:"#999", marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
                    <i className="ti ti-shield-exclamation" style={{ fontSize:12 }}/> Risiko problem planning
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                    <RiskBadge level={kpi.planning_risk_level ?? "—"}/>
                    <span style={{ fontSize:11, color:"#666" }}>level risiko keseluruhan</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                    <div style={{ background:"#fff", borderRadius:8, padding:"8px 10px", border:"0.5px solid rgba(0,0,0,.08)" }}>
                      <div style={{ fontSize:10, color:"#999" }}>Kekurangan MP</div>
                      <div style={{ fontSize:16, fontWeight:500, color:"#e24b4a" }}>{val(kpi.mp_shortage," org")}</div>
                    </div>
                    <div style={{ background:"#fff", borderRadius:8, padding:"8px 10px", border:"0.5px solid rgba(0,0,0,.08)" }}>
                      <div style={{ fontSize:10, color:"#999" }}>Penyesuaian jadwal</div>
                      <div style={{ fontSize:16, fontWeight:500, color:"#eda100" }}>{val(kpi.schedule_adjustment_needed," PO")}</div>
                    </div>
                  </div>
                </div>
              </div>

              <SectionTitle icon="ti-message-circle" title="Tanya AI langsung"/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {QUICK_EXEC.map(q => (
                  <button key={q} onClick={() => { setPage("chat"); setTimeout(() => sendChat(q), 150) }}
                    style={{ textAlign:"left", padding:"10px 13px", borderRadius:8, border:"0.5px solid rgba(0,0,0,.1)", background:"#f7f7f5", cursor:"pointer", fontSize:12, color:"#2a78d6", lineHeight:1.5 }}>
                    <i className="ti ti-arrow-right" style={{ fontSize:12, marginRight:5 }}/>{q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══ SIMULATION ══ */}
          {page === "simulation" && (
            <div>
              <div style={{ background:"#eff6ff", border:"0.5px solid #bfdbfe", borderRadius:10, padding:"11px 15px", marginBottom:14, fontSize:12, color:"#1e40af", display:"flex", gap:8 }}>
                <i className="ti ti-info-circle" style={{ fontSize:14, flexShrink:0, marginTop:1 }}/>
                Atur parameter simulasi lalu klik "Jalankan Simulasi" — Claude menganalisis dampaknya terhadap data spreadsheet Anda.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                {[
                  { title:"Dampak perubahan demand", icon:"ti-trending-up", color:"#2a78d6",
                    content: <SimSlider label="Perubahan demand" min={-30} max={50} defaultVal={demandDelta} unit="%" onChange={setDemandDelta}/>,
                    prompt: `Simulasikan dampak jika demand berubah ${demandDelta>=0?"+":""}${demandDelta}% dari kondisi saat ini.` },
                  { title:"Dampak overtime", icon:"ti-clock", color:"#ba7517",
                    content: <SimSlider label="Jam overtime per hari" min={0} max={4} defaultVal={overtimeHrs} unit=" jam" onChange={setOvertimeHrs}/>,
                    prompt: `Simulasikan dampak overtime ${overtimeHrs} jam per hari selama seminggu ke depan.` },
                  { title:"Dampak kenaikan efisiensi", icon:"ti-rocket", color:"#1baf7a",
                    content: <SimSlider label="Kenaikan efisiensi" min={1} max={25} defaultVal={effGain} unit="%" onChange={setEffGain}/>,
                    prompt: `Simulasikan jika efisiensi semua line naik ${effGain}%.` },
                  { title:"Dampak penambahan line", icon:"ti-layout-grid", color:"#4a3aa7",
                    content: <div style={{ fontSize:11, color:"#666", lineHeight:1.6, marginBottom:10 }}>Simulasi jika kapasitas ditambah dengan membuka line produksi baru terhadap semua PO aktif dan target shipment.</div>,
                    prompt: "Simulasikan dampak penambahan 1 line produksi baru terhadap semua PO aktif." },
                ].map(s => (
                  <div key={s.title} style={{ background:"#f7f7f5", borderRadius:10, padding:"14px 15px" }}>
                    <div style={{ fontSize:12, fontWeight:600, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                      <i className={`ti ${s.icon}`} style={{ color:s.color }}/>
                      {s.title}
                    </div>
                    {s.content}
                    <button onClick={() => runSim(s.prompt)}
                      style={{ width:"100%", padding:"8px", borderRadius:8, border:"none", background:s.color, color:"#fff", cursor:"pointer", fontSize:11, fontWeight:500 }}>
                      Jalankan simulasi →
                    </button>
                  </div>
                ))}
              </div>

              <SectionTitle icon="ti-scale" title="Simulasi balancing planning per order"/>
              <div style={{ background:"#f7f7f5", borderRadius:10, padding:"14px 15px" }}>
                <div style={{ fontSize:11, color:"#666", lineHeight:1.7, marginBottom:10 }}>AI menganalisis distribusi beban kerja antar line dan merekomendasikan balancing optimal berdasarkan data PO, kapasitas, dan deadline.</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => runSim("Lakukan simulasi balancing optimal untuk semua PO aktif di semua line.")}
                    style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:"#2a78d6", color:"#fff", cursor:"pointer", fontSize:11, fontWeight:500 }}>
                    Balancing otomatis (AI) →
                  </button>
                  <button onClick={() => runSim("Identifikasi PO yang overload dan rekomendasikan redistribusinya.")}
                    style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:"#4a3aa7", color:"#fff", cursor:"pointer", fontSize:11, fontWeight:500 }}>
                    Deteksi overload →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ FORECAST ══ */}
          {page === "forecast" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:10, marginBottom:14 }}>
                <MetricCard label="Forecast demand 4 minggu" value={val(kpi.forecast_demand_4w," pcs")} color="#2a78d6" sub="prediksi dari pola history"/>
                <MetricCard label="Gap kapasitas" value={val(kpi.forecast_capacity_gap," pcs")} color={Number(kpi.forecast_capacity_gap??0)>0?"#e24b4a":"#1baf7a"} sub={Number(kpi.forecast_capacity_gap??0)>0?"perlu tambah kapasitas":"kapasitas mencukupi"}/>
                <MetricCard label="Item material berisiko" value={val(kpi.material_risk_items," item")} color="#eda100" sub="perlu monitoring ketat"/>
              </div>

              <SectionTitle icon="ti-calendar-time" title="Risiko 4–12 minggu ke depan"/>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:10, marginBottom:14 }}>
                {[
                  { w:"4 minggu", icon:"ti-alert-circle", bg:"#fde8e8", color:"#b91c1c", border:"#fca5a5", desc:"Risiko jangka pendek",
                    prompt:"Identifikasi dan analisis semua risiko planning untuk 4 minggu ke depan beserta rekomendasi mitigasi." },
                  { w:"8 minggu", icon:"ti-clock-exclamation", bg:"#fef3c7", color:"#92400e", border:"#fcd34d", desc:"Risiko jangka menengah",
                    prompt:"Identifikasi dan analisis semua risiko planning untuk 8 minggu ke depan beserta strategi mitigasinya." },
                  { w:"12 minggu", icon:"ti-radar", bg:"#eff6ff", color:"#1e40af", border:"#93c5fd", desc:"Risiko jangka panjang",
                    prompt:"Identifikasi risiko strategis untuk 12 minggu ke depan dan buat rekomendasi strategi mitigasi komprehensif." },
                ].map(r => (
                  <button key={r.w} onClick={() => { setPage("chat"); setTimeout(() => sendChat(r.prompt), 150) }}
                    style={{ background:r.bg, borderRadius:10, padding:"14px 15px", border:`0.5px solid ${r.border}`, cursor:"pointer", textAlign:"left" }}>
                    <i className={`ti ${r.icon}`} style={{ fontSize:22, color:r.color, display:"block", marginBottom:6 }}/>
                    <div style={{ fontSize:13, fontWeight:600, color:r.color, marginBottom:3 }}>{r.w}</div>
                    <div style={{ fontSize:10, color:r.color, opacity:.8 }}>{r.desc}</div>
                    <div style={{ fontSize:10, color:r.color, marginTop:6, fontWeight:500 }}>Klik untuk analisis AI →</div>
                  </button>
                ))}
              </div>

              <SectionTitle icon="ti-brain" title="Analisis strategis"/>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                {QUICK_FORE.map(q => (
                  <button key={q} onClick={() => { setPage("chat"); setTimeout(() => sendChat(q), 150) }}
                    style={{ textAlign:"left", padding:"10px 13px", borderRadius:8, border:"0.5px solid rgba(0,0,0,.1)", background:"#f7f7f5", cursor:"pointer", fontSize:12, color:"#2a78d6", lineHeight:1.5 }}>
                    <i className="ti ti-arrow-right" style={{ fontSize:12, marginRight:5 }}/>{q}
                  </button>
                ))}
              </div>

              <SectionTitle icon="ti-shield" title="Skor risiko keseluruhan"/>
              <div style={{ background:"#f7f7f5", borderRadius:10, padding:"13px 15px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:11, color:"#999" }}>Risiko 12 minggu:</div>
                <RiskBadge level={kpi.risk_score_12w ?? "—"}/>
                <button onClick={() => { setPage("chat"); setTimeout(() => sendChat("Berikan analisis risiko komprehensif 12 minggu ke depan beserta strategic roadmap mitigasinya."), 150) }}
                  style={{ marginLeft:"auto", padding:"6px 14px", borderRadius:6, border:"none", background:"#2a78d6", color:"#fff", cursor:"pointer", fontSize:11, fontWeight:500 }}>
                  Analisis detail →
                </button>
              </div>
            </div>
          )}

          {/* ══ CHARTS — LOOKER STUDIO EMBED ══ */}
          {page === "charts" && (
            <div style={{ height:"calc(100vh - 48px)", display:"flex", flexDirection:"column" }}>
              {/* Sub-toolbar Looker */}
              <div style={{ padding:"10px 20px", borderBottom:"0.5px solid rgba(0,0,0,.08)", display:"flex", alignItems:"center", gap:10, background:"#fff", flexShrink:0 }}>
                <i className="ti ti-chart-bar" style={{ fontSize:16, color:"#2a78d6" }}/>
                <span style={{ fontSize:13, fontWeight:500, color:"#111" }}>Planning Production</span>
                <span style={{ fontSize:10, background:"#eff6ff", color:"#1e40af", padding:"2px 8px", borderRadius:10, fontWeight:500 }}>Looker Studio</span>
                <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
                  <span style={{ fontSize:11, color:"#bbb" }}>Data dari Google Sheets yang sama</span>
                  <a href={LOOKER_FULL_URL} target="_blank" rel="noreferrer"
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"0.5px solid rgba(0,0,0,.1)", background:"#f7f7f5", color:"#555", textDecoration:"none", fontSize:11 }}>
                    <i className="ti ti-external-link" style={{ fontSize:12 }}/> Buka fullscreen
                  </a>
                </div>
              </div>

              {/* Loading state */}
              {lookerLoading && (
                <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center", color:"#bbb", fontSize:12 }}>
                  <i className="ti ti-loader" style={{ fontSize:24, display:"block", marginBottom:8 }}/>
                  Memuat Looker Studio...
                </div>
              )}

              {/* Iframe Looker */}
              <iframe
                src={LOOKER_EMBED_URL}
                width="100%"
                height="100%"
                style={{ border:"none", flex:1 }}
                allowFullScreen
                onLoad={() => setLookerLoading(false)}
                title="Planning Production — Looker Studio"
              />
            </div>
          )}

          {/* ══ CHAT ══ */}
          {page === "chat" && (
            <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 90px)" }}>
              <div style={{ fontSize:10, color:"#bbb", marginBottom:8 }}>
                Terhubung ke: {kpi.sheet_names?.join(", ") || "memuat..."}
              </div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
                <span style={{ fontSize:10, color:"#bbb", alignSelf:"center" }}>Cepat:</span>
                {[...QUICK_EXEC.slice(0,2), ...QUICK_SIM.slice(0,1), ...QUICK_FORE.slice(0,1)].map(q => (
                  <button key={q} onClick={() => sendChat(q)}
                    style={{ fontSize:10, padding:"3px 9px", borderRadius:20, border:"0.5px solid rgba(0,0,0,.1)", background:"#f7f7f5", color:"#666", cursor:"pointer", whiteSpace:"nowrap" }}>
                    {q.length > 38 ? q.slice(0,38)+"..." : q}
                  </button>
                ))}
              </div>
              <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingRight:2 }}>
                {msgs.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth:"88%",
                    background: m.role === "user" ? "rgba(42,120,214,.1)" : "#f7f7f5",
                    border:`0.5px solid ${m.role==="user"?"rgba(42,120,214,.25)":"rgba(0,0,0,.08)"}`,
                    borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                    padding:"10px 13px", fontSize:13,
                    color: m.role === "user" ? "#1e40af" : "#111",
                    lineHeight:1.65, whiteSpace:"pre-wrap",
                  }}>
                    {m.content}
                    {typing && i === msgs.length-1 && m.role === "assistant" ? "▍" : ""}
                  </div>
                ))}
                {typing && msgs[msgs.length-1]?.role !== "assistant" && (
                  <div style={{ alignSelf:"flex-start", fontSize:12, color:"#bbb", display:"flex", alignItems:"center", gap:6 }}>
                    <span>AI sedang menganalisis</span>
                    <span style={{ display:"flex", gap:3 }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{ width:4, height:4, borderRadius:"50%", background:"#bbb", display:"inline-block", animation:`pulse 1s ${i*.2}s infinite` }}/>
                      ))}
                    </span>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
              <div style={{ display:"flex", gap:8, marginTop:10 }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                  placeholder="Tanya kapasitas, risiko, forecast, atau minta simulasi..."
                  disabled={typing}
                  style={{ flex:1, padding:"10px 13px", borderRadius:10, fontSize:13, border:"0.5px solid rgba(0,0,0,.15)", background:"#f7f7f5" }}/>
                <button onClick={() => sendChat()} disabled={typing || !input.trim()}
                  style={{ padding:"10px 18px", borderRadius:10, fontSize:13, border:"none", background: typing||!input.trim() ? "#e5e5e5":"#2a78d6", color:typing||!input.trim()?"#aaa":"#fff", cursor:typing||!input.trim()?"not-allowed":"pointer", fontWeight:500 }}>
                  {typing ? "..." : "Kirim"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </div>
  )
}
