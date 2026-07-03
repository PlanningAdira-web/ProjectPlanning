import { NextRequest } from "next/server"
import { getSession, can } from "@/lib/auth"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaudeStream, ChatMessage } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60

function errStream(msg: string) {
  const enc = new TextEncoder()
  return new Response(new ReadableStream({ start(c){c.enqueue(enc.encode(msg));c.close()} }),
    { headers:{"Content-Type":"text/plain; charset=utf-8"} })
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return errStream("❌ Login diperlukan.")
  if (!can(user.role, "canBalancing"))
    return errStream("🔒 Role Viewer tidak memiliki akses ke fitur Balancing AI.")
  try {
    const { message, history=[], orderContext } = await req.json()
    if (!message?.trim()) return new Response("Pesan kosong", { status:400 })

    const data = await getAllSheetsData()
    const ctx  = orderContext
      ? `\n[Konteks order baru: Style="${orderContext.style}", Jenis="${orderContext.jenis}", Qty=${orderContext.qty} pcs, Rencana F.Prod=${orderContext.fProd}]`
      : ""

    const systemHint = `Kamu adalah AI Balancing Planning DST untuk PT Adira Semesta Industry.
Tugas: Analisis ketersediaan line berdasarkan Data_Plan_DST, rekomendasikan balancing optimal.
Pertimbangkan: kolom "Jenis Style" (Full Pola/Synth/Patch+IJ), tanggal RENCANA F.PROD, kapasitas historis per line.
Jika semua line full, rekomendasikan: (1) geser SPO yang bisa digeser, (2) line alternatif berdasarkan histori jenis style, (3) kombinasi optimal.
Gunakan data aktual dari sheet Data_Plan_DST.${ctx}`

    const stream = await askClaudeStream(
      `[User: ${user.name} | Role: ${user.role}]\n${message}`,
      data, history as ChatMessage[], systemHint
    )
    const enc = new TextEncoder()
    return new Response(
      new ReadableStream({ async start(ctrl) {
        for await (const chunk of stream) {
          if (chunk.type==="content_block_delta"&&chunk.delta.type==="text_delta")
            ctrl.enqueue(enc.encode(chunk.delta.text))
        }
        ctrl.close()
      }}),
      { headers:{"Content-Type":"text/plain; charset=utf-8"} }
    )
  } catch (e: any) { return errStream(`Error: ${e.message}`) }
}
