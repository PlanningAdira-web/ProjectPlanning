import { NextResponse } from "next/server"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaude } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET() {
  try {
    const data = await getAllSheetsData()
    const today = new Date().toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})
    const raw = await askClaude(
      `Hari ini: ${today}. Analisa semua data dan buat daftar alert produksi.
Kembalikan HANYA JSON array (maks 8 item, urutkan dari paling kritis):
[{"level":"danger|warn|info","model":"Model 1|Model 2|Model 3","title":"max 80 karakter","body":"max 150 karakter","po":"nomor PO atau null"}]
danger=aksi hari ini, warn=3 hari ke depan, info=informasi perencanaan.`, data
    )
    let alerts = []
    try { alerts = JSON.parse(raw.replace(/```json|```/g,"").trim()) } catch { alerts = [] }
    return NextResponse.json({ alerts, generated_at: new Date().toISOString() })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
