import { NextResponse } from "next/server"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaude } from "@/lib/claude"
import { isAIDisabled, aiDisabledResponseGET } from "@/lib/ai-toggle"

export const runtime = "nodejs"
export const maxDuration = 60

function safeJSON(s: string) {
  try { return JSON.parse(s.replace(/```json|```/g, "").trim()) }
  catch { return {} }
}

const PROMPT = `Analisa semua data dari spreadsheet dan kembalikan HANYA JSON ini tanpa teks lain:
{
  "overall_capacity_pct": 0,
  "achievement_pct": 0,
  "material_readiness_pct": 0,
  "lines_at_risk": 0,
  "top_priority": "daftar 3 prioritas tindakan hari ini, pisahkan dengan newline",
  "planning_risk_level": "TINGGI|SEDANG|RENDAH",
  "mp_shortage": 0,
  "schedule_adjustment_needed": 0,
  "forecast_demand_4w": 0,
  "forecast_capacity_gap": 0,
  "material_risk_items": 0,
  "risk_score_12w": "TINGGI|SEDANG|RENDAH"
}
Gunakan data aktual dari sheet. Jika data tidak tersedia, isi 0 atau string kosong.`

export async function GET() {
  // ── Toggle check: hemat token jika AI_DISABLED=true ──────
  if (isAIDisabled()) {
    return aiDisabledResponseGET({
      sheet_names: [],
      overall_capacity_pct: null,
      achievement_pct: null,
      material_readiness_pct: null,
      lines_at_risk: null,
    })
  }

  try {
    const data = await getAllSheetsData()
    const raw = await askClaude(PROMPT, data)
    const kpi = safeJSON(raw)
    return NextResponse.json({
      ...kpi,
      ai_disabled: false,
      sheet_names: Object.keys(data),
      updated_at: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
