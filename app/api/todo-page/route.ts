import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KPIData = {
  kpi_score : string
  scorecard : string
  fetched_at: string
}

export type AlertRow = {
  spo      : string
  style    : string
  start_dst: string
  concern  : string
}

export type TodoPageData = {
  kpi       : KPIData
  alerts    : AlertRow[]
  fetched_at: string
}

const CACHE_KEY   = "todo_page_data"
const DONE_VALUES = new Set(["done","selesai","complete","completed","ya","yes","true","1"])

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key : process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
}

async function fetchTodoPageData(): Promise<TodoPageData> {
  const auth          = getAuth()
  const sheets        = google.sheets({ version:"v4", auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  // 1. Baca KPI Score (D2) dan Scorecard (K2)
  const kpiRes    = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges           : ["KPI&Scorecard!D2", "KPI&Scorecard!K2"],
    valueRenderOption: "FORMATTED_VALUE",
  })
  const kpiRanges = kpiRes.data.valueRanges ?? []
  const kpiScore  = String(kpiRanges[0]?.values?.[0]?.[0] ?? "--")
  const scorecard = String(kpiRanges[1]?.values?.[0]?.[0] ?? "--")

  // 2. Baca Alerts!A:E (A=SPO, B=Style, C=Start DST, D=Concern, E=Status)
  //    Gunakan range eksplisit A:E agar tidak terpengaruh kolom lain
  const alertRes  = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Alerts!A:E",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const alertRaw   = alertRes.data.values ?? []
  const alerts: AlertRow[] = []

  if (alertRaw.length > 1) {
    // Baris 0 = header -- detect kolom berdasar nama
    const header  = alertRaw[0].map(function(h: any) { return String(h ?? "").trim().toLowerCase() })

    // Cari index kolom -- fallback ke posisi default A=0, B=1, C=2, D=3
    const iSPO     = header.findIndex(function(h: string) { return h === "spo" })
    const iStyle   = header.findIndex(function(h: string) { return h === "style" })
    const iDST     = header.findIndex(function(h: string) {
      return h === "start dst" || (h.includes("start") && h.includes("dst"))
    })
    const iConcern = header.findIndex(function(h: string) { return h === "concern" })
    const iStatus  = header.findIndex(function(h: string) {
      return h === "status" || h === "done" || h === "selesai" || h === "complete"
    })

    // Gunakan index yang ditemukan, fallback ke posisi default A B C D
    const colSPO     = iSPO     >= 0 ? iSPO     : 0
    const colStyle   = iStyle   >= 0 ? iStyle   : 1
    const colDST     = iDST     >= 0 ? iDST     : 2
    const colConcern = iConcern >= 0 ? iConcern : 3
    const colStatus  = iStatus  >= 0 ? iStatus  : 4

    for (let r = 1; r < alertRaw.length; r++) {
      const row = alertRaw[r]
      if (!row || row.length === 0) continue

      const spo     = String(row[colSPO]     ?? "").trim()
      const style   = String(row[colStyle]   ?? "").trim()
      const dst     = String(row[colDST]     ?? "").trim()
      const concern = String(row[colConcern] ?? "").trim()
      const statusV = String(row[colStatus]  ?? "").trim().toLowerCase()

      // Skip baris kosong
      if (!spo && !style && !concern) continue

      // Skip baris yang sudah Done/Selesai/Complete
      if (iStatus >= 0 && DONE_VALUES.has(statusV)) continue

      alerts.push({ spo, style, start_dst:dst, concern })
    }
  }

  return {
    kpi: { kpi_score:kpiScore, scorecard, fetched_at:new Date().toLocaleString("id-ID") },
    alerts,
    fetched_at: new Date().toLocaleString("id-ID"),
  }
}

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error:"Login diperlukan" }, { status:401 })

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  if (!forceRefresh) {
    const cached = await cacheGet<TodoPageData>(CACHE_KEY)
    if (cached) return NextResponse.json({ ok:true, data:cached.data })
  }

  try {
    const data = await fetchTodoPageData()
    await cacheSet(CACHE_KEY, data, user.username)
    return NextResponse.json({ ok:true, data })
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
