import { NextRequest, NextResponse } from "next/server"
import { getSession, can } from "@/lib/auth"
import { cacheGet, cacheSet, cacheInfo, CACHE_KEYS } from "@/lib/cache"
import { getAllSheetsData } from "@/lib/sheets"
import { toClaudeCSV } from "@/lib/sheets-adapter"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60
const KEY = CACHE_KEYS.DASHBOARD

/**
 * Parse JSON dari respons Claude yang mungkin dibungkus markdown.
 * Handles: ```json {...} ```, plain {...}, atau teks + {...}
 */
function parseClaudeJSON(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {}

  // Step 1: hapus backtick markdown (semua variasi)
  let s = raw
  s = s.split("```json").join("")
  s = s.split("```JSON").join("")
  s = s.split("```").join("")
  s = s.trim()

  // Step 2: cari blok JSON dengan mencari { ... }
  const firstBrace = s.indexOf("{")
  const lastBrace  = s.lastIndexOf("}")
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return {}

  const jsonStr = s.slice(firstBrace, lastBrace + 1)

  // Step 3: parse
  try {
    const result = JSON.parse(jsonStr)
    if (typeof result === "object" && result !== null) return result
    return {}
  } catch {
    return {}
  }
}

// Prompt eksplisit melarang markdown
const PROMPT = `Kamu adalah AI Production Planning Analyst untuk PT Adira Semesta Industry.

PENTING: Kembalikan HANYA objek JSON murni. DILARANG menggunakan backtick, markdown, atau teks apapun selain JSON.

Analisa data produksi yang diberikan dan kembalikan objek JSON dengan struktur PERSIS seperti ini:

{
  "kpi_score": 0.0,
  "scorecard_score": 0.0,
  "outstanding_spo_pcs": 0,
  "wip_over_1week_pcs": 0,
  "overall_capacity_pct": 0,
  "achievement_pct": 0,
  "lines_at_risk": 0,
  "planning_risk_level": "RENDAH",
  "mp_shortage": 0,
  "capacity_by_style": [
    {
      "style": "nama style",
      "order_pcs": 0,
      "produksi_pcs": 0,
      "sisa_pcs": 0,
      "pct": 0,
      "status": "On Track"
    }
  ],
  "material_incomplete": [
    {
      "spo": "0000/26",
      "style": "nama style",
      "kekurangan": "nama material",
      "dst_date": "DD Mon"
    }
  ],
  "todo_ai": [
    {
      "text": "tindakan konkret yang harus dilakukan hari ini",
      "priority": "urgent"
    }
  ]
}

Aturan:
- Gunakan angka aktual dari data, bukan 0
- planning_risk_level: "TINGGI", "SEDANG", atau "RENDAH"
- status capacity_by_style: "Selesai", "On Track", "Perlu Perhatian", atau "Kritis"
- priority todo_ai: "urgent" atau "normal"
- Maksimal 5 item per array
- JANGAN tambahkan field lain di luar struktur di atas
- JANGAN gunakan backtick atau markdown apapun`

export async function GET(req: NextRequest) {
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

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
      // 1. Ambil data spreadsheet
      const sheetsData = await getAllSheetsData()
      if (!sheetsData || Object.keys(sheetsData).length === 0) {
        return NextResponse.json(
          { error: "Gagal membaca data dari Google Sheets. Periksa koneksi service account." },
          { status: 500 }
        )
      }

      // 2. Konversi ke CSV untuk Claude
      const csv = toClaudeCSV(sheetsData)

      // 3. Kirim ke Claude
      const raw = await askClaude(PROMPT, csv)

      // 4. Parse JSON dari respons Claude
      const kpi = parseClaudeJSON(raw)

      if (Object.keys(kpi).length === 0) {
        return NextResponse.json(
          {
            error : "Gagal membaca respons AI. Silakan coba refresh kembali.",
            debug : raw.slice(0, 300),
          },
          { status: 500 }
        )
      }

      // 5. Simpan ke cache (memory + sheet AI_Cache)
      const entry = await cacheSet(KEY, kpi, user.username)
      const info  = await cacheInfo(KEY)

      return NextResponse.json({ ...kpi, _cache: { fresh: true, ...info } })

    } catch (e: any) {
      return NextResponse.json(
        {
          error : e.message ?? "Unknown error saat refresh",
          detail: e.stack?.split("\n").slice(0, 3).join(" | ") ?? "",
        },
        { status: 500 }
      )
    }
  }

  // Baca dari cache
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
