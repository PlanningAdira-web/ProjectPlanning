import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { cacheGet, cacheSet } from "@/lib/cache"
import { google } from "googleapis"

export const runtime = "nodejs"
export const maxDuration = 60

export type KPIData      = { kpi_score:string; scorecard:string; fetched_at:string; fetched_epoch:number }
export type AlertRow     = { spo:string; style:string; start_dst:string; concern:string }
export type TodoPageData = { kpi:KPIData; alerts:AlertRow[]; fetched_at:string; fetched_epoch:number }

const CACHE_KEY = "todo_page_data"

const SKIP_VALUES = new Set([
  "done","selesai","complete","completed",
  "#n/a","#na","#ref!","#value!","#div/0!","#name?","#null!","#num!","#error!",
  "--","-","n/a","ok","oke",
])

function isSkip(val: string): boolean {
  const v = val.trim().toLowerCase()
  if (!v) return true
  if (SKIP_VALUES.has(v)) return true
  if (v.startsWith("#")) return true
  if (/^-+$/.test(v)) return true
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

async function fetchKPI(): Promise<{ kpi_score:string; scorecard:string }> {
  try {
    const sheets = google.sheets({ version:"v4", auth:getAuth() })
    const res    = await sheets.spreadsheets.values.batchGet({
      spreadsheetId    : process.env.GOOGLE_SHEET_ID!,
      ranges           : ["KPI&Scorecard!D2","KPI&Scorecard!K2"],
      valueRenderOption: "FORMATTED_VALUE",
    })
    const ranges  = res.data.valueRanges ?? []
    return {
      kpi_score: String(ranges[0]?.values?.[0]?.[0] ?? "--"),
      scorecard : String(ranges[1]?.values?.[0]?.[0] ?? "--"),
    }
  } catch (e: any) {
    console.error("[todo-page] fetchKPI failed:", e.message)
    return { kpi_score:"--", scorecard:"--" }
  }
}

async function fetchAlerts(): Promise<AlertRow[]> {
  try {
    const sheets = google.sheets({ version:"v4", auth:getAuth() })
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId    : process.env.GOOGLE_SHEET_ID!,
      range            : "Alerts!A:D",
      valueRenderOption: "FORMATTED_VALUE",
    })
    const rows   = res.data.values ?? []
    const alerts : AlertRow[] = []

    for (let r = 1; r < rows.length; r++) {
      const row     = rows[r]
      if (!row || row.length === 0) continue
      const spo     = String(row[0] ?? "").trim()
      const style   = String(row[1] ?? "").trim()
      const dst     = String(row[2] ?? "").trim()
      const concern = String(row[3] ?? "").trim()
      if (!spo) continue
      if (isSkip(concern)) continue
      alerts.push({ spo, style, start_dst:dst, concern })
    }
    return alerts
  } catch (e: any) {
    console.error("[todo-page] fetchAlerts failed:", e.message)
    return []
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
    // Fetch KPI dan Alerts secara paralel -- jika salah satu gagal, yang lain tetap jalan
    const [kpiResult, alerts] = await Promise.all([fetchKPI(), fetchAlerts()])

    const now    = Date.now()
    const wibStr = new Date(now + 7 * 60 * 60 * 1000).toLocaleString("id-ID", { timeZone:"UTC" })

    const data: TodoPageData = {
      kpi          : { ...kpiResult, fetched_at:wibStr, fetched_epoch:now },
      alerts,
      fetched_at   : wibStr,
      fetched_epoch: now,
    }

    await cacheSet(CACHE_KEY, data, user.username)
    console.log("[todo-page] refreshed: " + alerts.length + " alerts, KPI=" + kpiResult.kpi_score)
    return NextResponse.json({ ok:true, data })

  } catch (e: any) {
    console.error("[todo-page] fetch failed:", e.message)
    return NextResponse.json({ ok:false, error:e.message }, { status:500 })
  }
}
