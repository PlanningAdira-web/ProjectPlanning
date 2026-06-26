"use client"
import { useEffect, useRef, useState } from "react"

type Page = "executive" | "simulation" | "forecast" | "chat"
type Msg  = { role: "user" | "assistant"; content: string }

const NAV: { id: Page; icon: string; label: string; short: string }[] = [
  { id: "executive",  icon: "ti-layout-dashboard", label: "Executive Overview",         short: "Executive"   },
  { id: "simulation", icon: "ti-adjustments",       label: "Simulation Center",          short: "Simulation"  },
  { id: "forecast",   icon: "ti-trending-up",       label: "Forecast & Strategic",       short: "Forecast"    },
  { id: "chat",       icon: "ti-message-2",         label: "AI Planning Assistant",      short: "AI Chat"     },
]

const QUICK_EXEC = [
  "Berikan executive summary status produksi hari ini",
  "Line mana yang akan miss target minggu ini dan apa penyebab utamanya?",
  "Apa prioritas tindakan yang harus dilakukan hari ini?",
  "Bagaimana status material readiness untuk semua PO aktif?",
]
const QUICK_SIM = [
  "Simulasikan dampak jika demand naik 20% bulan depan",
  "Berapa output tambahan jika overtime 2 jam per hari selama seminggu?",
  "Jika efisiensi line naik 10%, berapa PO yang bisa diselesaikan lebih cepat?",
  "Simulasikan balancing jika satu line ditambahkan untuk PO terbesar",
]
const QUICK_FORE = [
  "Prediksi demand untuk 4 minggu ke depan berdasarkan history",
  "Berapa kapasitas produksi yang dibutuhkan untuk memenuhi forecast?",
  "Material apa yang berisiko tidak tersedia dalam 8 minggu ke depan?",
  "Identifikasi risiko planning paling kritis untuk 12 minggu ke depan",
]

type KPI = {
  overall_capacity_pct?: number
  achievement_pct?: number
  material_readiness_pct?: number
  lines_at_risk?: number
  top_priority?: string
  planning_risk_level?: string
  mp_shortage?: number
  schedule_adjustment_needed?: number
  sim_demand_impact?: string
  sim_overtime_output?: number
  sim_efficiency_gain?: number
  sim_new_line_output?: number
  forecast_demand_4w?: number
  forecast_capacity_gap?: number
  material_risk_items?: number
  risk_score_12w?: string
  sheet_names?: string[]
  updated_at?: string
}

function Ring({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.38
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,.08)" strokeWidth={size*0.1}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.1}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}/>
      <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={size*0.2} fontWeight="600" fill={color}>
        {pct}%
      </text>
    </svg>
  )
}

function MetricCard({ label, value, sub, color, ring, children }:
  { label: string; value: string; sub?: string; color?: string; ring?: number; children?: React.ReactNode }) {
  return (
    <div style={{ background:"#f7f7f5", borderRadius:10, padding:"14px 16px", display:"flex", gap:12, alignItems:"center" }}>
      {ring !== undefined && <Ring pct={ring} color={color ?? "#185FA5"}/>}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, color:"#999", marginBottom:3 }}>{label}</div>
        <div style={{ fontSize: ring !== undefined ? 14 : 22, fontWeight:500, color: color ?? "#111", lineHeight:1.2 }}>{value}</div>
        {sub && <div style={{ fontSize:11, color:"#bbb", marginTop:3 }}>{sub}</div>}
        {children}
      </div>
    </div>
  )
}

function SectionTitle({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:12, marginTop:20 }}>
      <i className={`ti ${icon}`} style={{ fontSize:15, color:"#888" }}/>
      <span style={{ fontSize:13, fontWeight:600, color:"#111" }}>{title}</span>
      {sub && <span style={{ fontSize:11, color:"#aaa" }}>{sub}</span>}
    </div>
  )
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    "TINGGI":  { bg:"#fde8e8", color:"#b91c1c" },
    "SEDANG":  { bg:"#fef3c7", color:"#92400e" },
    "RENDAH":  { bg:"#d1fae5", color:"#065f46" },
  }
  const s = map[level?.toUpperCase()] ?? { bg:"#f3f4f6", color:"#555" }
  return <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:500, background:s.bg, color:s.color }}>{level || "—"}</span>
}

