import { NextRequest } from "next/server"
import { getSession, can } from "@/lib/auth"
import { getAllSheetsData } from "@/lib/sheets"
import { toClaudeCSV } from "@/lib/sheets-adapter"
import { askClaudeStream, ChatMessage } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60

function errStream(msg: string) {
  const enc = new TextEncoder()
  return new Response(
    new ReadableStream({ start(c) { c.enqueue(enc.encode(msg)); c.close() } }),
    { headers:{ "Content-Type":"text/plain; charset=utf-8" } }
  )
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return errStream("❌ Login diperlukan.")
  if (!can(user.role, "canBalancing"))
    return errStream("🔒 Role Viewer tidak memiliki akses ke fitur Balancing AI.")

  try {
    const { message, history = [], orderContext } = await req.json()
    if (!message?.trim()) return new Response("Pesan kosong", { status:400 })

    const sheetsData = await getAllSheetsData()
    const csv        = toClaudeCSV(sheetsData)

    const orderCtx = orderContext
      ? `\n\n=== KONTEKS ORDER BARU ===\nStyle: ${orderContext.style}\nJenis Style: ${orderContext.jenis}\nQty: ${Number(orderContext.qty).toLocaleString("id-ID")} pcs\nRencana F. Prod: ${orderContext.fProd}\n=== AKHIR KONTEKS ===\n`
      : ""

    const balancingContext = `[BALANCING DST ANALYST | User: ${user.name} | Role: ${user.role}]
Tugas: Analisis ketersediaan line dari data aktual, rekomendasikan balancing optimal.
Pertimbangkan: kolom Jenis Style (Full Pola/Synth/Patch+IJ), tanggal RENCANA F.PROD, kapasitas historis.
Jika semua line full: rekomendasikan geser SPO, cari line alternatif berdasarkan histori, atau kombinasi.${orderCtx}

Pertanyaan: ${message}`

    const stream = await askClaudeStream(balancingContext, csv, history as ChatMessage[])

    const enc = new TextEncoder()
    return new Response(
      new ReadableStream({
        async start(ctrl) {
          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta")
              ctrl.enqueue(enc.encode(chunk.delta.text))
          }
          ctrl.close()
        },
      }),
      { headers:{ "Content-Type":"text/plain; charset=utf-8" } }
    )
  } catch (e: any) {
    return errStream(`Error: ${e.message}`)
  }
}
