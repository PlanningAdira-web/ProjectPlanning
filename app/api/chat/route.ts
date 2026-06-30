import { NextRequest } from "next/server"
import { getAllSheetsData } from "@/lib/sheets"
import { askClaudeStream, ChatMessage } from "@/lib/claude"
import { isAIDisabled, aiDisabledResponseStream } from "@/lib/ai-toggle"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // ── Toggle check: hemat token jika AI_DISABLED=true ──────
  if (isAIDisabled()) {
    return aiDisabledResponseStream()
  }

  try {
    const { message, history = [] } = await req.json()
    if (!message?.trim()) {
      return new Response("Pesan kosong", { status: 400 })
    }

    const data = await getAllSheetsData()
    const stream = await askClaudeStream(message, data, history as ChatMessage[])

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (e: any) {
    return new Response(`Error: ${e.message}`, { status: 500 })
  }
}