function SimSlider({ label, min, max, defaultVal, unit, onChange }:
  { label: string; min: number; max: number; defaultVal: number; unit: string; onChange: (v: number) => void }) {
  const [val, setVal] = useState(defaultVal)
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:12, color:"#555" }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:500, color:"#185FA5" }}>{val}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={val}
        onChange={e => { const v = Number(e.target.value); setVal(v); onChange(v) }}
        style={{ width:"100%", accentColor:"#185FA5" }}/>
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
  const [msgs,    setMsgs]    = useState<Msg[]>([
    { role:"assistant", content:"Halo! Saya AI Planning Assistant.\n\nSaya terhubung ke spreadsheet Anda dan siap membantu analisis executive, simulasi dampak perubahan, dan forecasting strategis. Apa yang ingin Anda ketahui?" }
  ])
  const [input,  setInput]  = useState("")
  const [typing, setTyping] = useState(false)
  const [clock,  setClock]  = useState("")
  const [simResult, setSimResult] = useState<string>("")
  const [simLoading, setSimLoading] = useState(false)
  const [demandDelta, setDemandDelta] = useState(10)
  const [overtimeHrs, setOvertimeHrs] = useState(2)
  const [effGain, setEffGain] = useState(5)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})+" WIB")
    tick(); const id = setInterval(tick,10000); return () => clearInterval(id)
  }, [])

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r=>r.json())
      .then(d=>{setKpi(d);setKpiLoad(false)})
      .catch(()=>setKpiLoad(false))
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}) }, [msgs,typing])

  const val = (v: any, suffix="") => (v!==undefined&&v!==null&&v!=="") ? `${v}${suffix}` : "—"

  async function sendChat(text?: string, systemHint?: string) {
    const userText = (text ?? input).trim()
    if (!userText || typing) return
    setInput("")
    const hint = systemHint ? `[Konteks: ${systemHint}]\n` : ""
    const next: Msg[] = [...msgs, { role:"user", content: hint + userText }]
    setMsgs(next)
    setTyping(true)
    try {
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ message: hint + userText, history: msgs }),
      })
      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let full = ""
      while(true) {
        const {done,value} = await reader.read()
        if(done) break
        full += dec.decode(value,{stream:true})
        setMsgs([...next,{role:"assistant",content:full}])
      }
    } catch {
      setMsgs([...next,{role:"assistant",content:"❌ Gagal terhubung ke AI. Coba lagi."}])
    } finally { setTyping(false) }
  }

  async function runSimulation(prompt: string) {
    setSimLoading(true)
    setSimResult("")
    setPage("chat")
    await sendChat(prompt, "Simulation Center")
    setSimLoading(false)
  }

  const updated = kpi.updated_at ? new Date(kpi.updated_at).toLocaleString("id-ID") : ""

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"system-ui,sans-serif",background:"#fff"}}>

      {/* Sidebar */}
      <nav style={{width:200,background:"#f7f7f5",borderRight:"0.5px solid rgba(0,0,0,.08)",display:"flex",flexDirection:"column",padding:"16px 0",flexShrink:0}}>
        <div style={{padding:"0 16px 16px",borderBottom:"0.5px solid rgba(0,0,0,.08)",marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:700,color:"#111"}}>Planning AI</div>
          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>{kpi.sheet_names?.length ?? 0} sheets · {clock}</div>
        </div>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"9px 16px",border:"none",background:page===n.id?"#fff":"transparent",
              color:page===n.id?"#185FA5":"#666",cursor:"pointer",borderLeft:`3px solid ${page===n.id?"#185FA5":"transparent"}`,
              fontSize:12,fontWeight:page===n.id?600:400,textAlign:"left",transition:"all .15s"}}>
            <i className={`ti ${n.icon}`} style={{fontSize:16,flexShrink:0}}/>
            {n.label}
          </button>
        ))}
        <div style={{flex:1}}/>
        <div style={{padding:"12px 16px",borderTop:"0.5px solid rgba(0,0,0,.08)",fontSize:11,color:"#bbb"}}>
          {kpiLoad ? "Memuat data..." : updated ? `Update: ${updated}` : ""}
        </div>
      </nav>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <div style={{height:48,borderBottom:"0.5px solid rgba(0,0,0,.08)",display:"flex",alignItems:"center",padding:"0 20px",gap:10,flexShrink:0}}>
          <span style={{fontSize:15,fontWeight:600}}>{NAV.find(n=>n.id===page)?.label}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#d1fae5",color:"#065f46",fontWeight:500}}>Live</span>
          <div style={{marginLeft:"auto",display:"flex",gap:8}}>
            <button onClick={()=>window.location.reload()} style={{padding:"5px 12px",borderRadius:6,border:"0.5px solid rgba(0,0,0,.12)",background:"#f7f7f5",color:"#555",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:5}}>
              <i className="ti ti-refresh" style={{fontSize:13}}/> Refresh
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

          {/* ══════════════ EXECUTIVE OVERVIEW ══════════════ */}
          {page==="executive" && (
            <div>
              {/* Row 1: Kapasitas & Achievement */}
              <SectionTitle icon="ti-chart-pie" title="Kapasitas & Pencapaian" sub="real-time dari spreadsheet"/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginBottom:16}}>
                <MetricCard label="Overall Capacity" value={val(kpi.overall_capacity_pct,"%")} color="#185FA5" ring={kpi.overall_capacity_pct??0} sub="kapasitas terpakai"/>
                <MetricCard label="Achievement vs Plan" value={val(kpi.achievement_pct,"%")} color={Number(kpi.achievement_pct??0)>=90?"#065f46":"#b91c1c"} ring={kpi.achievement_pct??0} sub="output aktual vs target"/>
                <MetricCard label="Material Readiness" value={val(kpi.material_readiness_pct,"%")} color={Number(kpi.material_readiness_pct??0)>=80?"#065f46":"#92400e"} ring={kpi.material_readiness_pct??0} sub="PO dengan material lengkap"/>
                <MetricCard label="Lines at Risk" value={val(kpi.lines_at_risk," line")} color="#b91c1c" sub="akan miss target">
                  {kpi.lines_at_risk && Number(kpi.lines_at_risk)>0 && (
                    <div style={{marginTop:6,fontSize:10,color:"#b91c1c",background:"#fde8e8",padding:"3px 7px",borderRadius:4}}>⚠ Perlu perhatian segera</div>
                  )}
                </MetricCard>
              </div>

              {/* Row 2: Prioritas & Risiko */}
              <SectionTitle icon="ti-alert-triangle" title="Prioritas & Risiko Hari Ini"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:11,color:"#999",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                    <i className="ti ti-list-check" style={{fontSize:13}}/> Prioritas Tindakan Hari Ini
                  </div>
                  {kpiLoad ? (
                    <div style={{color:"#bbb",fontSize:12}}>Memuat dari AI...</div>
                  ) : (
                    <div style={{fontSize:13,color:"#111",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{kpi.top_priority || "—"}</div>
                  )}
                </div>
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:11,color:"#999",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                    <i className="ti ti-shield-exclamation" style={{fontSize:13}}/> Risiko Problem Planning
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <RiskBadge level={kpi.planning_risk_level ?? "—"}/>
                    <span style={{fontSize:12,color:"#666"}}>level risiko keseluruhan</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
                    <div style={{background:"#fff",borderRadius:8,padding:"8px 12px",border:"0.5px solid rgba(0,0,0,.08)"}}>
                      <div style={{fontSize:10,color:"#999"}}>Kekurangan MP</div>
                      <div style={{fontSize:16,fontWeight:500,color:"#b91c1c"}}>{val(kpi.mp_shortage," orang")}</div>
                    </div>
                    <div style={{background:"#fff",borderRadius:8,padding:"8px 12px",border:"0.5px solid rgba(0,0,0,.08)"}}>
                      <div style={{fontSize:10,color:"#999"}}>Penyesuaian Jadwal</div>
                      <div style={{fontSize:16,fontWeight:500,color:"#92400e"}}>{val(kpi.schedule_adjustment_needed," PO")}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Ask */}
              <SectionTitle icon="ti-message-circle" title="Tanya AI Langsung"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {QUICK_EXEC.map(q=>(
                  <button key={q} onClick={()=>{setPage("chat");setTimeout(()=>sendChat(q),100)}}
                    style={{textAlign:"left",padding:"10px 14px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",cursor:"pointer",fontSize:12,color:"#185FA5",lineHeight:1.5}}>
                    <i className="ti ti-arrow-right" style={{fontSize:12,marginRight:6}}/>{q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════ SIMULATION CENTER ══════════════ */}
          {page==="simulation" && (
            <div>
              <div style={{background:"#eff6ff",border:"0.5px solid #bfdbfe",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:12,color:"#1e40af",display:"flex",gap:8}}>
                <i className="ti ti-info-circle" style={{fontSize:15,flexShrink:0,marginTop:1}}/>
                Atur parameter simulasi di bawah lalu klik "Jalankan Simulasi" — AI akan menganalisis dampaknya terhadap data spreadsheet Anda secara real-time.
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

                {/* Sim 1: Demand */}
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <i className="ti ti-trending-up" style={{color:"#185FA5"}}/> Dampak Perubahan Demand
                  </div>
                  <SimSlider label="Kenaikan/penurunan demand" min={-30} max={50} defaultVal={demandDelta} unit="%" onChange={setDemandDelta}/>
                  <div style={{fontSize:11,color:"#888",marginBottom:10}}>
                    Perubahan: <strong style={{color:demandDelta>=0?"#065f46":"#b91c1c"}}>{demandDelta>=0?"+":""}{demandDelta}%</strong> dari baseline saat ini
                  </div>
                  <button onClick={()=>runSimulation(`Simulasikan dampak jika demand berubah ${demandDelta>=0?"+":""}${demandDelta}% dari kondisi saat ini. Analisis: kapasitas yang dibutuhkan, PO yang terdampak, risiko keterlambatan, dan rekomendasi penyesuaian planning.`)}
                    style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:500}}>
                    Jalankan Simulasi →
                  </button>
                </div>

                {/* Sim 2: Overtime */}
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <i className="ti ti-clock" style={{color:"#92400e"}}/> Dampak Overtime
                  </div>
                  <SimSlider label="Jam overtime per hari" min={0} max={4} defaultVal={overtimeHrs} unit=" jam" onChange={setOvertimeHrs}/>
                  <div style={{fontSize:11,color:"#888",marginBottom:10}}>
                    Estimasi tambahan output: <strong style={{color:"#065f46"}}>+{Math.round(overtimeHrs/8*100)}%</strong> per hari
                  </div>
                  <button onClick={()=>runSimulation(`Simulasikan dampak overtime ${overtimeHrs} jam per hari selama seminggu ke depan. Hitung: tambahan output total, PO yang bisa diselesaikan lebih cepat, biaya overtime estimasi, dan apakah cukup untuk mengejar ketertinggalan.`)}
                    style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:"#92400e",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:500}}>
                    Jalankan Simulasi →
                  </button>
                </div>

                {/* Sim 3: Efisiensi */}
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <i className="ti ti-rocket" style={{color:"#065f46"}}/> Dampak Kenaikan Efisiensi
                  </div>
                  <SimSlider label="Kenaikan efisiensi line" min={1} max={25} defaultVal={effGain} unit="%" onChange={setEffGain}/>
                  <div style={{fontSize:11,color:"#888",marginBottom:10}}>
                    Jika efisiensi naik <strong style={{color:"#065f46"}}>{effGain}%</strong>, kapasitas efektif meningkat sebanding
                  </div>
                  <button onClick={()=>runSimulation(`Simulasikan jika efisiensi semua line naik ${effGain}%. Hitung: tambahan kapasitas produksi, PO mana yang paling diuntungkan, apakah target shipment bulan ini bisa dipenuhi, dan rekomendasi focus area untuk capai efisiensi ini.`)}
                    style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:"#065f46",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:500}}>
                    Jalankan Simulasi →
                  </button>
                </div>

                {/* Sim 4: Tambah Line */}
                <div style={{background:"#f7f7f5",borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    <i className="ti ti-layout-grid" style={{color:"#7c3aed"}}/> Dampak Penambahan Line
                  </div>
                  <div style={{fontSize:12,color:"#666",lineHeight:1.6,marginBottom:12}}>
                    Simulasi jika kapasitas ditambah dengan membuka line produksi baru. AI akan menghitung dampak terhadap semua PO aktif dan target shipment.
                  </div>
                  <button onClick={()=>runSimulation(`Simulasikan dampak penambahan 1 line produksi baru terhadap semua PO aktif. Analisis: berapa kapasitas tambahan, PO mana yang diprioritaskan masuk line baru, apakah bisa mengejar semua shipment yang berisiko terlambat, dan estimasi waktu setup.`)}
                    style={{width:"100%",padding:"8px",borderRadius:8,border:"none",background:"#7c3aed",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:500}}>
                    Jalankan Simulasi →
                  </button>
                </div>

              </div>

              {/* Balancing */}
              <SectionTitle icon="ti-scale" title="Simulasi Balancing Planning per Order"/>
              <div style={{background:"#f7f7f5",borderRadius:10,padding:"16px"}}>
                <div style={{fontSize:12,color:"#666",lineHeight:1.7,marginBottom:12}}>
                  AI akan menganalisis distribusi beban kerja antar line dan merekomendasikan balancing optimal berdasarkan data PO, kapasitas, dan deadline saat ini.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <button onClick={()=>runSimulation("Lakukan simulasi balancing optimal untuk semua PO aktif di semua line. Tentukan distribusi terbaik berdasarkan deadline, kapasitas, dan kompleksitas produk. Tampilkan rekomendasi alokasi PO per line.")}
                    style={{padding:"9px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.12)",background:"#fff",color:"#185FA5",cursor:"pointer",fontSize:12,fontWeight:500}}>
                    Balancing Otomatis (AI)
                  </button>
                  <button onClick={()=>runSimulation("Identifikasi PO mana yang paling overload di line-nya dan PO mana yang bisa dipindahkan ke line lain untuk menyeimbangkan beban. Berikan rekomendasi konkret.")}
                    style={{padding:"9px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.12)",background:"#fff",color:"#7c3aed",cursor:"pointer",fontSize:12,fontWeight:500}}>
                    Deteksi Overload
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ FORECAST & STRATEGIC ══════════════ */}
          {page==="forecast" && (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,marginBottom:16}}>
                <MetricCard label="Forecast Demand 4 Minggu" value={val(kpi.forecast_demand_4w," pcs")} color="#185FA5" sub="prediksi berdasarkan pola history"/>
                <MetricCard label="Gap Kapasitas" value={val(kpi.forecast_capacity_gap," pcs")} color={Number(kpi.forecast_capacity_gap??0)>0?"#b91c1c":"#065f46"} sub={Number(kpi.forecast_capacity_gap??0)>0?"kapasitas tidak cukup":"kapasitas mencukupi"}/>
                <MetricCard label="Item Material Berisiko" value={val(kpi.material_risk_items," item")} color="#92400e" sub="perlu monitoring ketat"/>
              </div>

              {/* Timeline risiko */}
              <SectionTitle icon="ti-calendar-time" title="Risiko 4–12 Minggu ke Depan"/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12,marginBottom:16}}>
                {[
                  {period:"4 Minggu",icon:"ti-alert-circle",color:"#b91c1c",bg:"#fde8e8",desc:"Risiko jangka pendek"},
                  {period:"8 Minggu",icon:"ti-clock-exclamation",color:"#92400e",bg:"#fef3c7",desc:"Risiko jangka menengah"},
                  {period:"12 Minggu",icon:"ti-radar",color:"#185FA5",bg:"#eff6ff",desc:"Risiko jangka panjang"},
                ].map(r=>(
                  <button key={r.period} onClick={()=>{setPage("chat");setTimeout(()=>sendChat(`Identifikasi dan analisis semua risiko planning untuk ${r.period} ke depan. Meliputi: risiko kapasitas, material, demand, dan SDM. Berikan tingkat keparahan dan rekomendasi mitigasi untuk setiap risiko.`),100)}}
                    style={{background:r.bg,borderRadius:10,padding:"14px 16px",border:`0.5px solid ${r.color}30`,cursor:"pointer",textAlign:"left"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <i className={`ti ${r.icon}`} style={{fontSize:18,color:r.color}}/>
                      <span style={{fontSize:13,fontWeight:600,color:r.color}}>{r.period}</span>
                    </div>
                    <div style={{fontSize:11,color:r.color,opacity:.8}}>{r.desc}</div>
                    <div style={{fontSize:11,color:r.color,marginTop:6,fontWeight:500}}>Klik untuk analisis AI →</div>
                  </button>
                ))}
              </div>

              {/* Forecast questions */}
              <SectionTitle icon="ti-brain" title="Analisis Strategis"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {QUICK_FORE.map(q=>(
                  <button key={q} onClick={()=>{setPage("chat");setTimeout(()=>sendChat(q),100)}}
                    style={{textAlign:"left",padding:"12px 14px",borderRadius:8,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",cursor:"pointer",fontSize:12,color:"#185FA5",lineHeight:1.5}}>
                    <i className="ti ti-arrow-right" style={{fontSize:12,marginRight:6}}/>{q}
                  </button>
                ))}
              </div>

              {/* Risk level */}
              <SectionTitle icon="ti-shield" title="Skor Risiko Keseluruhan"/>
              <div style={{background:"#f7f7f5",borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:11,color:"#999"}}>Risiko 12 Minggu:</div>
                <RiskBadge level={kpi.risk_score_12w ?? "—"}/>
                <button onClick={()=>{setPage("chat");setTimeout(()=>sendChat("Berikan analisis risiko komprehensif untuk 12 minggu ke depan beserta rekomendasi strategi mitigasi yang konkret."),100)}}
                  style={{marginLeft:"auto",padding:"6px 14px",borderRadius:6,border:"none",background:"#185FA5",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:500}}>
                  Analisis Detail →
                </button>
              </div>
            </div>
          )}

          {/* ══════════════ AI CHAT ══════════════ */}
          {page==="chat" && (
            <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 110px)"}}>
              <div style={{fontSize:11,color:"#aaa",marginBottom:10}}>
                Terhubung ke: {kpi.sheet_names?.join(", ") || "memuat..."}
              </div>

              {/* Quick prompts berdasarkan konteks */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                <span style={{fontSize:11,color:"#bbb",alignSelf:"center"}}>Cepat:</span>
                {[...QUICK_EXEC.slice(0,2),...QUICK_SIM.slice(0,1),...QUICK_FORE.slice(0,1)].map(q=>(
                  <button key={q} onClick={()=>sendChat(q)}
                    style={{fontSize:10,padding:"3px 9px",borderRadius:20,border:"0.5px solid rgba(0,0,0,.1)",background:"#f7f7f5",color:"#555",cursor:"pointer",whiteSpace:"nowrap"}}>
                    {q.length>35?q.slice(0,35)+"...":q}
                  </button>
                ))}
              </div>

              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12,paddingRight:4}}>
                {msgs.map((m,i)=>(
                  <div key={i} style={{
                    alignSelf:m.role==="user"?"flex-end":"flex-start",
                    maxWidth:"88%",
                    background:m.role==="user"?"rgba(55,138,221,.1)":"#f7f7f5",
                    border:`0.5px solid ${m.role==="user"?"rgba(55,138,221,.25)":"rgba(0,0,0,.08)"}`,
                    borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",
                    padding:"10px 14px",fontSize:13,
                    color:m.role==="user"?"#185FA5":"#111",
                    lineHeight:1.65,whiteSpace:"pre-wrap",
                  }}>
                    {m.content}{typing&&i===msgs.length-1&&m.role==="assistant"?"▍":""}
                  </div>
                ))}
                {typing&&msgs[msgs.length-1]?.role!=="assistant"&&(
                  <div style={{alignSelf:"flex-start",fontSize:12,color:"#bbb",display:"flex",alignItems:"center",gap:6}}>
                    <span>AI sedang menganalisis data</span>
                    <span style={{display:"flex",gap:3}}>
                      {[0,1,2].map(i=><span key={i} style={{width:4,height:4,borderRadius:"50%",background:"#bbb",display:"inline-block",animation:`pulse 1s ${i*.2}s infinite`}}/>)}
                    </span>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>

              <div style={{display:"flex",gap:8,marginTop:12}}>
                <input value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendChat()}
                  placeholder="Tanya tentang kapasitas, risiko, forecast, atau minta simulasi..."
                  disabled={typing}
                  style={{flex:1,padding:"10px 14px",borderRadius:10,fontSize:13,border:"0.5px solid rgba(0,0,0,.15)",background:"#f7f7f5",outline:"none"}}/>
                <button onClick={()=>sendChat()} disabled={typing||!input.trim()}
                  style={{padding:"10px 18px",borderRadius:10,fontSize:13,border:"none",background:typing||!input.trim()?"#e5e5e5":"#185FA5",color:typing||!input.trim()?"#aaa":"#fff",cursor:typing||!input.trim()?"not-allowed":"pointer",fontWeight:500}}>
                  {typing?"...":"Kirim"}
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
