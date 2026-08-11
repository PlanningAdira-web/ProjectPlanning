"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

type Role  = "admin"|"planning"|"viewer"
type User  = { username:string; name:string; role:Role }
type Perms = { canRefreshAI:boolean; canChat:boolean; canBalancing:boolean; canToggleAI:boolean; canTodo:boolean }
type Page  = "todo"|"vis"|"plandst"|"plansew"|"kalender"|"shipment"|"matset"|"sim"|"ai"
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
// -- Main component -----------------------------------------------
function SearchBox(props: { value: string; onChange: (v: string) => void; placeholder: string; resultCount?: number }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
      <div style={{ position:"relative", flex:"0 1 260px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          value={props.value}
          onChange={function(e) { props.onChange(e.target.value) }}
          placeholder={props.placeholder}
          style={{ width:"100%", boxSizing:"border-box", padding:"6px 10px 6px 26px", fontSize:11, border:"0.5px solid #c8e6c9", borderRadius:6, outline:"none", color:C.txt }}
        />
        {props.value !== "" && (
          <button onClick={function() { props.onChange("") }} title="Hapus pencarian" aria-label="Hapus pencarian"
            style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", border:"none", background:"transparent", cursor:"pointer", color:C.tx3, fontSize:12, lineHeight:1, padding:2 }}>
            ✕
          </button>
        )}
      </div>
      {props.value !== "" && props.resultCount !== undefined && (
        <span style={{ fontSize:10, color:C.tx3 }}>{props.resultCount} baris cocok</span>
      )}
    </div>
  )
}

function matchSearch(row: any, q: string) {
  if (!q) return true
  const needle = q.toLowerCase()
  const haystack = [row.line, row.spo, row.style, row.buyer].filter(Boolean).join(" ").toLowerCase()
  return haystack.indexOf(needle) !== -1
}

function ageLabel(isoOrLocale: string): string {
  if (!isoOrLocale) return ""
  try {
    const ts = typeof isoOrLocale === "number" ? isoOrLocale : Date.parse(isoOrLocale)
    if (isNaN(ts)) return isoOrLocale
    const mins = Math.round((Date.now() - ts) / 60000)
    if (mins < 1)   return "baru saja"
    if (mins < 60)  return mins + " menit lalu"
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h < 24) return h + " jam" + (m > 0 ? " " + m + " menit" : "") + " lalu"
    return Math.floor(h / 24) + " hari lalu"
  } catch { return isoOrLocale }
}

function parseHeaderDate(d: string): Date | null {
  if (!d) return null
  const parts = d.trim().split("-")
  if (parts.length < 3) return null
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const day  = parseInt(parts[0], 10)
  const mIdx = months.indexOf(parts[1])
  let   yr   = parseInt(parts[2], 10)
  if (isNaN(day) || mIdx < 0 || isNaN(yr)) return null
  if (yr < 100) yr += 2000
  return new Date(yr, mIdx, day)
}

function inDateRange(d: string, fromISO: string, toISO: string) {
  if (!fromISO && !toISO) return true
  const dt = parseHeaderDate(d)
  if (!dt) return true // format tak dikenali, jangan disembunyikan
  if (fromISO) {
    const f = new Date(fromISO + "T00:00:00")
    if (dt < f) return false
  }
  if (toISO) {
    const t = new Date(toISO + "T00:00:00")
    if (dt > t) return false
  }
  return true
}

function DateRangeFilter(props: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
      <span style={{ fontSize:10, color:C.tx3, fontWeight:500 }}>Filter Tanggal:</span>
      <input type="date" value={props.from} onChange={function(e) { props.setFrom(e.target.value) }}
        style={{ fontSize:11, padding:"5px 8px", border:"0.5px solid #c8e6c9", borderRadius:6, outline:"none", color:C.txt }}/>
      <span style={{ fontSize:10, color:C.tx3 }}>s/d</span>
      <input type="date" value={props.to} onChange={function(e) { props.setTo(e.target.value) }}
        style={{ fontSize:11, padding:"5px 8px", border:"0.5px solid #c8e6c9", borderRadius:6, outline:"none", color:C.txt }}/>
      {(props.from !== "" || props.to !== "") && (
        <button onClick={function() { props.setFrom(""); props.setTo("") }}
          style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.tx2, cursor:"pointer" }}>
          Reset
        </button>
      )}
      <span style={{ fontSize:9, color:C.tx3, fontStyle:"italic" }}>Berlaku untuk semua menu (Planning, Material, Shipment)</span>
    </div>
  )
}

type PlanTableProps = {
  loading: boolean
  data: any
  factory: string
  search: string
  setSearch: (v: string) => void
  dateFrom: string
  dateTo: string
}

