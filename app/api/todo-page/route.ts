import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet, CACHE_KEYS } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KPIData = {
  kpi_score   : string
  scorecard   : string
  fetched_at  : string
}

export type AlertRow = {
  spo      : string
  style    : string
  start_dst: string
  concern  : string
}

export type TodoPageData = {
  kpi    : KPIData
  alerts : AlertRow[]
  fetched_at: string
}

const CACHE_KEY = "todo_page_data"
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

  // 1. Baca KPI Score (D2) dan Scorecard (K2) dari sheet KPI&Scorecard
  const kpiRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: ["KPI&Scorecard!D2", "KPI&Scorecard!K2"],
    valueRenderOption: "FORMATTED_VALUE",
  })

  const kpiRanges = kpiRes.data.valueRanges ?? []
  const kpiScore  = kpiRanges[0]?.values?.[0]?.[0] ?? "--"
  const scorecard = kpiRanges[1]?.values?.[0]?.[0] ?? "--"

  // 2. Baca sheet Alerts — semua baris
  const alertRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Alerts",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const alertRaw  = alertRes.data.values ?? []
  const alerts: AlertRow[] = []

  if (alertRaw.length > 1) {
    // Baris 0 = header, cari index kolom
    const header   = alertRaw[0].map(function(h: string) { return String(h ?? "").trim().toLowerCase() })
    const iSPO     = header.findIndex(function(h: string) { return h === "spo" })
    const iStyle   = header.findIndex(function(h: string) { return h === "style" })
    const iDST     = header.findIndex(function(h: string) { return h.includes("start") && h.includes("dst") || h === "start dst" })
    const iConcern = header.findIndex(function(h: string) { return h === "concern" })
    // Cari kolom status (nama apapun yang mengandung "status" atau "done")
    const iStatus  = header.findIndex(function(h: string) { return h.includes("status") || h === "done" || h === "selesai" || h === "complete" })

    for (let r = 1; r < alertRaw.length; r++) {
      const row = alertRaw[r]
      if (!row || row.length === 0) continue

      const spo     = String(row[iSPO]     ?? "").trim()
      const style   = String(row[iStyle]   ?? "").trim()
      const dst     = String(row[iDST]     ?? "").trim()
      const concern = String(row[iConcern] ?? "").trim()

      // Skip baris kosong
      if (!spo && !style && !concern) continue

      // Skip baris yang sudah Done
      if (iStatus >= 0) {
        const statusVal = String(row[iStatus] ?? "").trim().toLowerCase()
        if (DONE_VALUES.has(statusVal)) continue
      }

      alerts.push({ spo, style, start_dst:dst, concern })
    }
  }

  return {
    kpi: {
      kpi_score : String(kpiScore),
      scorecard : String(scorecard),
      fetched_at: new Date().toLocaleString("id-ID"),
    },
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
