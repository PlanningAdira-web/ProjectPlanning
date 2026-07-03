import { NextRequest } from "next/server"
import { getSession, can } from "@/lib/auth"
import { getAllSheetData } from "@/lib/sheets"
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
  if (!user) return errStream("❌ Sesi tidak ditemukan. Silakan login kembali.")
  if (!can(user.role, "canChat"))
    return errStream("🔒 Role Viewer tidak memiliki akses ke Chat AI.\n\nFitur chat tersedia untuk Admin dan Tim Planning.")

  try {
    const { message, history = [] } = await req.json()
    if (!message?.trim()) return new Response("Pesan kosong", { status:400 })

    const { csv } = await getAllSheetData()
    const userMsg = `[User: ${user.name} | Role: ${user.role}]\n${message}`
    const stream  = await askClaudeStream(userMsg, csv, history as ChatMessage[])

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