function PlanSewTable(props: PlanTableProps) {
  const { loading, data, factory, search, setSearch, dateFrom, dateTo } = props
  if (loading) return (
    <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
      Memuat data dari sheet Plan SEW...
    </div>
  )
  if (!data) return (
    <div style={{ padding:"24px", textAlign:"center", background:C.orp, borderRadius:8, border:"0.5px solid #ffcc80", fontSize:12, color:C.org }}>
      Gagal memuat data. Pastikan sheet Plan SEW tersedia.
    </div>
  )
  const rows: any[]    = (data.rows[factory] ?? []).filter(function(r: any) { return matchSearch(r, search) })
  const dates: string[]= (data.date_headers ?? []).filter(function(d: string) { return inDateRange(d, dateFrom, dateTo) })
  const today          = new Date()
  const todayWIB       = new Date(today.getTime() + 7 * 60 * 60 * 1000)

  const currWeek = new Set(
    dates.filter(function(d: string) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      const p = d.split("-")
      const mIdx = months.findIndex(function(m: string) { return m === p[1] })
      if (mIdx < 0) return false
      const dt   = new Date(todayWIB.getFullYear(), mIdx, parseInt(p[0]))
      const diff = (dt.getTime() - todayWIB.getTime()) / 86400000
      return diff >= 0 && diff < 7
    })
  )

  const lines = Array.from(new Set(rows.map(function(r: any) { return r.line })))

  // Freeze 7 kolom: A-G
  const FREEZE = [
    { h:"LINE",         w:44,  l:0,   a:"left"   },
    { h:"SPO",          w:68,  l:44,  a:"left"   },
    { h:"STYLE",        w:160, l:112, a:"left"   },
    { h:"QTY ORDER",    w:72,  l:272, a:"right"  },
    { h:"QTY PLAN",     w:68,  l:344, a:"right"  },
    { h:"RENCANA F.PROD", w:90,  l:412, a:"left"   },
    { h:"Fact",         w:40,  l:502, a:"center" },
    { h:"DST",          w:56,  l:542, a:"right"  },
    { h:"SEW",          w:64,  l:598, a:"right"  },
  ] as { h:string; w:number; l:number; a:string }[]

  const sth = function(col: typeof FREEZE[0], i: number) {
    return {
      position:"sticky" as const, top:0, left:col.l, zIndex:4+i,
      background: i===6 ? "#1b4d24" : "#1a5c2a",
      color:"#fff", padding:"5px 8px", fontWeight:500,
      whiteSpace:"nowrap" as const, minWidth:col.w,
      textAlign:col.a as any,
      borderRight: i===6 ? "2px solid rgba(255,255,255,.35)" : "0.5px solid rgba(255,255,255,.15)",
      borderBottom:"1px solid rgba(255,255,255,.2)",
    }
  }

  const std = function(col: typeof FREEZE[0], i: number, bg: string, extra?: any) {
    return Object.assign({
      position:"sticky" as const, left:col.l, zIndex:1,
      background:bg, padding:"5px 8px",
      borderBottom:"0.5px solid #cfe0cc",
      borderRight: i===6 ? "3px solid #4caf50" : "0.5px solid #c8e6c9",
      boxShadow: i===6 ? "2px 0 4px rgba(0,0,0,.08)" : "none",
      whiteSpace:"nowrap" as const, minWidth:col.w,
      textAlign:col.a as any,
    }, extra || {})
  }

  return (
    <div>
      <SearchBox value={search} onChange={setSearch} placeholder="Cari SPO, style, atau line..." resultCount={rows.length}/>
      {rows.length === 0 ? (
        <div style={{ padding:"24px", textAlign:"center", color:C.tx3, fontSize:12, border:"0.5px solid #c8e6c9", borderRadius:8 }}>
          Tidak ada baris yang cocok dengan pencarian "{search}".
        </div>
      ) : (
      <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9", maxHeight:"calc(100vh - 180px)" }}>
        <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:10, minWidth:"max-content" }}>
          <thead>
            <tr>
              {FREEZE.map(function(col, i) {
                return <th key={i} style={sth(col, i)}>{col.h}</th>
              })}
              {dates.map(function(d: string) {
                return (
                  <th key={d} style={{
                    position:"sticky", top:0, zIndex:2,
                    background: currWeek.has(d) ? "#2e7d32" : "#1a5c2a",
                    color:"#fff", padding:"5px 8px", fontWeight:500,
                    whiteSpace:"nowrap", minWidth:54, textAlign:"center",
                    borderRight:"0.5px solid rgba(255,255,255,.1)",
                    borderBottom:"1px solid rgba(255,255,255,.2)",
                  }}>{d}</th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lines.map(function(line: any, li: number) {
              const lr   = rows.filter(function(r: any) { return r.line === line })
              const bg   = li % 2 === 0 ? "#e8f5e9" : "#fff"
              const bgCr = li % 2 === 0 ? "#d0ecd3" : "#f1f8f2"
              return lr.map(function(row: any, ri: number) {
                return (
                  <tr key={String(li)+"-"+String(ri)}>
                    <td style={std(FREEZE[0], 0, bg)}>
                      {ri===0 && <strong style={{ color:C.gdark }}>{row.line}</strong>}
                    </td>
                    <td style={Object.assign(std(FREEZE[1], 1, bg), { color:C.blue })}>{row.spo}</td>
                    <td style={std(FREEZE[2], 2, bg, { maxWidth:160, overflow:"hidden", textOverflow:"ellipsis" })} title={row.style}>{row.style}</td>
                    <td style={std(FREEZE[3], 3, bg, { fontWeight:500 })}>{row.qty_order ? Number(row.qty_order).toLocaleString("en-US") : ""}</td>
                    <td style={std(FREEZE[4], 4, bg, { fontWeight:500 })}>{row.qty_plan  ? Number(row.qty_plan).toLocaleString("en-US")  : ""}</td>
                    <td style={std(FREEZE[5], 5, bg, { fontSize:9, color:C.tx2, fontStyle:"italic" })}>{row.fprc}</td>
                    <td style={std(FREEZE[6], 6, bg, { textAlign:"center" })}>
                      <span style={{ background:"#e0f2f1", color:C.teal, fontSize:8, padding:"1px 5px", borderRadius:6, fontWeight:500 }}>
                        {row.fact}
                      </span>
                    </td>
                    <td style={std(FREEZE[7], 7, bg, { textAlign:"right" })}>
                      {row.dst !== "" && row.dst !== 0
                        ? <span style={{ color:C.gdark, fontWeight:500 }}>{Number(row.dst).toLocaleString("en-US")}</span>
                        : ""}
                    </td>
                    <td style={std(FREEZE[8], 8, bg, { textAlign:"right" })}>
                      {row.sew !== "" && row.sew !== 0
                        ? <span style={{ color:C.teal, fontWeight:500 }}>{Number(row.sew).toLocaleString("en-US")}</span>
                        : ""}
                    </td>
                    {dates.map(function(d: string) {
                      const val    = row.dates[d]
                      const cellBg = currWeek.has(d) ? bgCr : bg
                      return (
                        <td key={d} style={{ padding:"5px 8px", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.25)", background:cellBg, textAlign:"center", whiteSpace:"nowrap", fontSize:10 }}>
                          {val === "F"
                            ? <span style={{ color:C.red, fontWeight:700 }}>F</span>
                            : (val !== "" && val !== undefined && val !== null)
                              ? <span style={{ color:C.gdark, fontWeight:500 }}>{Number(val).toLocaleString("en-US")}</span>
                              : null}
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
      )}
      <div style={{ marginTop:6, fontSize:9, color:C.tx3, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#e8f5e9", border:"0.5px solid #a5d6a7", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Line ganjil</span>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#fff", border:"0.5px solid #ddd", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Line genap</span>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#d0ecd3", border:"0.5px solid #a5d6a7", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Minggu ini</span>
        <span style={{ color:C.red, fontWeight:700 }}>F</span><span>= Akhir planning</span>
        <span style={{ marginLeft:"auto" }}>Freeze s/d kolom G - Scroll kanan untuk semua tanggal</span>
        {data?.fetched_epoch && <span>Update: {ageLabel(data.fetched_epoch)}</span>}
      </div>
    </div>
  )
}

function PlanDstTable(props: PlanTableProps) {
  const { loading, data, factory, search, setSearch, dateFrom, dateTo } = props
  if (loading) return (
    <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
      Memuat data dari sheet Plan DST...
    </div>
  )
  if (!data) return (
    <div style={{ padding:"24px", textAlign:"center", background:C.orp, borderRadius:8, border:"0.5px solid #ffcc80", fontSize:12, color:C.org }}>
      Gagal memuat data. Pastikan sheet Plan DST tersedia.
    </div>
  )
  const rows: any[]    = (data.rows[factory] ?? []).filter(function(r: any) { return matchSearch(r, search) })
  const dates: string[]= (data.date_headers ?? []).filter(function(d: string) { return inDateRange(d, dateFrom, dateTo) })
  const today          = new Date()
  const todayWIB       = new Date(today.getTime() + 7 * 60 * 60 * 1000)

  const currWeek = new Set(
    dates.filter(function(d: string) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      const p = d.split("-")
      const mIdx = months.findIndex(function(m: string) { return m === p[1] })
      if (mIdx < 0) return false
      const year = todayWIB.getFullYear()
      const dt   = new Date(year, mIdx, parseInt(p[0]))
      const diff = (dt.getTime() - todayWIB.getTime()) / 86400000
      return diff >= 0 && diff < 7
    })
  )

  const lines = Array.from(new Set(rows.map(function(r: any) { return r.line })))

  const FREEZE_COLS = [
    { h:"LINE",         w:44,  l:0,   a:"left"   },
    { h:"SPO",          w:68,  l:44,  a:"left"   },
    { h:"STYLE",        w:160, l:112, a:"left"   },
    { h:"QTY ORDER",    w:72,  l:272, a:"right"  },
    { h:"QTY PLAN",     w:68,  l:344, a:"right"  },
    { h:"RENCANA F.PROD", w:90,  l:412, a:"left"   },
    { h:"Fact",         w:40,  l:502, a:"center" },
    { h:"DST",          w:56,  l:542, a:"right"  },
    { h:"SEW",          w:64,  l:598, a:"right"  },
  ] as { h:string; w:number; l:number; a:string }[]

  const stickyTh = function(col: typeof FREEZE_COLS[0], i: number) {
    return {
      position:"sticky" as const, top:0, left:col.l, zIndex:10+i,
      background: i===8 ? "#1b4d24" : "#1a5c2a",
      color:"#fff", padding:"5px 8px", fontWeight:500,
      whiteSpace:"nowrap" as const, boxSizing:"border-box" as const,
      width:col.w, minWidth:col.w, maxWidth:col.w,
      textAlign:col.a as any,
      borderRight: i===8 ? "2px solid rgba(255,255,255,.35)" : "0.5px solid rgba(255,255,255,.15)",
      borderBottom:"1px solid rgba(255,255,255,.2)",
    }
  }

  const stickyTd = function(col: typeof FREEZE_COLS[0], i: number, bg: string, extra?: any) {
    return Object.assign({
      position:"sticky" as const, left:col.l, zIndex:5,
      background:bg, padding:"5px 8px",
      borderBottom:"0.5px solid #cfe0cc",
      borderRight: i===8 ? "3px solid #4caf50" : "0.5px solid #c8e6c9",
      boxShadow: i===8 ? "2px 0 4px rgba(0,0,0,.08)" : "none",
      whiteSpace:"nowrap" as const, boxSizing:"border-box" as const,
      width:col.w, minWidth:col.w, maxWidth:col.w,
      textAlign:col.a as any,
    }, extra || {})
  }

  return (
    <div>
      <SearchBox value={search} onChange={setSearch} placeholder="Cari SPO, style, atau line..." resultCount={rows.length}/>
      {rows.length === 0 ? (
        <div style={{ padding:"24px", textAlign:"center", color:C.tx3, fontSize:12, border:"0.5px solid #c8e6c9", borderRadius:8 }}>
          Tidak ada baris yang cocok dengan pencarian "{search}".
        </div>
      ) : (
      <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9", maxHeight:"calc(100vh - 180px)" }}>
        <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:10, minWidth:"max-content", tableLayout:"auto" }}>
          <thead>
            <tr>
              {FREEZE_COLS.map(function(col, i) {
                return <th key={i} style={stickyTh(col, i)}>{col.h}</th>
              })}
              {dates.map(function(d: string) {
                const isCurr = currWeek.has(d)
                return (
                  <th key={d} style={{
                    position:"sticky", top:0, zIndex:1,
                    background: isCurr ? "#2e7d32" : "#1a5c2a",
                    color:"#fff", padding:"5px 8px", fontWeight:500,
                    whiteSpace:"nowrap", minWidth:56, textAlign:"center",
                    borderRight:"0.5px solid rgba(255,255,255,.1)",
                    borderBottom:"1px solid rgba(255,255,255,.2)",
                  }}>{d}</th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lines.map(function(line: any, li: number) {
              const lr   = rows.filter(function(r: any) { return r.line === line })
              const bg   = li % 2 === 0 ? "#e8f5e9" : "#fff"
              const bgCr = li % 2 === 0 ? "#d0ecd3" : "#f1f8f2"
              return lr.map(function(row: any, ri: number) {
                return (
                  <tr key={String(li)+"-"+String(ri)}>
                    <td style={stickyTd(FREEZE_COLS[0], 0, bg)}>
                      {ri===0 && <strong style={{ color:C.gdark }}>{row.line}</strong>}
                    </td>
                    <td style={Object.assign(stickyTd(FREEZE_COLS[1], 1, bg), { color:C.blue })}>
                      {row.spo}
                    </td>
                    <td style={stickyTd(FREEZE_COLS[2], 2, bg, { maxWidth:160, overflow:"hidden", textOverflow:"ellipsis" })} title={row.style}>
                      {row.style}
                    </td>
                    <td style={stickyTd(FREEZE_COLS[3], 3, bg, { fontWeight:500 })}>
                      {row.qty_order ? Number(row.qty_order).toLocaleString("en-US") : ""}
                    </td>
                    <td style={stickyTd(FREEZE_COLS[4], 4, bg, { fontWeight:500 })}>
                      {row.qty_plan ? Number(row.qty_plan).toLocaleString("en-US") : ""}
                    </td>
                    <td style={stickyTd(FREEZE_COLS[5], 5, bg, { fontSize:9, color:C.tx2, fontStyle:"italic" })}>
                      {row.fprc}
                    </td>
                    <td style={stickyTd(FREEZE_COLS[6], 6, bg, { textAlign:"center" })}>
                      <span style={{ background:"#fff3e0", color:C.org, fontSize:8, padding:"1px 5px", borderRadius:6, fontWeight:500 }}>
                        {row.fact}
                      </span>
                    </td>
                    <td style={stickyTd(FREEZE_COLS[7], 7, bg, { textAlign:"right" })}>
                      {row.dst !== "" && row.dst !== 0
                        ? <span style={{ color:C.gdark, fontWeight:500 }}>{Number(row.dst).toLocaleString("en-US")}</span>
                        : ""}
                    </td>
                    <td style={stickyTd(FREEZE_COLS[8], 8, bg, { textAlign:"right" })}>
                      {row.sew !== "" && row.sew !== 0
                        ? <span style={{ color:C.teal, fontWeight:500 }}>{Number(row.sew).toLocaleString("en-US")}</span>
                        : ""}
                    </td>
                    {dates.map(function(d: string) {
                      const val    = row.dates[d]
                      const cellBg = currWeek.has(d) ? bgCr : bg
                      return (
                        <td key={d} style={{ padding:"5px 8px", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.25)", background:cellBg, textAlign:"center", whiteSpace:"nowrap", fontSize:10 }}>
                          {val === "F"
                            ? <span style={{ color:C.red, fontWeight:700 }}>F</span>
                            : (val !== "" && val !== undefined && val !== null)
                              ? <span style={{ color:C.gdark, fontWeight:500 }}>{Number(val).toLocaleString("en-US")}</span>
                              : null}
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
      )}
      <div style={{ marginTop:6, fontSize:9, color:C.tx3, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#e8f5e9", border:"0.5px solid #a5d6a7", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Line ganjil</span>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#fff", border:"0.5px solid #ddd", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Line genap</span>
        <span><span style={{ display:"inline-block", width:9, height:9, background:"#d0ecd3", border:"0.5px solid #a5d6a7", borderRadius:2, verticalAlign:"middle", marginRight:2 }}></span>Minggu ini</span>
        <span style={{ color:C.red, fontWeight:700 }}>F</span><span>= Akhir planning</span>
        <span style={{ marginLeft:"auto" }}>Freeze s/d kolom SEW (I) - Scroll kanan untuk semua tanggal</span>
        {data?.fetched_epoch && (
          <span>Update: {ageLabel(data.fetched_epoch)}</span>
        )}
      </div>
    </div>
  )
}

// Warna tetap untuk buyer yang sudah dikenal (sama di semua filter Factory); buyer lain dapat warna dari palet fallback
const BUYER_FIXED_COLORS: Record<string, string> = {
  "Callaway"   : "#003f5c",
  "TMAG"       : "#58508d",
  "Taylor Made": "#bc5090",
  "Batting"    : "#ff6361",
  "Bating"     : "#ff6361", // jaga-jaga kalau penulisan di sheet "Bating" (tanpa dobel t)
  "Others"     : "#ffa600",
}
const BUYER_FALLBACK_PALETTE = ["#FDD835","#26A69A","#8D6E63","#78909C","#EC407A","#7E57C2","#26C6DA","#9CCC65"]

function buildBuyerColorMap(data: any): Record<string, string> {
  const map: Record<string, string> = {}
  let idx = 0
  Object.keys(data?.cells ?? {}).forEach(function(fact) {
    Object.keys(data.cells[fact]).forEach(function(week) {
      Object.keys(data.cells[fact][week]).forEach(function(line) {
        const c = data.cells[fact][week][line]
        ;(c.buyers ?? []).forEach(function(b: string) {
          if (map[b]) return
          map[b] = BUYER_FIXED_COLORS[b] ?? BUYER_FALLBACK_PALETTE[idx % BUYER_FALLBACK_PALETTE.length]
          if (!BUYER_FIXED_COLORS[b]) idx++
        })
      })
    })
  })
  return map
}

function buyerBreakdown(c: { buyers: string[]; qtys: number[] }) {
  const countMap: Record<string, number> = {}
  const qtyMap: Record<string, number> = {}
  c.buyers.forEach(function(b: string, i: number) {
    countMap[b] = (countMap[b] ?? 0) + 1
    qtyMap[b]   = (qtyMap[b]   ?? 0) + (c.qtys[i] ?? 0)
  })
  const uniqueBuyers = Object.keys(countMap)
  const totalCount = c.buyers.length
  const totalQty   = c.qtys.reduce(function(a: number, b: number) { return a + b }, 0)
  return { countMap, qtyMap, uniqueBuyers, totalCount, totalQty }
}

type BuyerRekapRow = { buyer: string; qty: number; jkNormal: number; jkLembur: number; lineCount: number }

// Rekap agregat per Buyer: Qty total, JK Normal/Lembur (dibagi proporsional sesuai porsi Qty
// kalau 1 Line+Minggu dikerjakan >1 buyer), dan jumlah Line unik. Line di excludeLines dikecualikan total.
function computeBuyerRekap(data: any, weeks: string[], excludeLines: string[]): BuyerRekapRow[] {
  const excludeSet = new Set(excludeLines.map(function(l) { return l.toUpperCase() }))
  const acc: Record<string, { qty: number; jkNormal: number; jkLembur: number; lines: Set<string> }> = {}
  const factories: string[] = data.factories ?? []

  weeks.forEach(function(w: string) {
    factories.forEach(function(f: string) {
      const byLine = data.cells[f]?.[w] ?? {}
      Object.keys(byLine).forEach(function(line: string) {
        if (excludeSet.has(line.toUpperCase())) return
        const cell = byLine[line]
        const { qtyMap, totalQty, uniqueBuyers } = buyerBreakdown(cell)
        uniqueBuyers.forEach(function(b: string) {
          if (!acc[b]) acc[b] = { qty:0, jkNormal:0, jkLembur:0, lines:new Set() }
          const share = totalQty > 0 ? (qtyMap[b] / totalQty) : (1 / uniqueBuyers.length)
          acc[b].qty      += qtyMap[b]
          acc[b].jkNormal += cell.jk_normal * share
          acc[b].jkLembur += cell.jk_lembur * share
          acc[b].lines.add(line)
        })
      })
    })
  })

  return Object.keys(acc)
    .map(function(b: string) {
      return {
        buyer: b,
        qty: acc[b].qty,
        jkNormal: Math.round(acc[b].jkNormal * 10) / 10,
        jkLembur: Math.round(acc[b].jkLembur * 10) / 10,
        lineCount: acc[b].lines.size,
      }
    })
    .sort(function(a, b) { return b.qty - a.qty })
}

function DistBar(props: { segments: { color: string; pct: number; label: string }[] }) {
  return (
    <div style={{ display:"flex", width:"100%", height:10, borderRadius:4, overflow:"hidden", background:"#eee" }}>
      {props.segments.map(function(s, i) {
        return <div key={i} title={s.label} style={{ width: s.pct + "%", background: s.color, cursor:"help" }}/>
      })}
    </div>
  )
}

// Cari cell untuk week+line, cari di semua Factory (atau daftar Factory terbatas kalau diisi restrictFactories)
function lookupCell(data: any, week: string, line: string, restrictFactories?: string[]): { cell: any; fact: string } | null {
  const facts: string[] = restrictFactories ?? (data.factories ?? [])
  for (const f of facts) {
    const c = data.cells[f]?.[week]?.[line]
    if (c) return { cell: c, fact: f }
  }
  return null
}

type ExportProps = {
  data: any
  weeks: string[]
  lines: string[]
  restrictFactories?: string[]
  showFactBadge: boolean
}

// Tabel ringkas khusus untuk di-export jadi JPG: font & padding lebih kecil, info tetap lengkap
function ExportTable(props: ExportProps) {
  const { data, weeks, lines, restrictFactories, showFactBadge } = props
  const buyerColors = buildBuyerColorMap(data)
  const labelColW = 78
  const lineColW  = 128

  return (
    <div style={{ background:"#fff", padding:12, fontFamily:"system-ui, sans-serif" }}>
      <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:9 }}>
        <thead>
          <tr>
            <th style={{ background:"#1b4d24", color:"#fff", padding:"4px 6px", textAlign:"left", minWidth:labelColW }}>Minggu / Line</th>
            {lines.map(function(l: string) {
              return <th key={l} style={{ background:C.gdark, color:"#fff", padding:"4px 6px", textAlign:"left", minWidth:lineColW }}>{"Line " + l}</th>
            })}
          </tr>
        </thead>
        <tbody>
          {weeks.map(function(w: string, wi: number) {
            const bg = wi % 2 === 0 ? "#e8f5e9" : "#fff"
            return (
              <tr key={w}>
                <td style={{ background:bg, padding:"4px 6px", fontWeight:600, color:C.gdark, borderBottom:"0.5px solid #cfe0cc", minWidth:labelColW }}>
                  Minggu {w}
                </td>
                {lines.map(function(l: string) {
                  const found = lookupCell(data, w, l, restrictFactories)
                  if (!found) {
                    return <td key={l} style={{ background:bg, padding:"4px 6px", borderBottom:"0.5px solid #cfe0cc", minWidth:lineColW }}><span style={{ color:C.tx3, fontSize:8 }}>-</span></td>
                  }
                  const c = found.cell
                  const { countMap, qtyMap, uniqueBuyers, totalCount, totalQty } = buyerBreakdown(c)
                  const countSegs = uniqueBuyers.map(function(b: string) { return { color:buyerColors[b], pct:(countMap[b]/totalCount)*100, label:b } })
                  const qtySegs   = uniqueBuyers.map(function(b: string) { return { color:buyerColors[b], pct: totalQty>0 ? (qtyMap[b]/totalQty)*100 : 0, label:b } })
                  return (
                    <td key={l} style={{ background:bg, padding:"4px 6px", borderBottom:"0.5px solid #cfe0cc", verticalAlign:"top", minWidth:lineColW }}>
                      {showFactBadge && (
                        <span style={{ display:"inline-block", fontSize:7, fontWeight:600, color:"#fff", background:C.gdark, padding:"0 4px", borderRadius:3, marginBottom:3 }}>
                          {found.fact}
                        </span>
                      )}
                      <div style={{ fontSize:7, color:C.tx3 }}>JK N/L</div>
                      <div style={{ fontWeight:500, marginBottom:2, fontSize:8 }}>{c.jk_normal} / {c.jk_lembur > 0 ? c.jk_lembur : 0} jam</div>
                      <div style={{ fontSize:7, color:C.tx3 }}>BUYER</div>
                      <div style={{ fontWeight:500, marginBottom:2, fontSize:8 }}>{uniqueBuyers.join(", ") || "-"}</div>
                      <div style={{ fontSize:7, color:C.tx3 }}>QTY (PCS)</div>
                      <div style={{ fontWeight:500, marginBottom:3, fontSize:8 }}>{uniqueBuyers.length ? uniqueBuyers.map(function(b: string) { return qtyMap[b] }).join(", ") : "-"}</div>
                      <div style={{ fontSize:8, fontWeight:700, color:C.gdark, marginBottom:2 }}>BUYER DIST.</div>
                      <DistBar segments={countSegs}/>
                      <div style={{ fontSize:8, fontWeight:700, color:C.gdark, marginTop:4, marginBottom:2 }}>QTY DIST.</div>
                      <DistBar segments={qtySegs}/>
                      <div style={{ fontSize:7, color:C.tx3, marginTop:3 }}>Total: {totalQty} pcs</div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type KalenderProps = {
  loading: boolean
  data: any
  factory: string
  search: string
  setSearch: (v: string) => void
}

function KalenderTable(props: KalenderProps) {
  const { loading, data, factory, search, setSearch } = props
  if (loading) return (
    <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
      Memuat data dari sheet Kalender Planning...
    </div>
  )
  if (!data) return (
    <div style={{ padding:"24px", textAlign:"center", background:C.orp, borderRadius:8, border:"0.5px solid #ffcc80", fontSize:12, color:C.org }}>
      Gagal memuat data. Pastikan sheet Kalender Planning tersedia.
    </div>
  )

  const isAll = factory === "__ALL__"
  const allFactories: string[] = data.factories ?? []

  const allLines: string[] = isAll
    ? Array.from(new Set(allFactories.flatMap(function(f: string) { return data.lines[f] ?? [] })))
        .sort(function(a: string, b: string) { return a.localeCompare(b, undefined, { numeric:true }) })
    : (data.lines[factory] ?? [])

  const weeks: string[] = data.weeks ?? []

  // Gabungkan cells dari semua Factory kalau mode "Semua Line" dipilih.
  // Digabung PER MINGGU (bukan global per-Line) supaya kasus 1 Line pindah Factory
  // antar-minggu (mis. K49 di Factory F minggu 35, lalu pindah ke Factory K minggu 37) tetap benar,
  // masing-masing minggu tetap mengacu ke Factory yang sesuai untuk minggu itu.
  const cellsForFactory: Record<string, Record<string, any>> = isAll
    ? allFactories.reduce(function(acc: any, f: string) {
        const byWeek = data.cells[f] ?? {}
        Object.keys(byWeek).forEach(function(w: string) {
          if (!acc[w]) acc[w] = {}
          Object.keys(byWeek[w]).forEach(function(line: string) {
            // Tandai Factory asal per cell (dipakai buat badge di mode "Semua Line")
            acc[w][line] = Object.assign({}, byWeek[w][line], { _fact: f })
          })
        })
        return acc
      }, {})
    : (data.cells[factory] ?? {})

  const buyerColors = buildBuyerColorMap(data)

  // Legend hanya untuk buyer yang muncul di Factory (atau semua Factory) yang sedang dipilih
  const legendBuyers = Array.from(new Set(
    Object.values(cellsForFactory).flatMap(function(byLine: any) {
      return Object.values(byLine).flatMap(function(c: any) { return c.buyers ?? [] })
    })
  )) as string[]

  // Kalau search mengetik nama buyer, tetap tampilkan semua line yang punya baris cocok di minggu manapun
  const searchedLines = search
    ? allLines.filter(function(l: string) {
        return weeks.some(function(w: string) {
          const c = cellsForFactory[w]?.[l]
          return c && matchSearch({ line:l, buyer:c.buyers.join(" ") }, search)
        })
      })
    : allLines

  const labelColW = 130
  const lineColW  = 190

  const th: React.CSSProperties = {
    position:"sticky", top:0, background:C.gdark, color:"#fff", padding:"6px 10px",
    fontWeight:500, whiteSpace:"nowrap", textAlign:"left", zIndex:2,
    borderRight:"0.5px solid rgba(255,255,255,.15)", borderBottom:"1px solid rgba(255,255,255,.2)",
  }

  return (
    <div>
      <SearchBox value={search} onChange={setSearch} placeholder="Cari line atau buyer..." resultCount={searchedLines.length}/>

      {legendBuyers.length > 1 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:14, alignItems:"center", marginBottom:10, padding:"6px 10px", background:"#f4f7f3", borderRadius:6 }}>
          {legendBuyers.map(function(b: string) {
            return (
              <span key={b} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:C.tx2 }}>
                <span style={{ width:10, height:10, borderRadius:2, background:buyerColors[b] }}/>
                {b}
              </span>
            )
          })}
        </div>
      )}

      {searchedLines.length === 0 ? (
        <div style={{ padding:"24px", textAlign:"center", color:C.tx3, fontSize:12, border:"0.5px solid #c8e6c9", borderRadius:8 }}>
          Tidak ada line/buyer yang cocok dengan pencarian "{search}".
        </div>
      ) : (
      <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9", maxHeight:"calc(100vh - 200px)" }}>
        <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:11, minWidth:"max-content" }}>
          <thead>
            <tr>
              <th style={{ ...th, position:"sticky", left:0, top:0, zIndex:11, minWidth:labelColW, background:"#1b4d24", borderRight:"2px solid rgba(255,255,255,.35)" }}>
                Minggu / Line
              </th>
              {searchedLines.map(function(l: string) {
                return <th key={l} style={{ ...th, minWidth:lineColW }}>{"Line " + l}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {weeks.map(function(w: string, wi: number) {
              const bg = wi % 2 === 0 ? "#e8f5e9" : "#fff"
              return (
                <tr key={w}>
                  <td style={{
                    position:"sticky", left:0, zIndex:1, background:bg, padding:"8px 10px",
                    borderRight:"2px solid #4caf50", borderBottom:"0.5px solid #cfe0cc", minWidth:labelColW,
                  }}>
                    <div style={{ fontWeight:600, color:C.gdark }}>Minggu {w}</div>
                  </td>
                  {searchedLines.map(function(l: string) {
                    const c = cellsForFactory[w]?.[l]
                    if (!c) {
                      return (
                        <td key={l} style={{ background:bg, padding:"8px 10px", borderRight:"0.5px solid #cfe0cc", borderBottom:"0.5px solid #cfe0cc", verticalAlign:"top", minWidth:lineColW }}>
                          <span style={{ color:C.tx3, fontSize:10 }}>-</span>
                        </td>
                      )
                    }
                    const { countMap, qtyMap, uniqueBuyers, totalCount, totalQty } = buyerBreakdown(c)
                    const countSegs = uniqueBuyers.map(function(b: string) {
                      const pct = (countMap[b] / totalCount) * 100
                      return { color:buyerColors[b], pct, label: b + ": " + countMap[b] + " order (" + pct.toFixed(0) + "%)" }
                    })
                    const qtySegs = uniqueBuyers.map(function(b: string) {
                      const pct = totalQty > 0 ? (qtyMap[b] / totalQty) * 100 : 0
                      return { color:buyerColors[b], pct, label: b + ": " + qtyMap[b] + " pcs (" + pct.toFixed(0) + "%)" }
                    })
                    return (
                      <td key={l} style={{ background:bg, padding:"8px 10px", borderRight:"0.5px solid #cfe0cc", borderBottom:"0.5px solid #cfe0cc", verticalAlign:"top", minWidth:lineColW }}>
                        {isAll && c._fact && (
                          <span style={{ display:"inline-block", fontSize:9, fontWeight:600, color:"#fff", background:C.gdark, padding:"1px 6px", borderRadius:4, marginBottom:5 }}>
                            Factory {c._fact}
                          </span>
                        )}
                        <div style={{ fontSize:9, color:C.tx3, textTransform:"uppercase" }}>JK Normal</div>
                        <div style={{ fontWeight:500, marginBottom:4 }}>{c.jk_normal} jam</div>
                        <div style={{ fontSize:9, color:C.tx3, textTransform:"uppercase" }}>JK Lembur</div>
                        <div style={{ fontWeight:500, marginBottom:6, color: c.jk_lembur > 0 ? C.org : C.tx3 }}>{c.jk_lembur > 0 ? c.jk_lembur + " jam" : "-"}</div>

                        <div style={{ fontSize:9, color:C.tx3, textTransform:"uppercase" }}>Buyer</div>
                        <div style={{ fontWeight:500, marginBottom:6 }}>{uniqueBuyers.length ? uniqueBuyers.join(", ") : "-"}</div>

                        <div style={{ fontSize:9, color:C.tx3, textTransform:"uppercase" }}>Qty (pcs)</div>
                        <div style={{ fontWeight:500, marginBottom:6 }}>{uniqueBuyers.length ? uniqueBuyers.map(function(b: string) { return qtyMap[b] }).join(", ") : "-"}</div>

                        <div style={{ fontSize:10, fontWeight:700, color:C.gdark, textTransform:"uppercase", marginBottom:4 }}>Buyer Distribution</div>
                        <DistBar segments={countSegs}/>
                        <div style={{ fontSize:10, fontWeight:700, color:C.gdark, textTransform:"uppercase", marginTop:8, marginBottom:4 }}>Qty Distribution</div>
                        <DistBar segments={qtySegs}/>
                        <div style={{ fontSize:9, color:C.tx3, marginTop:6 }}>Total Qty: {totalQty} pcs</div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
      <div style={{ marginTop:6, fontSize:9, color:C.tx3, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
        <span>Freeze kolom Minggu / Line di kiri</span>
        {data?.fetched_epoch && <span style={{ marginLeft:"auto" }}>Update: {ageLabel(data.fetched_epoch)}</span>}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [page,       setPage]       = useState<Page>("todo")
  const [user,       setUser]       = useState<User|null>(null)
  const [perms,      setPerms]      = useState<Perms>({ canRefreshAI:false, canChat:false, canBalancing:false, canToggleAI:false, canTodo:false })
  const [kpi,        setKpi]        = useState<any>({})
  const [cache,      setCache]      = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [todos,      setTodos]      = useState<Todo[]>([])
  const [newTodo,    setNewTodo]    = useState("")
  const [showAddTodo,setShowAddTodo]= useState(false)
  const [todoPageData,  setTodoPageData]  = useState<any>(null)
  const [planDstData,   setPlanDstData]   = useState<any>(null)
  const [planDstFactory,setPlanDstFactory]= useState("K")
  const [planDstLoading,setPlanDstLoading]= useState(false)
  const [planDstSearch, setPlanDstSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo,   setDateTo]   = useState("")
  const [planSewData,   setPlanSewData]   = useState<any>(null)
  const [planSewFactory,setPlanSewFactory]= useState("K")
  const [planSewLoading,setPlanSewLoading]= useState(false)
  const [planSewSearch, setPlanSewSearch] = useState("")
  const [kalenderData,   setKalenderData]   = useState<any>(null)
  const [kalenderLoading,setKalenderLoading]= useState(false)
  const [kalenderFactory,setKalenderFactory]= useState("K")
  const [kalenderSearch, setKalenderSearch] = useState("")
  const [rekapWeekFrom, setRekapWeekFrom] = useState("")
  const [rekapWeekTo,   setRekapWeekTo]   = useState("")
  const [expShow,     setExpShow]     = useState(false)
  const [expMode,     setExpMode]     = useState<"line"|"buyer"|"factory">("line")
  const [expWeekFrom, setExpWeekFrom] = useState("")
  const [expWeekTo,   setExpWeekTo]   = useState("")
  const [expLines,    setExpLines]    = useState<string[]>([])
  const [expBuyers,   setExpBuyers]   = useState<string[]>([])
  const [expFactories,setExpFactories]= useState<string[]>([])
  const [expBusy,      setExpBusy]     = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [shipmentData,  setShipmentData]  = useState<any>(null)
  const [shipmentLoading,setShipmentLoading] = useState(false)
  const [shipmentSearch, setShipmentSearch]  = useState("")
  const [matSetData,    setMatSetData]    = useState<any>(null)
  const [matSetLoading, setMatSetLoading] = useState(false)
  const [matSetFact,    setMatSetFact]    = useState("all")
  const [matSetSearch,  setMatSetSearch]  = useState("")
  
  
  
  const [waSending,     setWaSending]     = useState(false)
  const [waResult,      setWaResult]      = useState<{ok:boolean;msg:string}|null>(null)
  const [shipmentBuyers, setShipmentBuyers] = useState<string[]>([])
  const [shipmentWeeks,  setShipmentWeeks]  = useState<number[]>([])
  const [shipmentBuyerOpen, setShipmentBuyerOpen] = useState(false)
  const [shipmentWeekOpen,  setShipmentWeekOpen]  = useState(false)
  const [jobdescs,       setJobdescs]       = useState<any[]>([])
  const [todoPageLoading,setTodoPageLoading] = useState(false)
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


  async function fetchTodoPage(forceRefresh: boolean) {
    setTodoPageLoading(true)
    try {
      const url = forceRefresh ? "/api/todo-page?refresh=1" : "/api/todo-page"
      const r   = await fetch(url)
      const d   = await r.json()
      if (d.ok) {
        setTodoPageData(d.data)
      } else {
        console.error("[todo-page] error:", d.error)
      }
    } catch(e) {
      console.error("[todo-page] fetch failed:", e)
    } finally {
      setTodoPageLoading(false)
    }
  }

  useEffect(function() {
    if (page !== "todo") return
    fetchJobdescs()
    if (todoPageData) return
    fetchTodoPage(false)
  }, [page, todoPageData])

  useEffect(function() {
    fetchJobdescs()
  }, [])

  function fetchJobdescs() {
    const tz = new Date().getTimezoneOffset()
    fetch("/api/jobdesc?tz=" + tz)
      .then(function(r) { return r.json() })
      .then(function(d) {
        if (!d.ok) return
        const items = d.items ?? []
        setJobdescs(items)
        // Init: simpan text ke cache agar carry-over bisa rebuild
        if (items.length > 0) {
          fetch("/api/jobdesc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action:"init", items }),
          }).catch(function() {})
        }
      })
      .catch(function() {})
  }

  async function sendWaAlert() {
    if (waSending) return
    setWaSending(true)
    setWaResult(null)
    try {
      const r = await fetch("/api/send-alert", { method:"POST" })
      const d = await r.json()
      setWaResult({ ok:d.ok, msg: d.ok ? d.message : (d.error ?? "Gagal mengirim") })
    } catch(e: any) {
      setWaResult({ ok:false, msg:"Network error: " + e.message })
    } finally {
      setWaSending(false)
      setTimeout(function() { setWaResult(null) }, 5000)
    }
  }

  async function handleToggleJobdesc(id: string, text: string) {
    if (!user || user.role === "viewer") return
    await fetch("/api/jobdesc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action:"toggle", id, text }),
    })
    fetchJobdescs()
  }

  useEffect(function() {
    if (page !== "plandst") return
    if (planDstData) return
    setPlanDstLoading(true)
    fetch("/api/plan-dst")
      .then(function(r) { return r.json() })
      .then(function(d) { if (d.ok) setPlanDstData(d.data) })
      .catch(function() {})
      .finally(function() { setPlanDstLoading(false) })
  }, [page, planDstData])

  useEffect(function() {
    if (page !== "plandst") return
    if (planSewData) return
    setPlanSewLoading(true)
    fetch("/api/plan-sew")
      .then(function(r) { return r.json() })
      .then(function(d) { if (d.ok) setPlanSewData(d.data) })
      .catch(function() {})
      .finally(function() { setPlanSewLoading(false) })
  }, [page, planSewData])

  useEffect(function() {
    if (page !== "shipment") return
    if (shipmentData) return
    setShipmentLoading(true)
    fetch("/api/shipment-set")
      .then(function(r) { return r.json() })
      .then(function(d) { if (d.ok) setShipmentData(d.data) })
      .catch(function() {})
      .finally(function() { setShipmentLoading(false) })
  }, [page, shipmentData])

  useEffect(function() {
    if (page !== "matset") return
    if (matSetData) return
    setMatSetLoading(true)
    fetch("/api/material-set")
      .then(function(r) { return r.json() })
      .then(function(d) { if (d.ok) setMatSetData(d.data) })
      .catch(function() {})
      .finally(function() { setMatSetLoading(false) })
  }, [page, matSetData])

  useEffect(function() {
    if (page !== "kalender") return
    if (kalenderData) return
    setKalenderLoading(true)
    fetch("/api/kalender-planning")
      .then(function(r) { return r.json() })
      .then(function(d) { if (d.ok) setKalenderData(d.data) })
      .catch(function() {})
      .finally(function() { setKalenderLoading(false) })
  }, [page, kalenderData])

  useEffect(function() { aiBottom.current?.scrollIntoView({ behavior:"smooth" }) }, [aiMsgs, aiTyping])
  useEffect(function() { balBottom.current?.scrollIntoView({ behavior:"smooth" }) }, [balMsgs, balTyping])

  async function handleRefresh() {
    if (refreshing) return
    if (!perms.canRefreshAI) { alert("Role Anda tidak bisa melakukan Refresh AI. Hubungi admin jika perlu akses ini."); return }
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
      setKpi(rest)
      // Override cached_at dengan waktu lokal agar akurat
      setCache(Object.assign({}, _cache, {
        has_cache : true,
        cached_at : new Date().toLocaleString("id-ID", { timeZone:"Asia/Jakarta" }),
        age_label : "baru saja",
      }))
      setTodoPageData(null)
      try { await fetchTodoPage(true) } catch(e) { console.error("fetchTodoPage failed:", e) }
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
      padding:"6px 14px", fontSize:11, cursor:"pointer",
      display:"flex", alignItems:"center", gap:5,
      color: active ? "#fff" : C.gdark,
      fontWeight: 500,
      background: active ? C.gdark : "transparent",
      border:"none",
      borderRadius:999,
      whiteSpace:"nowrap" as const,
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

  function fmtNum(v: number | string | null | undefined, opts?: { red?: boolean }): React.ReactNode {
    const n = typeof v === "string" ? parseFloat(v.replace(/[.,]/g,"")) : (v ?? 0)
    if (!n && n !== 0) return null
    if (n === 0) return null
    const abs = Math.abs(n).toLocaleString("en-US")
    if (n < 0) {
      return <span style={{ color:"#c62828" }}>({abs})</span>
    }
    return <span>{abs}</span>
  }

  function CheckRow(props: { done: boolean; text: string; badge: string; badgeColor: string; badgeBg: string; canClick: boolean; onClick: () => void; carryDate?: string }) {
    return (
      <div onClick={props.canClick ? props.onClick : undefined}
        style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"6px 9px", borderRadius:7, marginBottom:4, border:"0.5px solid #c8e6c9", background:props.done?"#f1f8f2":"#fff", cursor:props.canClick?"pointer":"default", opacity:props.done?0.6:1 }}>
        <div style={{ width:16, height:16, borderRadius:4, border:"1.5px solid " + C.gmid, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:1, background:props.done?C.gmid:"transparent" }}>
          {props.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:11, color:C.txt, lineHeight:1.5, textDecoration:props.done?"line-through":"none" }}>{props.text}</div>
          {props.carryDate && !props.done && <div style={{ fontSize:9, color:C.org, marginTop:1 }}>Belum selesai sejak {props.carryDate}</div>}
        </div>
        <span style={{ fontSize:9, padding:"1px 6px", borderRadius:8, fontWeight:500, flexShrink:0, background:props.badgeBg, color:props.badgeColor }}>{props.badge}</span>
      </div>
    )
  }

  const TodoList = function() {
    const canClick = perms.canTodo
    const todayYMD = new Date().toISOString().slice(0, 10)

    const byType: Record<string, any[]> = { monthly:[], weekly:[], daily:[] }
    jobdescs.forEach(function(j) { if (byType[j.type]) byType[j.type].push(j) })

    // Header selalu tampil, tapi Monthly & Weekly skip jika kosong
    const sections = [
      { key:"monthly", label:"Monthly",       badge:"Monthly", bg:"#e3f2fd", col:"#1565c0", alwaysShow:true, emptyMsg:"Monthly Tasks Completed" },
      { key:"weekly",  label:"Weekly",        badge:"Weekly",  bg:"#e8f5e9", col:C.gdark,  alwaysShow:true, emptyMsg:"Weekly Tasks Completed"  },
      { key:"daily",   label:"Daily",         badge:"Daily",   bg:"#fff3e0", col:C.org,    alwaysShow:true, emptyMsg:"Daily Tasks Completed"   },
      { key:"focus",   label:"Focus & Action",badge:"AI",      bg:C.tlp,     col:C.teal,   alwaysShow:true, emptyMsg:""                        },
    ]

    return (
      <div>
        {sections.map(function(sec, si) {
          const isFocus = sec.key === "focus"
          const items   = isFocus ? todos : (byType[sec.key] ?? [])
          const isEmpty = items.length === 0

          if (!sec.alwaysShow && isEmpty) return null

          return (
            <div key={sec.key} style={{ marginTop: si > 0 ? 6 : 0 }}>
              {/* Header section */}
              <div style={{ fontSize:9, fontWeight:500, letterSpacing:".07em", textTransform:"uppercase", color:C.tx3, padding:"5px 0 3px", borderBottom:"0.5px solid #c8e6c9", marginBottom:4, display:"flex", justifyContent:"space-between" }}>
                <span>{sec.label}</span>
                {isEmpty && (sec as any).emptyMsg && <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0, color:C.gdark }}>{(sec as any).emptyMsg}</span>}
              </div>

              {/* Items */}
              {!isFocus && items.map(function(j: any) {
                const isCarry = j.created_date && j.created_date !== todayYMD
                return (
                  <CheckRow key={j.id}
                    done={j.done} text={j.text}
                    badge={sec.badge} badgeColor={sec.col} badgeBg={sec.bg}
                    canClick={canClick}
                    onClick={function() { handleToggleJobdesc(j.id, j.text) }}
                    carryDate={isCarry ? j.created_date : undefined}
                  />
                )
              })}

              {isFocus && (
                <div>
                  {isEmpty && (
                    <div style={{ fontSize:11, color:C.tx3, padding:"6px 0", fontStyle:"italic" }}>
                      {perms.canRefreshAI ? "Klik Refresh Analisis AI untuk generate." : "Menunggu Admin refresh pagi ini."}
                    </div>
                  )}
                  {todos.map(function(t: any) {
                    return (
                      <CheckRow key={t.id}
                        done={t.done} text={t.text}
                        badge={t.source==="ai"?"AI":t.priority==="urgent"?"Urgent":"Manual"}
                        badgeColor={t.source==="ai"?C.teal:t.priority==="urgent"?C.red:C.tx3}
                        badgeBg={t.source==="ai"?C.tlp:t.priority==="urgent"?C.rdp:C.gpale}
                        canClick={canClick}
                        onClick={function() { handleToggleTodo(t.id) }}
                      />
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
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"system-ui,sans-serif", background:C.bg }}>

      {/* Header + Tabs (satu baris) */}
      <div style={{ background:"#eef3ec", padding:"8px 16px", display:"flex", alignItems:"center", gap:16, flexShrink:0, flexWrap:"wrap", borderBottom:"1px solid #c8d6c4" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"#fff", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, padding:3, border:"0.5px solid #c8d6c4" }}>
            <Image src="/Logo.png" alt="Logo" width={30} height={30} style={{ objectFit:"contain" }} priority/>
          </div>
          <div>
            <div style={{ color:C.gdark, fontSize:14, fontWeight:600, lineHeight:1.2 }}>Production Planning</div>
            <div style={{ color:C.tx3, fontSize:10, lineHeight:1.2, marginTop:1 }}>PT. Adira Semesta Industry</div>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:2, flexWrap:"wrap", background:"#e3ebe0", borderRadius:999, padding:4 }}>
          {([
            ["todo","To-Do & Concern"],
            ["plandst","Planning"],
            ["kalender","Kalender Planning"],
            ["matset","Material"],
            ["shipment","Shipment"],
            ["sim","Planning Simulation"],
            ["ai","Chat AI"],
          ] as [Page,string][]).map(function([p,label]) {
            return (
              <button key={p} onClick={function() { setPage(p) }} style={tabStyle(p)}>
                {label}
              </button>
            )
          })}
        </div>

        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, flexShrink:0, background:"#e3ebe0", borderRadius:999, padding:"4px 8px" }}>
          <span style={{ background:C.glight, color:"#fff", fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:500 }}>Live</span>
          <span style={{ color:C.tx3, fontSize:11 }}>{clock}</span>
          <button onClick={handleRefresh} disabled={refreshing}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 14px 4px 4px", borderRadius:999, border:"none", cursor:refreshing?"not-allowed":"pointer", background:"#cfe0cb" }}>
            <span style={{ width:24, height:24, borderRadius:"50%", background:refreshing?"#388e3c":C.gdark, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </span>
            <span style={{ color:C.gdark, fontSize:12, fontWeight:600 }}>{refreshing ? "Memuat..." : "Refresh AI"}</span>
          </button>
          <button onClick={async function() { await fetch("/api/auth/logout",{method:"POST"}); router.push("/login") }}
            title="Keluar" aria-label="Keluar"
            style={{ display:"flex", alignItems:"center", justifyContent:"center", width:28, height:28, background:"transparent", border:"none", cursor:"pointer", color:C.gdark }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>

        {/* == PLANNING TO-DO & CONCERN == */}
        {page==="todo" && (
          <div>
            {todoPageLoading && (
              <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
                Memuat data dari spreadsheet...
              </div>
            )}

            {!todoPageLoading && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>

                {/* Plan To-Do */}
                <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden" }}>
                  <div style={{ background:C.gdark, padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ color:"#fff", fontSize:11, fontWeight:500 }}>Plan To-Do Hari Ini</span>
                    <span style={{ color:"#a5d6a7", fontSize:9, marginLeft:"auto" }}>{new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}</span>
                  </div>
                  <div style={{ padding:"10px 12px" }}>
                    <TodoList/>
                  </div>
                </div>

                {/* Concern Planning dari sheet Alerts */}
                <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden" }}>
                  <div style={{ background:"#e65100", padding:"8px 12px", display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ color:"#fff", fontSize:11, fontWeight:500 }}>Concern Planning</span>
                    <span style={{ color:"#ffcc80", fontSize:9, marginLeft:"auto" }}>
                      {todoPageData?.alerts?.length ?? 0} item aktif
                    </span>
                    {(todoPageData?.alerts?.length ?? 0) > 0 && (perms.canRefreshAI || user?.role==="planning") && (
                      <button onClick={sendWaAlert} disabled={waSending}
                        title="Kirim daftar concern ke WhatsApp grup"
                        style={{ fontSize:9, padding:"2px 9px", borderRadius:10, border:"none",
                          background: waSending ? "rgba(255,255,255,.4)" : "rgba(255,255,255,.9)",
                          color:"#e65100", cursor:waSending?"not-allowed":"pointer",
                          fontWeight:600, display:"flex", alignItems:"center", gap:3, flexShrink:0 }}>
                        {waSending ? "Mengirim..." : "[WA] Kirim Alert"}
                      </button>
                    )}
                  </div>
                  {waResult && (
                    <div style={{ padding:"5px 12px", fontSize:10,
                      background: waResult.ok ? "#e8f5e9" : "#ffebee",
                      color: waResult.ok ? "#1a5c2a" : "#c62828",
                      borderBottom:"0.5px solid rgba(0,0,0,.06)" }}>
                      {waResult.ok ? "[OK] " : "[!] "}{waResult.msg}
                    </div>
                  )}
                  <div style={{ overflowY:"auto", maxHeight:420 }}>
                    {!todoPageData ? (
                      <div style={{ padding:12, fontSize:11, color:C.tx3, textAlign:"center" }}>Memuat data alerts...</div>
                    ) : todoPageData.alerts.length === 0 ? (
                      <div style={{ padding:16, fontSize:11, color:C.tx3, textAlign:"center" }}>
                        Tidak ada concern aktif
                      </div>
                    ) : (
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10 }}>
                        <thead>
                          <tr>
                            {["SPO","Style","Start DST","Concern"].map(function(h) {
                              return (
                                <th key={h} style={{ background:"#bf360c", color:"#fff", padding:"5px 8px", textAlign:"left", fontWeight:500, fontSize:9, whiteSpace:"nowrap" }}>
                                  {h}
                                </th>
                              )
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {todoPageData.alerts.map(function(a: any, i: number) {
                            return (
                              <tr key={i} style={{ background:i%2===0?"#fff":"#fff8f5" }}>
                                <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #ffe0cc", fontWeight:500, color:C.org, whiteSpace:"nowrap" }}>{a.spo || "--"}</td>
                                <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #ffe0cc", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={a.style}>{a.style || "--"}</td>
                                <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #ffe0cc", whiteSpace:"nowrap", color:C.red, fontWeight:500 }}>{a.start_dst || "--"}</td>
                                <td style={{ padding:"6px 8px", borderBottom:"0.5px solid #ffe0cc", color:C.tx2, fontStyle:"italic" }}>{a.concern || "--"}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {todoPageData && (
                    <div style={{ padding:"6px 10px", fontSize:9, color:C.tx3, borderTop:"0.5px solid #ffe0cc", display:"flex", justifyContent:"space-between" }}>
                      <span>Dari sheet: Alerts</span>
                      <span>
                        {todoPageData.fetched_epoch
                          ? ageLabel(todoPageData.fetched_epoch)
                          : todoPageData.fetched_at}
                      </span>
                    </div>
                  )}
                  {!todoPageData && (
                    <div style={{ padding:"6px 10px", fontSize:9, color:C.tx3, borderTop:"0.5px solid #ffe0cc" }}>
                      Memuat data...
                    </div>
                  )}
                </div>

                {/* Status Analisis AI - KPI & Scorecard */}
                <div style={{ background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, overflow:"hidden" }}>
                  <div style={{ background:C.gdark, padding:"8px 12px" }}>
                    <span style={{ color:"#fff", fontSize:11, fontWeight:500 }}>Status Analisis AI</span>
                  </div>
                  <div style={{ padding:"12px 14px" }}>

                    {/* KPI Score & Scorecard dari sheet KPI&Scorecard */}
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".04em", textTransform:"uppercase", marginBottom:8 }}>KPI & Scorecard</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div style={{ background:C.bg, borderRadius:8, padding:"12px", textAlign:"center", borderLeft:"3px solid " + C.teal }}>
                          <div style={{ fontSize:9, color:C.tx3, marginBottom:4 }}>KPI Score</div>
                          <div style={{ fontSize:22, fontWeight:700, color:C.teal, lineHeight:1 }}>
                            {todoPageData?.kpi?.kpi_score ?? "--"}
                          </div>
                          <div style={{ fontSize:9, color:C.tx3, marginTop:3 }}>dari sheet KPI&Scorecard D2</div>
                        </div>
                        <div style={{ background:C.bg, borderRadius:8, padding:"12px", textAlign:"center", borderLeft:"3px solid " + C.gdark }}>
                          <div style={{ fontSize:9, color:C.tx3, marginBottom:4 }}>Scorecard</div>
                          <div style={{ fontSize:22, fontWeight:700, color:C.gdark, lineHeight:1 }}>
                            {todoPageData?.kpi?.scorecard ?? "--"}
                          </div>
                          <div style={{ fontSize:9, color:C.tx3, marginTop:3 }}>dari sheet KPI&Scorecard K2</div>
                        </div>
                      </div>
                      {todoPageData?.kpi?.fetched_at && (
                        <div style={{ fontSize:9, color:C.tx3, textAlign:"center" }}>
                          {"Data diambil: " + (todoPageData.kpi.fetched_epoch ? ageLabel(todoPageData.kpi.fetched_epoch) : todoPageData.kpi.fetched_at)}
                        </div>
                      )}
                    </div>

                    {/* KPI dari AI analysis */}
                    <div style={{ borderTop:"0.5px solid #c8e6c9", paddingTop:10 }}>
                      <div style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".04em", textTransform:"uppercase", marginBottom:8 }}>Hasil Analisis AI</div>
                      {cache?.has_cache ? (
                        <div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
                            {[
                              { label:"Outstanding SPO",  val:kpi.outstanding_spo_pcs ? Number(kpi.outstanding_spo_pcs).toLocaleString("en-US")+" pcs" : "--", color:C.org },
                              { label:"WIP > 1 Minggu",   val:kpi.wip_over_1week_pcs  ? Number(kpi.wip_over_1week_pcs).toLocaleString("en-US")+" pcs"  : "--", color:C.red },
                              { label:"Lines at Risk",    val:kpi.lines_at_risk != null ? String(kpi.lines_at_risk)+" line" : "--", color:C.red },
                              { label:"Risk Level",       val:kpi.planning_risk_level ?? "--", color:kpi.planning_risk_level==="TINGGI"?C.red:kpi.planning_risk_level==="SEDANG"?C.org:C.gdark },
                            ].map(function(k) {
                              return (
                                <div key={k.label} style={{ background:C.bg, borderRadius:6, padding:"7px 8px" }}>
                                  <div style={{ fontSize:9, color:C.tx3, marginBottom:2 }}>{k.label}</div>
                                  <div style={{ fontSize:12, fontWeight:500, color:k.color }}>{k.val}</div>
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ fontSize:9, color:C.tx3, background:C.bg, borderRadius:6, padding:"6px 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span>Update AI: <strong style={{ color:C.gdark }}>{cache.age_label ?? "baru saja"}</strong></span>
                            <span>oleh <strong style={{ color:C.gdark }}>{cache.cached_by}</strong></span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize:11, color:C.tx3, textAlign:"center", padding:"12px 0" }}>
                          {perms.canRefreshAI ? "Klik Refresh Analisis AI." : "Menunggu Admin refresh pagi ini."}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* == DASHBOARD PLANNING == */}
        {page==="vis" && (
          <div>

            {/* Toolbar Looker */}
            <div style={{ padding:"8px 0", borderBottom:"0.5px solid #c8e6c9", display:"flex", alignItems:"center", gap:10, marginBottom:0 }}>
              <span style={{ fontSize:13, fontWeight:500, color:C.gdark }}>Dashboard Planning</span>
              <span style={{ fontSize:10, background:C.blp, color:C.blue, padding:"2px 8px", borderRadius:10, fontWeight:500 }}>Looker Studio</span>
              <span style={{ fontSize:10, color:C.tx3, marginLeft:"auto" }}>Data dari Google Sheets - 0 token</span>
              <a href={LOOKER_FULL} target="_blank" rel="noreferrer"
                style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:6, border:"0.5px solid #c8e6c9", background:C.bg, color:C.tx2, textDecoration:"none", fontSize:11 }}>
                Buka fullscreen
              </a>
            </div>
            <iframe src={LOOKER_EMBED} width="100%" height="520" style={{ border:"none", display:"block" }} allowFullScreen title="Dashboard Planning"/>
          </div>
        )}

        {/* == PLANNING (Distribusi di atas, Sewing di bawah) == */}
        {page==="plandst" && (
          <div>
            <DateRangeFilter from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo}/>

            {/* -- Planning Distribusi -- */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".05em", textTransform:"uppercase" }}>Planning Distribusi - Plan DST</span>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {planDstData?.factories?.map(function(f: string) {
                  return (
                    <button key={f} onClick={function() { setPlanDstFactory(f) }}
                      style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9",
                        background:planDstFactory===f?C.gdark:"#fff",
                        color:planDstFactory===f?"#fff":C.tx2, cursor:"pointer" }}>
                      Line {f}
                    </button>
                  )
                })}
                <button onClick={function() { setPlanDstData(null) }}
                  style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.tx2, cursor:"pointer" }}>
                  Refresh
                </button>
              </div>
            </div>
            <PlanDstTable loading={planDstLoading} data={planDstData} factory={planDstFactory} search={planDstSearch} setSearch={setPlanDstSearch} dateFrom={dateFrom} dateTo={dateTo}/>

            {/* -- Divider antar section -- */}
            <div style={{ height:1, background:"#c8e6c9", margin:"20px 0" }}/>

            {/* -- Planning Sewing -- */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".05em", textTransform:"uppercase" }}>Planning Sewing - Plan SEW</span>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {planSewData?.factories?.map(function(f: string) {
                  return (
                    <button key={f} onClick={function() { setPlanSewFactory(f) }}
                      style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9",
                        background:planSewFactory===f?C.gdark:"#fff",
                        color:planSewFactory===f?"#fff":C.tx2, cursor:"pointer" }}>
                      Line {f}
                    </button>
                  )
                })}
                <button onClick={function() { setPlanSewData(null) }}
                  style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.tx2, cursor:"pointer" }}>
                  Refresh
                </button>
              </div>
            </div>
            <PlanSewTable loading={planSewLoading} data={planSewData} factory={planSewFactory} search={planSewSearch} setSearch={setPlanSewSearch} dateFrom={dateFrom} dateTo={dateTo}/>
          </div>
        )}

        {/* == KALENDER PLANNING == */}
        {page==="kalender" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".05em", textTransform:"uppercase" }}>Kalender Planning</span>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <button onClick={function() { setKalenderFactory("__ALL__") }}
                  style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9",
                    background:kalenderFactory==="__ALL__"?C.gdark:"#fff",
                    color:kalenderFactory==="__ALL__"?"#fff":C.tx2, cursor:"pointer", fontWeight:500 }}>
                  Semua Line
                </button>
                {kalenderData?.factories?.map(function(f: string) {
                  return (
                    <button key={f} onClick={function() { setKalenderFactory(f) }}
                      style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9",
                        background:kalenderFactory===f?C.gdark:"#fff",
                        color:kalenderFactory===f?"#fff":C.tx2, cursor:"pointer" }}>
                      Line {f}
                    </button>
                  )
                })}
                <button onClick={function() { setKalenderData(null) }}
                  style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.tx2, cursor:"pointer" }}>
                  Refresh
                </button>
                <button onClick={function() { setExpShow(function(v) { return !v }) }}
                  style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:expShow?C.gdark:"#fff", color:expShow?"#fff":C.tx2, cursor:"pointer", fontWeight:500 }}>
                  Export JPG
                </button>
              </div>
            </div>

            {expShow && kalenderData && (function() {
              const allLinesGlobal = (Array.from(new Set(
                (kalenderData.factories ?? []).flatMap(function(f: string) { return kalenderData.lines[f] ?? [] })
              )) as string[]).sort(function(a: string, b: string) { return a.localeCompare(b, undefined, { numeric:true }) })

              const allBuyersGlobal = Array.from(new Set(
                (kalenderData.factories ?? []).flatMap(function(f: string) {
                  return Object.values(kalenderData.cells[f] ?? {}).flatMap(function(byLine: any) {
                    return Object.values(byLine).flatMap(function(c: any) { return c.buyers ?? [] })
                  })
                })
              )) as string[]

              const weekOptions: string[] = kalenderData.weeks ?? []
              const fromIdx = weekOptions.indexOf(expWeekFrom) >= 0 ? weekOptions.indexOf(expWeekFrom) : 0
              const toIdx   = weekOptions.indexOf(expWeekTo)   >= 0 ? weekOptions.indexOf(expWeekTo)   : weekOptions.length - 1
              const lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx)
              const chosenWeeks = weekOptions.slice(lo, hi + 1)

              let exportLines: string[] = []
              let restrictFactories: string[] | undefined = undefined
              let showFactBadge = false

              if (expMode === "line") {
                exportLines = expLines.length ? expLines : allLinesGlobal
              } else if (expMode === "factory") {
                const facts = expFactories.length ? expFactories : (kalenderData.factories ?? [])
                restrictFactories = facts
                showFactBadge = facts.length > 1
                exportLines = (Array.from(new Set(facts.flatMap(function(f: string) { return kalenderData.lines[f] ?? [] }))) as string[])
                  .sort(function(a: string, b: string) { return a.localeCompare(b, undefined, { numeric:true }) })
              } else {
                // mode "buyer": cari Line yang punya minimal 1 buyer terpilih di salah satu minggu terpilih
                const chosenBuyers = expBuyers.length ? expBuyers : allBuyersGlobal
                exportLines = allLinesGlobal.filter(function(l: string) {
                  return chosenWeeks.some(function(w: string) {
                    const found = lookupCell(kalenderData, w, l)
                    return found && found.cell.buyers.some(function(b: string) { return chosenBuyers.includes(b) })
                  })
                })
                showFactBadge = true
              }

              function toggleFrom(list: string[], setList: (v: string[]) => void, item: string) {
                setList(list.includes(item) ? list.filter(function(x) { return x !== item }) : list.concat(item))
              }

              async function handleDownload() {
                setExpBusy(true)
                try {
                  const html2canvas = (await import("html2canvas")).default
                  const el = exportRef.current
                  if (!el) return
                  // Paksa render di lebar & tinggi PENUH konten (bukan cuma area yang kelihatan di layar/viewport),
                  // supaya makin banyak Line yang dipilih, hasil JPG makin landscape ke samping, tidak terpotong.
                  const fullW = el.scrollWidth
                  const fullH = el.scrollHeight
                  const canvas = await html2canvas(el, {
                    backgroundColor:"#ffffff",
                    scale:2,
                    width: fullW,
                    height: fullH,
                    windowWidth: fullW,
                    windowHeight: fullH,
                    scrollX: 0,
                    scrollY: 0,
                  })
                  const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
                  const a = document.createElement("a")
                  const fname = "kalender-planning_" + expMode + "_W" + (chosenWeeks[0] ?? "") + "-W" + (chosenWeeks[chosenWeeks.length-1] ?? "") + ".jpg"
                  a.href = dataUrl
                  a.download = fname
                  a.click()
                } catch (e) {
                  alert("Gagal membuat JPG. Coba lagi.")
                } finally {
                  setExpBusy(false)
                }
              }

              return (
                <div style={{ background:"#f4f7f3", border:"0.5px solid #c8e6c9", borderRadius:8, padding:12, marginBottom:12 }}>
                  <div style={{ display:"flex", gap:6, marginBottom:10 }}>
                    {([["line","By Line"],["buyer","By Buyer"],["factory","By Factory"]] as [typeof expMode, string][]).map(function([m, label]) {
                      return (
                        <button key={m} onClick={function() { setExpMode(m) }}
                          style={{ fontSize:10, padding:"4px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:expMode===m?C.gdark:"#fff", color:expMode===m?"#fff":C.tx2, cursor:"pointer" }}>
                          {label}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:9, color:C.tx3, textTransform:"uppercase", marginBottom:4 }}>Rentang Minggu</div>
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <select value={expWeekFrom || weekOptions[0] || ""} onChange={function(e) { setExpWeekFrom(e.target.value) }}
                          style={{ fontSize:11, padding:"4px 6px", border:"0.5px solid #c8e6c9", borderRadius:4 }}>
                          {weekOptions.map(function(w: string) { return <option key={w} value={w}>Minggu {w}</option> })}
                        </select>
                        <span style={{ fontSize:10, color:C.tx3 }}>s/d</span>
                        <select value={expWeekTo || weekOptions[weekOptions.length-1] || ""} onChange={function(e) { setExpWeekTo(e.target.value) }}
                          style={{ fontSize:11, padding:"4px 6px", border:"0.5px solid #c8e6c9", borderRadius:4 }}>
                          {weekOptions.map(function(w: string) { return <option key={w} value={w}>Minggu {w}</option> })}
                        </select>
                      </div>
                    </div>

                    <div style={{ flex:1, minWidth:220 }}>
                      <div style={{ fontSize:9, color:C.tx3, textTransform:"uppercase", marginBottom:4 }}>
                        {expMode === "line" ? "Pilih Line (kosongkan = semua)" : expMode === "buyer" ? "Pilih Buyer (kosongkan = semua)" : "Pilih Factory (kosongkan = semua)"}
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5, maxHeight:80, overflowY:"auto" }}>
                        {(expMode === "line" ? allLinesGlobal : expMode === "buyer" ? allBuyersGlobal : (kalenderData.factories ?? [])).map(function(item: string) {
                          const list  = expMode === "line" ? expLines : expMode === "buyer" ? expBuyers : expFactories
                          const setFn = expMode === "line" ? setExpLines : expMode === "buyer" ? setExpBuyers : setExpFactories
                          const active = list.includes(item)
                          return (
                            <button key={item} onClick={function() { toggleFrom(list, setFn, item) }}
                              style={{ fontSize:10, padding:"3px 8px", borderRadius:6, border:"0.5px solid #c8e6c9", background:active?C.gdark:"#fff", color:active?"#fff":C.tx2, cursor:"pointer" }}>
                              {item}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize:9, color:C.tx3, marginBottom:6 }}>
                    Preview: {chosenWeeks.length} minggu &times; {exportLines.length} line
                  </div>

                  <div style={{ overflowX:"auto", border:"0.5px solid #c8e6c9", borderRadius:6, background:"#fff" }}>
                    <div ref={exportRef}>
                      <ExportTable data={kalenderData} weeks={chosenWeeks} lines={exportLines} restrictFactories={restrictFactories} showFactBadge={showFactBadge}/>
                    </div>
                  </div>

                  <button onClick={handleDownload} disabled={expBusy}
                    style={{ marginTop:10, fontSize:11, fontWeight:600, padding:"7px 16px", borderRadius:6, border:"none", background:C.gdark, color:"#fff", cursor:expBusy?"not-allowed":"pointer" }}>
                    {expBusy ? "Membuat JPG..." : "Download JPG"}
                  </button>
                </div>
              )
            })()}

            <KalenderTable loading={kalenderLoading} data={kalenderData} factory={kalenderFactory} search={kalenderSearch} setSearch={setKalenderSearch}/>

            {/* == REKAP BUYER (agregat, exclude Line K12 & A27) == */}
            {kalenderData && (function() {
              const EXCLUDE_LINES = ["K12", "A27"]
              const weekOptions: string[] = kalenderData.weeks ?? []
              const fromIdx = weekOptions.indexOf(rekapWeekFrom) >= 0 ? weekOptions.indexOf(rekapWeekFrom) : 0
              const toIdx   = weekOptions.indexOf(rekapWeekTo)   >= 0 ? weekOptions.indexOf(rekapWeekTo)   : weekOptions.length - 1
              const lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx)
              const chosenWeeks = weekOptions.slice(lo, hi + 1)
              const rekapRows = computeBuyerRekap(kalenderData, chosenWeeks, EXCLUDE_LINES)
              const buyerColors = buildBuyerColorMap(kalenderData)

              return (
                <div style={{ marginTop:20 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, flexWrap:"wrap", gap:8 }}>
                    <span style={{ fontSize:10, fontWeight:600, color:C.tx3, letterSpacing:".05em", textTransform:"uppercase" }}>Rekap Buyer</span>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <span style={{ fontSize:10, color:C.tx3 }}>Rentang Minggu:</span>
                      <select value={rekapWeekFrom || weekOptions[0] || ""} onChange={function(e) { setRekapWeekFrom(e.target.value) }}
                        style={{ fontSize:11, padding:"4px 6px", border:"0.5px solid #c8e6c9", borderRadius:4 }}>
                        {weekOptions.map(function(w: string) { return <option key={w} value={w}>Minggu {w}</option> })}
                      </select>
                      <span style={{ fontSize:10, color:C.tx3 }}>s/d</span>
                      <select value={rekapWeekTo || weekOptions[weekOptions.length-1] || ""} onChange={function(e) { setRekapWeekTo(e.target.value) }}
                        style={{ fontSize:11, padding:"4px 6px", border:"0.5px solid #c8e6c9", borderRadius:4 }}>
                        {weekOptions.map(function(w: string) { return <option key={w} value={w}>Minggu {w}</option> })}
                      </select>
                    </div>
                  </div>

                  <div style={{ fontSize:9, color:C.org, background:"#fff3e0", border:"0.5px solid #ffcc80", borderRadius:6, padding:"5px 10px", marginBottom:10, display:"inline-block" }}>
                    Perhitungan tidak termasuk Line {EXCLUDE_LINES.join(" dan ")} (line cadangan)
                  </div>

                  {rekapRows.length === 0 ? (
                    <div style={{ padding:"20px", textAlign:"center", color:C.tx3, fontSize:12, border:"0.5px solid #c8e6c9", borderRadius:8 }}>
                      Tidak ada data pada rentang minggu ini.
                    </div>
                  ) : (
                  <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9" }}>
                    <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:11, width:"100%", minWidth:520 }}>
                      <thead>
                        <tr>
                          <th style={{ background:C.gdark, color:"#fff", padding:"7px 10px", textAlign:"left" }}>Buyer</th>
                          <th style={{ background:C.gdark, color:"#fff", padding:"7px 10px", textAlign:"right" }}>Qty (pcs)</th>
                          <th style={{ background:C.gdark, color:"#fff", padding:"7px 10px", textAlign:"right" }}>JK Normal (jam)</th>
                          <th style={{ background:C.gdark, color:"#fff", padding:"7px 10px", textAlign:"right" }}>JK Lembur (jam)</th>
                          <th style={{ background:C.gdark, color:"#fff", padding:"7px 10px", textAlign:"right" }}>Jumlah Line</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rekapRows.map(function(r: BuyerRekapRow, i: number) {
                          const bg = i % 2 === 0 ? "#e8f5e9" : "#fff"
                          return (
                            <tr key={r.buyer}>
                              <td style={{ background:bg, padding:"7px 10px", borderBottom:"0.5px solid #cfe0cc" }}>
                                <span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:buyerColors[r.buyer], marginRight:6, verticalAlign:"middle" }}/>
                                <strong style={{ color:C.txt }}>{r.buyer}</strong>
                              </td>
                              <td style={{ background:bg, padding:"7px 10px", borderBottom:"0.5px solid #cfe0cc", textAlign:"right", fontWeight:600, color:C.gdark }}>{r.qty}</td>
                              <td style={{ background:bg, padding:"7px 10px", borderBottom:"0.5px solid #cfe0cc", textAlign:"right" }}>{r.jkNormal}</td>
                              <td style={{ background:bg, padding:"7px 10px", borderBottom:"0.5px solid #cfe0cc", textAlign:"right", color: r.jkLembur > 0 ? C.org : C.tx3 }}>{r.jkLembur > 0 ? r.jkLembur : "-"}</td>
                              <td style={{ background:bg, padding:"7px 10px", borderBottom:"0.5px solid #cfe0cc", textAlign:"right" }}>{r.lineCount}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* == SHIPMENT SET == */}
        {page==="shipment" && (
          <div>
            {/* Toolbar */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, fontWeight:500, color:C.tx3, letterSpacing:".05em", textTransform:"uppercase", flex:1 }}>
                Shipment Set
                {shipmentData?.update_info && (
                  <span style={{ fontWeight:400, marginLeft:8, color:C.org, fontSize:10 }}>
                    {shipmentData.update_info}
                  </span>
                )}
              </span>
              <div style={{ display:"flex", alignItems:"center", gap:8, position:"relative" }}>
                {/* Dropdown Buyer */}
                <span style={{ fontSize:10, color:C.tx3 }}>Buyer:</span>
                <div style={{ position:"relative" }}>
                  <button onClick={function() { setShipmentBuyerOpen(function(v: boolean) { return !v }); setShipmentWeekOpen(false) }}
                    style={{ fontSize:10, padding:"3px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.txt, cursor:"pointer", minWidth:180, textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>
                      {shipmentBuyers.length === 0 ? "Semua Buyer" : shipmentBuyers.length + " buyer dipilih"}
                    </span>
                    <span style={{ fontSize:9, color:C.tx3 }}>{shipmentBuyerOpen ? "^" : "v"}</span>
                  </button>
                  {shipmentBuyerOpen && (
                    <div style={{ position:"absolute", top:"100%", left:0, zIndex:100, background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,.12)", minWidth:220, maxHeight:260, overflowY:"auto", marginTop:2 }}>
                      <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #c8e6c9", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:9, fontWeight:500, color:C.tx3 }}>PILIH BUYER</span>
                        <button onClick={function() { setShipmentBuyers([]) }}
                          style={{ fontSize:9, color:C.org, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                          Reset
                        </button>
                      </div>
                      {(shipmentData?.buyers ?? []).map(function(b: string) {
                        const checked = shipmentBuyers.includes(b)
                        return (
                          <label key={b} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 10px", cursor:"pointer", fontSize:11, color:C.txt, background: checked ? "#f1f8f2" : "transparent" }}
                            onClick={function() {
                              setShipmentBuyers(function(prev: string[]) {
                                return checked ? prev.filter(function(x: string) { return x !== b }) : [...prev, b]
                              })
                            }}>
                            <div style={{ width:14, height:14, borderRadius:3, border:"1.5px solid " + (checked ? C.gmid : "#ccc"), background: checked ? C.gmid : "#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              {checked && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            {b}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Dropdown Week */}
                <span style={{ fontSize:10, color:C.tx3 }}>Week:</span>
                <div style={{ position:"relative" }}>
                  <button onClick={function() { setShipmentWeekOpen(function(v: boolean) { return !v }); setShipmentBuyerOpen(false) }}
                    style={{ fontSize:10, padding:"3px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.txt, cursor:"pointer", minWidth:120, textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                    <span>
                      {shipmentWeeks.length === 0 ? "Semua Week" : shipmentWeeks.map(function(w: number) { return "W"+w }).join(", ")}
                    </span>
                    <span style={{ fontSize:9, color:C.tx3 }}>{shipmentWeekOpen ? "^" : "v"}</span>
                  </button>
                  {shipmentWeekOpen && (
                    <div style={{ position:"absolute", top:"100%", left:0, zIndex:100, background:"#fff", border:"0.5px solid #c8e6c9", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,.12)", minWidth:120, maxHeight:220, overflowY:"auto", marginTop:2 }}>
                      <div style={{ padding:"6px 10px", borderBottom:"0.5px solid #c8e6c9", display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:9, fontWeight:500, color:C.tx3 }}>PILIH WEEK</span>
                        <button onClick={function() { setShipmentWeeks([]) }}
                          style={{ fontSize:9, color:C.org, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                          Reset
                        </button>
                      </div>
                      {(shipmentData?.weeks ?? []).map(function(w: number) {
                        const checked = shipmentWeeks.includes(w)
                        return (
                          <label key={w} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 10px", cursor:"pointer", fontSize:11, color:C.txt, background: checked ? "#f1f8f2" : "transparent" }}
                            onClick={function() {
                              setShipmentWeeks(function(prev: number[]) {
                                return checked ? prev.filter(function(x: number) { return x !== w }) : [...prev, w]
                              })
                            }}>
                            <div style={{ width:14, height:14, borderRadius:3, border:"1.5px solid " + (checked ? C.gmid : "#ccc"), background: checked ? C.gmid : "#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              {checked && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>
                            W{w}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <button onClick={function() { setShipmentData(null) }}
                  style={{ fontSize:10, padding:"3px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.tx2, cursor:"pointer" }}>
                  Refresh
                </button>
              </div>
            </div>

            <DateRangeFilter from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo}/>

            <SearchBox value={shipmentSearch} onChange={setShipmentSearch} placeholder="Cari SPO, style, line, atau buyer..." resultCount={shipmentData ? (shipmentData.rows ?? []).filter(function(r: any) {
              if (shipmentBuyers.length > 0 && !shipmentBuyers.includes(r.buyer)) return false
              if (shipmentWeeks.length  > 0 && !shipmentWeeks.includes(r.week))   return false
              if (!inDateRange(r.export_date, dateFrom, dateTo)) return false
              return matchSearch(r, shipmentSearch)
            }).length : undefined}/>

            {shipmentLoading && (
              <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
                Memuat data dari sheet Shipment Set...
              </div>
            )}

            {!shipmentLoading && !shipmentData && (
              <div style={{ padding:"24px", textAlign:"center", background:C.orp, borderRadius:8, border:"0.5px solid #ffcc80", fontSize:12, color:C.org }}>
                Gagal memuat data. Pastikan sheet Shipment Set tersedia.
              </div>
            )}

            {!shipmentLoading && shipmentData && (function() {
              const WEEK_COLORS = [
                {bg:"#e8f5e9",hl:"#c8e6c9"},
                {bg:"#e3f2fd",hl:"#bbdefb"},
                {bg:"#fff3e0",hl:"#ffe0b2"},
                {bg:"#f3e5f5",hl:"#e1bee7"},
                {bg:"#e0f7fa",hl:"#b2ebf2"},
              ]
              const allWeeks: number[] = shipmentData.weeks ?? []
              const wcMap: Record<number,any> = {}
              allWeeks.forEach(function(w: number, i: number) {
                wcMap[w] = WEEK_COLORS[i % WEEK_COLORS.length]
              })

              const filtered = shipmentData.rows.filter(function(r: any) {
                if (shipmentBuyers.length > 0 && !shipmentBuyers.includes(r.buyer)) return false
                if (shipmentWeeks.length  > 0 && !shipmentWeeks.includes(r.week))   return false
                if (!matchSearch(r, shipmentSearch)) return false
                if (!inDateRange(r.export_date, dateFrom, dateTo)) return false
                return true
              })

              const totalQty = filtered.reduce(function(a: number, r: any) { return a + r.qty_shipment }, 0)
              const totalKK  = filtered.reduce(function(a: number, r: any) { return a + r.kk_dst }, 0)

              const fmtN = function(v: number) {
                if (!v) return null
                const abs = Math.abs(v).toLocaleString("en-US")
                if (v < 0) return <span style={{ color:C.red }}>({abs})</span>
                return <span>{abs}</span>
              }

              return (
                <div>
                  {filtered.length === 0 ? (
                    <div style={{ padding:"24px", textAlign:"center", color:C.tx3, fontSize:12, border:"0.5px solid #c8e6c9", borderRadius:8 }}>
                      Tidak ada baris yang cocok dengan filter/pencarian saat ini.
                    </div>
                  ) : (
                  <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9", maxHeight:"calc(100vh - 200px)" }}>
                    <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:10, minWidth:"max-content" }}>
                      <thead>
                        <tr>
                          {[
                            {h:"Export",              a:"left",   bg:"#1a5c2a", w:70},
                            {h:"Week",                a:"center", bg:"#1a5c2a", w:38},
                            {h:"SPO",                 a:"left",   bg:"#1a5c2a", w:70},
                            {h:"Style",               a:"left",   bg:"#1a5c2a", w:190},
                            {h:"Buyer",               a:"left",   bg:"#1a5c2a", w:120},
                            {h:"Dest. Country",       a:"left",   bg:"#1a5c2a", w:90},
                            {h:"Qty Shipment / pcs",  a:"right",  bg:"#1a5c2a", w:75},
                            {h:"Shipped",             a:"right",  bg:"#1a5c2a", w:60},
                            {h:"KK DST",              a:"right",  bg:"#a32d2d", w:65},
                            {h:"KK Glove",            a:"right",  bg:"#7b1fa2", w:65},
                            {h:"Qty Shipment / Date", a:"right",  bg:"#1a5c2a", w:75},
                            {h:"Kekurangan Env",      a:"right",  bg:"#c62828", w:75},
                            {h:"Kekurangan Inner",    a:"right",  bg:"#c62828", w:75},
                            {h:"Kekurangan Carton",   a:"right",  bg:"#c62828", w:75},
                          ].map(function(col, i) {
                            return (
                              <th key={i} style={{
                                position:"sticky", top:0, zIndex:2,
                                background:col.bg, color:"#fff",
                                padding:"5px 7px", fontWeight:500,
                                whiteSpace:"nowrap", minWidth:col.w,
                                textAlign:col.a as any,
                                borderRight:"0.5px solid rgba(255,255,255,.15)",
                                borderBottom:"1px solid rgba(255,255,255,.2)",
                              }}>
                                {col.h}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(function(r: any, i: number) {
                          const wc  = wcMap[r.week] ?? WEEK_COLORS[0]
                          const prev = i > 0 ? filtered[i-1] : null
                          const weekSep = prev && prev.week !== r.week
                          return (
                            <tr key={i} style={{ borderTop: weekSep ? "2px solid #a5d6a7" : "none" }}>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"left",   whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{r.export_date}</td>
                              <td style={{ background:wc.hl, padding:"5px 7px", textAlign:"center", whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontWeight:500, color:C.gdark, fontSize:10 }}>W{r.week}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"left",   whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", color:C.blue, fontSize:10 }}>{r.spo}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"left",   whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", maxWidth:190, overflow:"hidden", textOverflow:"ellipsis", fontSize:10 }} title={r.style}>{r.style}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"left",   whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{r.buyer}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"left",   whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{r.dest_country}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"right",  whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{r.qty_shipment ? Number(r.qty_shipment).toLocaleString("en-US") : ""}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"right",  whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{r.shipped ? Number(r.shipped).toLocaleString("en-US") : ""}</td>
                              <td style={{ background:"#ffcdd2", padding:"5px 7px", textAlign:"right", whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{fmtN(r.kk_dst)}</td>
                              <td style={{ background:"#e1bee7", padding:"5px 7px", textAlign:"right", whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{fmtN(r.kk_glove)}</td>
                              <td style={{ background:wc.bg, padding:"5px 7px", textAlign:"right",  whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{r.qty_shipment2 ? Number(r.qty_shipment2).toLocaleString("en-US") : ""}</td>
                              <td style={{ background:"#ffcdd2", padding:"5px 7px", textAlign:"right", whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{fmtN(r.kk_env)}</td>
                              <td style={{ background:"#ffcdd2", padding:"5px 7px", textAlign:"right", whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", borderRight:"0.5px solid rgba(180,220,180,.2)", fontSize:10 }}>{fmtN(r.kk_inner)}</td>
                              <td style={{ background:"#ffcdd2", padding:"5px 7px", textAlign:"right", whiteSpace:"nowrap", borderBottom:"0.5px solid #cfe0cc", fontSize:10 }}>{fmtN(r.kk_carton)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                  <div style={{ marginTop:6, fontSize:9, color:C.tx3, display:"flex", gap:16, flexWrap:"wrap", alignItems:"center" }}>
                    <span>Total baris: <strong style={{ color:C.txt }}>{filtered.length}</strong></span>
                    <span>Total Qty: <strong style={{ color:C.gdark }}>{totalQty.toLocaleString("en-US")}</strong></span>
                    <span>KK DST: <strong style={{ color:C.red }}>{totalKK < 0 ? "(" + Math.abs(totalKK).toLocaleString("en-US") + ")" : totalKK.toLocaleString("en-US")}</strong></span>
                    <span style={{ marginLeft:"auto" }}>
                      {shipmentData.fetched_epoch ? "Update: " + ageLabel(shipmentData.fetched_epoch) : ""}
                    </span>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* == MATERIAL SET == */}
        {page==="matset" && (
          <div>
            {/* Toolbar */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, fontWeight:500, color:C.tx3, textTransform:"uppercase", letterSpacing:".05em", flex:1 }}>
                Material Set
                {matSetData?.update_info && (
                  <span style={{ fontWeight:400, marginLeft:8, color:C.org, fontSize:10 }}>
                    {matSetData.update_info}
                  </span>
                )}
              </span>
              <div style={{ display:"flex", gap:5 }}>
                {[{k:"all",l:"Semua"},...(matSetData?.facts??[]).map(function(f:string){return{k:f,l:"Fact "+f}})].map(function(btn:{k:string,l:string}) {
                  return (
                    <button key={btn.k} onClick={function(){setMatSetFact(btn.k)}}
                      style={{ fontSize:10, padding:"3px 10px", borderRadius:6,
                        border:"0.5px solid #c8e6c9",
                        background: matSetFact===btn.k ? C.gdark : "#fff",
                        color: matSetFact===btn.k ? "#fff" : C.tx2, cursor:"pointer" }}>
                      {btn.l}
                    </button>
                  )
                })}
                <button onClick={function(){setMatSetData(null)}}
                  style={{ fontSize:10, padding:"3px 10px", borderRadius:6, border:"0.5px solid #c8e6c9", background:"#fff", color:C.tx2, cursor:"pointer" }}>
                  Refresh
                </button>
              </div>
            </div>

            <DateRangeFilter from={dateFrom} to={dateTo} setFrom={setDateFrom} setTo={setDateTo}/>

            <SearchBox value={matSetSearch} onChange={setMatSetSearch} placeholder="Cari SPO atau style..." resultCount={matSetData ? (matSetData.rows ?? []).filter(function(r:any) {
              if (r.is_total) return false
              if (matSetFact !== "all" && r.fact !== matSetFact) return false
              return matchSearch(r, matSetSearch)
            }).length : undefined}/>

            {matSetLoading && (
              <div style={{ padding:"32px", textAlign:"center", color:C.tx3, fontSize:12 }}>
                Memuat data dari sheet IN Material Produksi...
              </div>
            )}

            {!matSetLoading && matSetData && (function() {
              const dates: string[] = (matSetData.date_headers ?? []).filter(function(d: string) { return inDateRange(d, dateFrom, dateTo) })

              const totalRows = (matSetData.rows ?? []).filter(function(r:any) { return r.is_total })
              const dataRows  = (matSetData.rows ?? []).filter(function(r:any) {
                if (r.is_total) return false
                if (matSetFact === "all") return true
                return r.fact === matSetFact
              }).filter(function(r: any) { return matchSearch(r, matSetSearch) })
              const filtered  = [...totalRows, ...dataRows]

              const fn = function(v: number | string | "") {
                if (v === "" || v === null || v === undefined) return null
                let n: number
                if (typeof v === "string") {
                  const s = v.trim()
                  if (/^\(.*\)$/.test(s)) {
                    n = -parseFloat(s.slice(1,-1).replace(/,/g,""))
                  } else {
                    n = parseFloat(s.replace(/,/g,""))
                  }
                } else { n = v }
                if (isNaN(n)) return null
                if (n === 0) return <span style={{color:C.tx3}}>0</span>
                const abs = Math.abs(n).toLocaleString("en-US")
                if (n < 0) return <span style={{color:C.red,fontWeight:500}}>({abs})</span>
                return <span>{abs}</span>
              }

              // Freeze cols positions (kumulatif px)
              // Freeze hanya sampai kolom L (Start Tekor = index 11)
              // Kolom M+ (Cutoff DST, Saldo dll) scroll bebas
              const FR = [
                {h:"SPO",         w:68,  l:0,   a:"left",   fr:true},
                {h:"Style",       w:130, l:68,  a:"left",   fr:true},
                {h:"Qty Plan",    w:60,  l:198, a:"right",  fr:true},
                {h:"Rencana F.P", w:70,  l:258, a:"left",   fr:true},
                {h:"Fact",        w:36,  l:328, a:"center", fr:true},
                {h:"Kategori",    w:56,  l:364, a:"left",   fr:true},
                {h:"Unit",        w:36,  l:420, a:"center", fr:true},
                {h:"In Kulit",    w:58,  l:456, a:"right",  fr:true, bg:"#1a6b1a"},
                {h:"In Synth",    w:58,  l:514, a:"right",  fr:true, bg:"#1a6b1a"},
                {h:"In Accs",     w:58,  l:572, a:"right",  fr:true, bg:"#7b5e00"},
                {h:"PCS SET",     w:58,  l:630, a:"right",  fr:true, bg:"#7b5e00"},
                {h:"Start Tekor", w:62,  l:688, a:"left",   fr:true, sep:true},
                {h:"Cutoff DST",  w:68,  l:0,   a:"right",  fr:false},
                {h:"Saldo IN Kulit",  w:72, l:0, a:"right", fr:false},
                {h:"Saldo IN Synth",  w:72, l:0, a:"right", fr:false},
                {h:"Saldo IN Set Mat",w:78, l:0, a:"right", fr:false},
                {h:"Saldo IN Accs",   w:70, l:0, a:"right", fr:false},
                {h:"PCS IN SET",      w:68, l:0, a:"right", fr:false},
              ] as {h:string;w:number;l:number;a:string;fr:boolean;bg?:string;sep?:boolean}[]

              const freezeCols = FR.filter(function(c) { return c.fr })
              const scrollCols = FR.filter(function(c) { return !c.fr })

              const sth = function(col:any, i:number, isFr:boolean) {
                const isSep = col.sep === true
                const hdrBg = col.bg ?? "#1a5c2a"
                const base: any = {
                  top:0, zIndex: isFr ? 12+i : 2,
                  background: hdrBg, color:"#fff",
                  padding:"4px 6px", fontWeight:500,
                  whiteSpace:"nowrap" as const, minWidth:col.w, textAlign:col.a as any,
                  borderRight: isSep ? "3px solid rgba(255,255,255,.5)" : "0.5px solid rgba(255,255,255,.15)",
                  borderBottom:"1px solid rgba(255,255,255,.2)",
                  boxShadow: isSep ? "2px 0 4px rgba(0,0,0,.15)" : "none",
                }
                if (isFr) { base.position = "sticky" as const; base.left = col.l }
                else { base.position = "sticky" as const }
                return base
              }

              const std = function(col:any, i:number, bg:string, isFr:boolean) {
                const isSep = col.sep === true
                const base: any = {
                  zIndex: isFr ? 5 : 0,
                  background:bg, padding:"4px 6px",
                  borderBottom:"0.5px solid #cfe0cc",
                  borderRight: isSep ? "3px solid #a5d6a7" : "0.5px solid rgba(180,220,180,.2)",
                  boxShadow: isSep ? "2px 0 4px rgba(0,0,0,.06)" : "none",
                  whiteSpace:"nowrap" as const, minWidth:col.w, textAlign:col.a as any,
                  fontSize:10,
                }
                if (isFr) { base.position = "sticky" as const; base.left = col.l }
                return base
              }

              // Warna tema per Factory (Fact A/F/K/dst), sama seperti pembeda Week di Shipment
              const FACT_COLORS: Record<string, string> = {}
              const FACT_PALETTE = ["#e8f5e9","#e3f2fd","#fff3e0","#f3e5f5","#e0f7fa","#fce4ec"]
              const allFacts: string[] = matSetData.facts ?? []
              allFacts.forEach(function(f: string, i: number) { FACT_COLORS[f] = FACT_PALETTE[i % FACT_PALETTE.length] })

              // Warna header per kolom scroll (Cutoff DST, Saldo dll)
              const SCROLL_HEADER_BG = ["#5c3d00","#1a4d1a","#1a4d1a","#1a3d5c","#1a4d1a","#1a3d1a"]

              return (
                <div>
                  <div style={{ overflowX:"auto", borderRadius:8, border:"0.5px solid #c8e6c9", maxHeight:"calc(100vh - 195px)" }}>
                    <table style={{ borderCollapse:"separate", borderSpacing:0, fontSize:10, minWidth:"max-content" }}>
                      <thead>
                        {/* Baris 1: freeze cols + scroll cols + tanggal */}
                        <tr>
                          {FR.map(function(col,i) {
                            return <th key={i} rowSpan={2} style={Object.assign(sth(col,i,col.fr),
                              col.fr ? {} : {background: SCROLL_HEADER_BG[i-freezeCols.length] ?? "#1a5c2a"}
                            )}>{col.h}</th>
                          })}
                          {dates.map(function(d:string, di:number) {
                            return (
                              <th key={d} colSpan={4} style={{
                                position:"sticky", top:0, zIndex:1,
                                background: (function(){const wib=new Date(Date.now()+7*60*60*1000);const dd=String(wib.getDate()).padStart(2,"0");const mm=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][wib.getMonth()];return d===dd+"-"+mm||d.startsWith(dd+"-"+mm)})() ? "#b34700" : "#245c2a",
                                color:"#fff",
                                padding:"4px 6px", fontWeight:500,
                                textAlign:"center", whiteSpace:"nowrap",
                                borderRight:"2px solid rgba(255,255,255,.3)",
                                borderBottom:"0.5px solid rgba(255,255,255,.2)",
                                minWidth:220,
                              }}>{d}</th>
                            )
                          })}
                        </tr>
                        {/* Baris 2: sub-kolom per tanggal (4 kolom: Plan Dst, Saldo Kulit, Saldo Synth, Saldo Accs) */}
                        <tr>
                          {dates.map(function(d:string, di:number) {
                            const isToday = (function() {
                              const wib = new Date(Date.now() + 7*60*60*1000)
                              const dd  = String(wib.getDate()).padStart(2,"0")
                              const mm  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][wib.getMonth()]
                              return d === dd+"-"+mm || d.startsWith(dd+"-"+mm)
                            })()
                            return ["Plan Dst","Saldo Kulit","Saldo Synth","Saldo Accs"].map(function(s:string, si:number) {
                              return (
                                <th key={d+s} style={{
                                  position:"sticky", top:0, zIndex:1,
                                  background: isToday ? "#e65100" : "#1a5c2a",
                                  color: isToday ? "#fff" : "#a5d6a7",
                                  padding:"3px 6px", fontWeight:400, fontSize:9,
                                  textAlign:"right", whiteSpace:"nowrap", minWidth:56,
                                  borderRight: si===3 ? "2px solid rgba(255,255,255,.35)" : "0.5px solid rgba(255,255,255,.1)",
                                  borderBottom:"1px solid rgba(255,255,255,.2)",
                                }}>{s}</th>
                              )
                            })
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Baris total kumulatif sticky di atas data */}
                        {totalRows.map(function(row:any, ri:number) {
                          const bg = "#e8f5e9"
                          return (
                            <tr key={"tot-"+ri} style={{ position:"sticky" as const, top:57, zIndex:3 }}>
                              <td style={Object.assign(std(FR[0],0,bg,FR[0].fr),{fontWeight:600,fontSize:10,position:"sticky" as const,top:57,zIndex:6})}>{row.spo}</td>
                              <td style={Object.assign(std(FR[1],1,bg,FR[1].fr),{position:"sticky" as const,top:57,zIndex:6})}></td>
                              <td style={Object.assign(std(FR[2],2,bg,FR[2].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.qty_plan)}</td>
                              <td style={Object.assign(std(FR[3],3,bg,FR[3].fr),{position:"sticky" as const,top:57,zIndex:6})}></td>
                              <td style={Object.assign(std(FR[4],4,bg,FR[4].fr),{position:"sticky" as const,top:57,zIndex:6})}>
                                <span style={{background:"#fff3e0",color:C.org,fontSize:8,padding:"1px 5px",borderRadius:6,fontWeight:500}}>{row.fact}</span>
                              </td>
                              <td style={Object.assign(std(FR[5],5,bg,FR[5].fr),{position:"sticky" as const,top:57,zIndex:6})}></td>
                              <td style={Object.assign(std(FR[6],6,bg,FR[6].fr),{position:"sticky" as const,top:57,zIndex:6})}></td>
                              <td style={Object.assign(std(FR[7],7,bg,FR[7].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.in_kulit)}</td>
                              <td style={Object.assign(std(FR[8],8,bg,FR[8].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.in_synth)}</td>
                              <td style={Object.assign(std(FR[9],9,bg,FR[9].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.in_accs)}</td>
                              <td style={Object.assign(std(FR[10],10,bg,FR[10].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.pcs_set)}</td>
                              <td style={Object.assign(std(FR[11],11,bg,FR[11].fr),{position:"sticky" as const,top:57,zIndex:6})}></td>
                              <td style={Object.assign(std(FR[12],12,bg,FR[12].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.cutoff_dst)}</td>
                              <td style={Object.assign(std(FR[13],13,bg,FR[13].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.saldo_kulit)}</td>
                              <td style={Object.assign(std(FR[14],14,bg,FR[14].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.saldo_synth)}</td>
                              <td style={Object.assign(std(FR[15],15,bg,FR[15].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.saldo_set)}</td>
                              <td style={Object.assign(std(FR[16],16,bg,FR[16].fr),{textAlign:"right" as const,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.saldo_accs)}</td>
                              <td style={Object.assign(std(FR[17],17,bg,FR[17].fr),{textAlign:"right" as const,fontWeight:600,color:C.gdark,position:"sticky" as const,top:57,zIndex:6})}>{fn(row.pcs_in_set)}</td>
                              {dates.map(function(d:string, di:number) {
                                const dv = row.dates?.[d] ?? {}
                                const isToday2 = (function() {
                                  const wib = new Date(Date.now() + 7*60*60*1000)
                                  const dd  = String(wib.getDate()).padStart(2,"0")
                                  const mm  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][wib.getMonth()]
                                  return d === dd+"-"+mm || d.startsWith(dd+"-"+mm)
                                })()
                                return ["plan_dst","saldo_kulit","saldo_synth","saldo_accs"].map(function(k:string, ki:number) {
                                  const v   = dv[k]
                                  const n2  = typeof v==="number" ? v : 0
                                  const bgC = isToday2 ? "#fff3e0" : "#e8f5e9"
                                  return (
                                    <td key={d+k} style={{
                                      padding:"4px 6px", fontSize:10, textAlign:"right" as const,
                                      whiteSpace:"nowrap" as const, fontWeight:600,
                                      background:bgC, position:"sticky" as const, top:57, zIndex:2,
                                      borderBottom:"0.5px solid #a5d6a7",
                                      borderRight: ki===3 ? "2px solid #c8e6c9" : "0.5px solid rgba(180,220,180,.2)",
                                      color: n2<0 ? C.red : C.gdark,
                                    }}>
                                      {fn(v)}
                                    </td>
                                  )
                                })
                              })}
                            </tr>
                          )
                        })}
                                                {/* Data rows */}
                        {dataRows.length === 0 && (
                          <tr>
                            <td colSpan={FR.length + dates.length * 4} style={{ padding:"20px", textAlign:"center", color:C.tx3, fontSize:11 }}>
                              Tidak ada baris yang cocok dengan pencarian "{matSetSearch}".
                            </td>
                          </tr>
                        )}
                        {dataRows.map(function(row:any, ri:number) {
                          const bg = FACT_COLORS[row.fact] ?? (ri%2===0?"#fff":"#f9fafb")
                          return (
                            <tr key={ri}>
                              {FR.map(function(col:any, ci:number) {
                                const style = Object.assign(std(col, ci, bg, col.fr), {textAlign: col.a as any})
                                let cell: React.ReactNode = null
                                if      (ci===0)  cell = <span style={{color:C.blue}}>{row.spo}</span>
                                else if (ci===1)  cell = <span title={row.style}>{row.style.length>18?row.style.slice(0,18)+"...":row.style}</span>
                                else if (ci===2)  cell = fn(row.qty_plan)
                                else if (ci===3)  cell = <span style={{fontSize:9,fontStyle:"italic",color:C.tx2}}>{row.fprc}</span>
                                else if (ci===4)  cell = row.fact ? <span style={{background:"#fff3e0",color:C.org,fontSize:8,padding:"1px 5px",borderRadius:6,fontWeight:500}}>{row.fact}</span> : null
                                else if (ci===5)  cell = row.kategori
                                else if (ci===6)  cell = row.unit
                                else if (ci===7)  cell = fn(row.in_kulit)
                                else if (ci===8)  cell = fn(row.in_synth)
                                else if (ci===9)  cell = fn(row.in_accs)
                                else if (ci===10) cell = fn(row.pcs_set)
                                else if (ci===11) cell = <span style={{fontSize:9,color:C.org}}>{row.start_tekor}</span>
                                else if (ci===12) cell = fn(row.cutoff_dst)
                                else if (ci===13) cell = fn(row.saldo_kulit)
                                else if (ci===14) cell = fn(row.saldo_synth)
                                else if (ci===15) cell = fn(row.saldo_set)
                                else if (ci===16) cell = fn(row.saldo_accs)
                                else if (ci===17) cell = <span style={{fontWeight:500,color:C.gdark}}>{fn(row.pcs_in_set)}</span>
                                return <td key={ci} style={style}>{cell}</td>
                              })}
                              {dates.map(function(d:string) {
                                const dv = row.dates?.[d] ?? {}
                                const isToday3 = (function() {
                                  const wib = new Date(Date.now() + 7*60*60*1000)
                                  const dd  = String(wib.getDate()).padStart(2,"0")
                                  const mm  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][wib.getMonth()]
                                  return d === dd+"-"+mm || d.startsWith(dd+"-"+mm)
                                })()
                                return ["plan_dst","saldo_kulit","saldo_synth","saldo_accs"].map(function(k:string, ki:number) {
                                  const v  = dv[k]
                                  const nv = typeof v==="number" ? v : 0
                                  const bgC = isToday3 ? (ri%2===0?"#fff8f2":"#fff3ec") : bg
                                  return (
                                    <td key={d+k} style={{
                                      padding:"4px 6px", fontSize:10, textAlign:"right" as const,
                                      whiteSpace:"nowrap" as const,
                                      background:bgC,
                                      borderBottom:"0.5px solid #cfe0cc",
                                      borderRight: ki===3 ? "2px solid #c8e6c9" : "0.5px solid rgba(180,220,180,.2)",
                                      color: nv<0 ? C.red : "inherit",
                                    }}>
                                      {fn(v)}
                                    </td>
                                  )
                                })
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop:6, fontSize:9, color:C.tx3, display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                    <span><span style={{display:"inline-block",width:10,height:10,background:"#e8f5e9",border:"0.5px solid #a5d6a7",borderRadius:2,verticalAlign:"middle",marginRight:3}}></span>Baris total kumulatif Fact</span>
                    {allFacts.map(function(f: string) {
                      return (
                        <span key={f}><span style={{display:"inline-block",width:10,height:10,background:FACT_COLORS[f],border:"0.5px solid #b0c8ae",borderRadius:2,verticalAlign:"middle",marginRight:3}}></span>Fact {f}</span>
                      )
                    })}
                    <span style={{color:C.red}}>({"{"}angka{"}"})&nbsp;</span><span>= negatif</span>
                    <span style={{marginLeft:"auto"}}>Freeze s/d kolom R (PCS IN SET) &bull; Scroll kanan untuk semua tanggal</span>
                    {matSetData.fetched_epoch && <span>Update: {ageLabel(matSetData.fetched_epoch)}</span>}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* == MATERIAL SET == */}
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
