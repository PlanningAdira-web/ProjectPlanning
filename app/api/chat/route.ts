import { NextRequest } from "next/server"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaudeStream, ChatMessage } from "@/lib/claude"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] } = await req.json()
    if (!message?.trim()) return new Response("Pesan kosong", { status: 400 })
    const data = await getAllSheetsData()
    const stream = await askClaudeStream(message, data, history as ChatMessage[])
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
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    )
  } catch (e: any) {
    return new Response(`Error: ${e.message}`, { status: 500 })
  }
}
