import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, cacheInfo, CACHE_KEYS } from "@/lib/cache"
import { getAllSheetsData } from "@/lib/sheets"
import { toClaudeCSV } from "@/lib/sheets-adapter"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60
const KEY = CACHE_KEYS.DASHBOARD

function safeJSON(s: string) {
  try {
    // Hapus semua variasi markdown code block yang mungkin dikembalikan Claude
    let clean = s
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim()
    // Ambil dari { pertama sampai } terakhir
    const start = clean.indexOf("{")
    const end   = clean.lastIndexOf("}")
    if (start === -1 || end === -1 || end <= start) return {}
    return JSON.parse(clean.slice(start, end + 1))
  } catch { return {} }
}

const PROMPT = `Kamu adalah AI Production Planning Analyst. Analisa data produksi berikut dan kembalikan HANYA objek JSON valid, tanpa markdown, tanpa penjelasan, tanpa teks apapun sebelum atau sesudah JSON.

Format JSON yang harus dikembalikan:
{
  "kpi_score": 98.22,
  "scorecard_score": 77.02,
  "outstanding_spo_pcs": 251000,
  "wip_over_1week_pcs": 22300,
  "overall_capacity_pct": 85,
  "achievement_pct": 77,
  "lines_at_risk": 3,
  "planning_risk_level": "SEDANG",
  "mp_shortage": 2,
  "capacity_by_style": [
    {"style":"nama style","order_pcs":10000,"produksi_pcs":7500,"sisa_pcs":2500,"pct":75,"status":"On Track"}
  ],
  "material_incomplete": [
    {"spo":"0904/26","style":"nama style","kekurangan":"item material","dst_date":"3 Jul"}
  ],
  "todo_ai": [
    {"text":"tindakan spesifik yang harus dilakukan hari ini berdasarkan data","priority":"urgent"}
  ]
}

Gunakan angka nyata dari data. Maksimal 5 item per array capacity_by_style, material_incomplete, dan todo_ai.`

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

  // ── REFRESH ──────────────────────────────────────────────────────
  if (forceRefresh) {
    const user = await getSession()
    if (!user)
      return NextResponse.json({ error: "Login diperlukan" }, { status: 401 })
    if (!can(user.role, "canRefreshAI"))
      return NextResponse.json(
        { error: `Role "${user.role}" tidak dapat refresh analisis` },
        { status: 403 }
      )

    try {
      // 1. Ambil data dari semua sheet
      const sheetsData = await getAllSheetsData()
      if (!sheetsData || Object.keys(sheetsData).length === 0) {
        return NextResponse.json(
          { error: "Gagal membaca data dari Google Sheets. Periksa koneksi service account." },
          { status: 500 }
        )
      }

      // 2. Konversi ke format Claude
      const csv = toClaudeCSV(sheetsData)

      // 3. Kirim ke Claude
      const raw = await askClaude(PROMPT, csv)
      if (!raw || raw.trim().length === 0) {
        return NextResponse.json(
          { error: "Claude tidak mengembalikan respons. Periksa API key Anthropic." },
          { status: 500 }
        )
      }

      // 4. Parse JSON
      const kpi = safeJSON(raw)
      if (Object.keys(kpi).length === 0) {
        return NextResponse.json(
          { error: `Claude mengembalikan format tidak valid. Respons raw: ${raw.slice(0, 200)}` },
          { status: 500 }
        )
      }

      // 5. Simpan ke cache (memory + Sheets)
      const entry = await cacheSet(KEY, kpi, user.username)
      const info  = await cacheInfo(KEY)

      return NextResponse.json({
        ...kpi,
        _cache: { fresh: true, ...info },
      })
    } catch (e: any) {
      // Kembalikan error detail agar mudah debug
      return NextResponse.json(
        {
          error  : e.message ?? "Unknown error",
          detail : e.stack?.split("\n").slice(0, 3).join(" | ") ?? "",
        },
        { status: 500 }
      )
    }
  }

  // ── READ CACHE ───────────────────────────────────────────────────
  const entry = await cacheGet<any>(KEY)
  if (!entry) {
    return NextResponse.json({
      _cache: {
        has_cache: false,
        message  : "Belum ada analisis. Admin/Analyst perlu klik Refresh Analisis AI.",
      },
    })
  }
  const info = await cacheInfo(KEY)
  return NextResponse.json({ ...(entry.data as object), _cache: { ...info } })
}
