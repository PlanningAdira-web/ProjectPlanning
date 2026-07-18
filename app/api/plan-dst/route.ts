import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type PlanDSTRow = {
  line    : string
  spo     : string
  style   : string
  qty_order: number
  qty_plan : number
  fprc    : string
  fact    : string
  baru    : string
  dst     : number | ""
  dates   : Record<string, number | "F" | "">
}

export type PlanDSTData = {
  factories   : string[]
  date_headers: string[]
  rows        : Record<string, PlanDSTRow[]>
  fetched_at  : string
  fetched_epoch: number
}

const CACHE_KEY       = "plan_dst_data"
const VALID_FACTORIES = new Set(["A","F","K"])
const MONTHS_EN       = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

function normalizeDate(raw: string): string {
  const s = raw.trim()
  // Format DD-Mon (e.g. "06-Jul") -- sudah clean
  if (/^\d{1,2}-[A-Za-z]{3}$/.test(s)) {
    return String(parseInt(s)).padStart(2,"0") + "-" + s.split("-")[1]
  }
  // Format D-Mon-YY or D-Mon-YYYY (e.g. "7-Jul-26")
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(s)) {
    return s  // pertahankan apa adanya dari header sheet
  }
  // Format DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const parts = s.split("/")
    const d = String(parseInt(parts[0])).padStart(2,"0")
    const m = MONTHS_EN[parseInt(parts[1]) - 1] ?? "?"
    return d + "-" + m
  }
  return s
}

async function fetchPlanDST(): Promise<PlanDSTData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Plan DST",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 2) throw new Error("Sheet 'Plan DST' kosong atau tidak ditemukan")

  // Baris 0 = header
  const header = raw[0].map(function(h: any) { return String(h ?? "").trim() })

  // Cari index kolom tetap berdasar nama
  const idx = function(names: string[]) {
    for (const n of names) {
      const i = header.findIndex(function(h: string) { return h.toLowerCase() === n.toLowerCase() })
      if (i >= 0) return i
    }
    return -1
  }

  const iLine = idx(["LINE","LINE E","INE BAR"])
  const iSPO  = idx(["SPO"])
  const iStyle= idx(["STYLE"])
  const iQtyO = idx(["QTY ORDER"])
  const iQtyP = idx(["QTY PLAN"])
  const iFPRC = idx(["ENCANA F.PRC","ENCANA F. PRC","F.PRC","RENCANA F.PROD","RENCANA F. PROD"])
  const iFact = idx(["FACT","FACT I","FACTORY"])
  const iBaru = idx(["BARU"])
  const iDST  = idx(["DST"])

  // Kolom J dan K yang di-hide: index 9 dan 10 (0-based)
  // Kolom tanggal dimulai setelah DST (index iDST+1), skip J dan K
  const HIDE_COLS = new Set([9, 10])  // J=9, K=10

  // Kumpulkan kolom tanggal: setelah kolom tetap, skip J dan K
  const firstDateCol = Math.max(iLine, iSPO, iStyle, iQtyO, iQtyP, iFPRC, iFact, iBaru, iDST) + 1
  const dateHeaders: string[] = []
  const dateColMap : Record<number, string> = {}

  for (let c = firstDateCol; c < header.length; c++) {
    if (HIDE_COLS.has(c)) continue  // skip kolom J dan K
    const h = header[c].trim()
    if (!h) continue
    // Deteksi kolom tanggal
    const isDate =
      /^\d{1,2}-[A-Za-z]{3}(-\d{2,4})?$/.test(h) ||
      /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(h)
    if (!isDate) continue
    const label = normalizeDate(h)
    if (!dateHeaders.includes(label)) dateHeaders.push(label)
    dateColMap[c] = label
  }

  // Parse data rows
  const factoryRows: Record<string, PlanDSTRow[]> = {}

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r]
    if (!row || row.length === 0) continue

    const line  = String(row[iLine]  ?? "").trim()
    const spo   = String(row[iSPO]   ?? "").trim()
    const style = String(row[iStyle] ?? "").trim()
    const fact  = String(row[iFact]  ?? "").trim()

    // Stop di baris History
    if (["history","History","HISTORY"].includes(fact) ||
        ["history","History","HISTORY"].includes(line)) break

    // Skip baris tidak valid
    if (!line || !spo || !style) continue
    if (!VALID_FACTORIES.has(fact)) continue

    const qty_order = parseFloat(String(row[iQtyO] ?? "0").replace(/[.,\s]/g,"")) || 0
    const qty_plan  = parseFloat(String(row[iQtyP] ?? "0").replace(/[.,\s]/g,"")) || 0
    const fprc      = String(row[iFPRC] ?? "").trim()
    const baru      = String(row[iBaru] ?? "").trim()
    const dstRaw    = String(row[iDST]  ?? "").trim()
    const dst       = parseFloat(dstRaw.replace(/[.,\s]/g,"")) || ""

    const dates: Record<string, number | "F" | ""> = {}
    for (const [colStr, label] of Object.entries(dateColMap)) {
      const c   = parseInt(colStr)
      const val = String(row[c] ?? "").trim()
      if (!val || val === "0") {
        dates[label] = ""
      } else if (val.toUpperCase() === "F") {
        dates[label] = "F"
      } else {
        const n = parseFloat(val.replace(/[.,\s]/g,""))
        dates[label] = isNaN(n) ? "" : n
      }
    }

    if (!factoryRows[fact]) factoryRows[fact] = []
    factoryRows[fact].push({ line, spo, style, qty_order, qty_plan, fprc, fact, baru, dst, dates })
  }

  // Sort per factory by line
  const factories = Object.keys(factoryRows).sort()
  for (const f of factories) {
    factoryRows[f].sort(function(a, b) {
      return a.line.localeCompare(b.line, undefined, { numeric:true })
    })
  }

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })

  return {
    factories,
    date_headers : dateHeaders,
    rows         : factoryRows,
    fetched_at   : wibStr,
    fetched_epoch: now,
  }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (!forceRefresh) {
    const cached = await cacheGet<PlanDSTData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }

  try {
    const data = await fetchPlanDST()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
