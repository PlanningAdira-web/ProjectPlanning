import { NextResponse } from "next/server"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60

function safeJSON(s: string) {
  try { return JSON.parse(s.replace(/```json|```/g,"").trim()) }
  catch { return {} }
}

export async function GET() {
  try {
    const data = await getAllSheetsData()
    const sheetNames = Object.keys(data).join(", ")
    const [r1, r2, r3] = await Promise.all([
      askClaude(`Sheet tersedia: ${sheetNames}. Analisa data produksi DST & Sewing. Kembalikan HANYA JSON:
{"total_po":0,"at_risk":0,"avg_deviation_pct":0,"wip_status":"normal","top_issues":[{"po":"","dev_pct":0}]}`, data),
      askClaude(`Sheet tersedia: ${sheetNames}. Analisa kesiapan pre-production. Kembalikan HANYA JSON:
{"siap":0,"berisiko":0,"terlambat":0,"critical_po":"","critical_days_left":0,"most_missing_item":""}`, data),
      askClaude(`Sheet tersedia: ${sheetNames}. Analisa shipment history & forecasting. Kembalikan HANYA JSON:
{"otd_rate_pct":0,"avg_delay_days":0,"top_root_cause":"","next_month_forecast_pcs":0,"current_month_pcs":0}`, data),
    ])
    return NextResponse.json({
      model1: safeJSON(r1), model2: safeJSON(r2), model3: safeJSON(r3),
      sheet_names: Object.keys(data),
      updated_at: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
