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
  debug?      : any
}

const CACHE_KEY       = "plan_dst_data"
const VALID_FACTORIES = new Set(["A","F","K"])

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

async function fetchPlanDST(debug = false): Promise<PlanDSTData> {
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Plan DST",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const raw = res.data.values ?? []
  if (raw.length < 2) throw new Error("Sheet 'Plan DST' kosong atau tidak ditemukan")

  // Baris 0 = header — baca apa adanya
  const header = raw[0].map(function(h: any) { return String(h ?? "").trim() })

  // Debug: kembalikan header untuk diagnosa
  if (debug) {
    return {
      factories: [], date_headers: [], rows: {},
      fetched_at: "", fetched_epoch: 0,
      debug: { header, row2: raw[1] ?? [], total_rows: raw.length }
    }
  }

  // Deteksi kolom tetap -- cari berdasarkan posisi (A=0, B=1, C=2, dst)
  // Berdasarkan screenshot: A=LINE, B=SPO, C=STYLE, D=QTY ORDER, E=QTY PLAN,
  // F=ENCANA F.PRC, G=Fact, H=Baru, I=DST, J=SEW(hide), K=kosong(hide), L+=tanggal
  const iLine = 0   // A
  const iSPO  = 1   // B
  const iStyle= 2   // C
  const iQtyO = 3   // D
  const iQtyP = 4   // E
  const iFPRC = 5   // F
  const iFact = 6   // G
  const iBaru = 7   // H
  const iDST  = 8   // I
  // J=9 dan K=10 di-skip (hidden)
  const firstDateCol = 11  // L

  // Kumpulkan header tanggal dari kolom L ke kanan
  const dateHeaders: string[] = []
  const dateColMap : Record<number, string> = {}

  for (let c = firstDateCol; c < header.length; c++) {
    const h = header[c].trim()
    if (!h) continue
    // Terima semua format: "06-Jul", "7-Jul-26", "8-Jul-26", dll
    const isDate =
      /^\d{1,2}-[A-Za-z]{3}(-\d{2,4})?$/.test(h) ||
      /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(h)
    if (!isDate) continue
    if (!dateHeaders.includes(h)) dateHeaders.push(h)
    dateColMap[c] = h
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
    if (fact.toLowerCase() === "history" || line.toLowerCase() === "history") break

    // Skip baris tidak valid
    if (!line || !spo || !style) continue

    // Filter factory valid saja
    if (!VALID_FACTORIES.has(fact)) continue

    const qty_order = parseFloat(String(row[iQtyO] ?? "0").replace(/[.,]/g,"").replace(/\s/g,"")) || 0
    const qty_plan  = parseFloat(String(row[iQtyP] ?? "0").replace(/[.,]/g,"").replace(/\s/g,"")) || 0
    const fprc      = String(row[iFPRC] ?? "").trim()
    const baru      = String(row[iBaru] ?? "").trim()
    const dstRaw    = String(row[iDST]  ?? "").trim()
    const dst: number | "" = parseFloat(dstRaw.replace(/[.,]/g,"")) || ""

    const dates: Record<string, number | "F" | ""> = {}
    for (const [colStr, label] of Object.entries(dateColMap)) {
      const c   = parseInt(colStr)
      const val = String(row[c] ?? "").trim()
      if (!val || val === "0") {
        dates[label] = ""
      } else if (val.toUpperCase() === "F") {
        dates[label] = "F"
      } else {
        const n = parseFloat(val.replace(/[.,]/g,""))
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
  const isDebug      = req.nextUrl.searchParams.get("debug")   === "1"

  // Mode debug: kembalikan header sheet untuk diagnosa
  if (isDebug) {
    try {
      const data = await fetchPlanDST(true)
      return NextResponse.json({ ok:true, debug:data.debug })
    } catch (e: any) {
      return NextResponse.json({ ok:false, error:e.message })
    }
  }

  if (!forceRefresh) {
    const cached = await cacheGet<PlanDSTData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }

  try {
    const data = await fetchPlanDST(false)
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
