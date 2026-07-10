import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KPIData    = { kpi_score:string; scorecard:string; fetched_at:string }
export type AlertRow   = { spo:string; style:string; start_dst:string; concern:string }
export type TodoPageData = { kpi:KPIData; alerts:AlertRow[]; fetched_at:string }

const CACHE_KEY = "todo_page_data"

// Nilai kolom D yang dianggap tidak perlu ditampilkan
const SKIP_VALUES = new Set([
  "done", "selesai", "complete", "completed",
  "#n/a", "#na", "#ref!", "#value!", "#div/0!", "#name?", "#null!", "#num!", "#error!",
  "--", "-", "n/a", "ok", "oke",
])

function isSkip(val: string): boolean {
  const v = val.trim().toLowerCase()
  if (!v) return true                          // kosong
  if (SKIP_VALUES.has(v)) return true          // exact match
  if (v.startsWith("#")) return true           // formula error (#N/A, #REF!, dst)
  if (/^-+$/.test(v)) return true             // hanya strip: -, --, ---
  return false
}

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
  const sheets        = google.sheets({ version:"v4", auth:getAuth() })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID!

  // 1. KPI Score (D2) dan Scorecard (K2)
  const kpiRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges           : ["KPI&Scorecard!D2", "KPI&Scorecard!K2"],
    valueRenderOption: "FORMATTED_VALUE",
  })
  const kpiRanges = kpiRes.data.valueRanges ?? []
  const kpiScore  = String(kpiRanges[0]?.values?.[0]?.[0] ?? "--")
  const scorecard = String(kpiRanges[1]?.values?.[0]?.[0] ?? "--")

  // 2. Baca Alerts kolom A:D saja
  //    Baris 1 = header (SPO, STYLE, START DST, Concern)
  //    Baris 2 dst = data
  //    Tampilkan jika kolom D bukan: kosong, Done, #N/A, error formula
  const alertRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range            : "Alerts!A:D",
    valueRenderOption: "FORMATTED_VALUE",
  })

  const rows   = alertRes.data.values ?? []
  const alerts: AlertRow[] = []

  // Skip baris 0 (header)
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue

    const spo     = String(row[0] ?? "").trim()
    const style   = String(row[1] ?? "").trim()
    const dst     = String(row[2] ?? "").trim()
    const concern = String(row[3] ?? "").trim()

    // Skip jika SPO kosong (baris kosong)
    if (!spo) continue

    // Skip jika kolom Concern adalah Done / error / kosong
    if (isSkip(concern)) continue

    alerts.push({ spo, style, start_dst:dst, concern })
  }

  const now    = Date.now()
  const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })
  return {
    kpi          : { kpi_score:kpiScore, scorecard, fetched_at:wibStr, fetched_epoch:now },
    alerts,
    fetched_at   : wibStr,
    fetched_epoch: now,
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
