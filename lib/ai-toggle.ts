import { NextResponse } from "next/server"

/**
 * Helper terpusat untuk cek apakah fitur AI sedang dinonaktifkan.
 * Set AI_DISABLED=true di Vercel Environment Variables untuk
 * menghemat token tanpa menghapus API key atau mengubah kode lain.
 */
export function isAIDisabled(): boolean {
  return process.env.AI_DISABLED === "true"
}

/**
 * Response standar untuk endpoint GET (dashboard, alerts)
 * saat AI sedang dinonaktifkan.
 */
export function aiDisabledResponseGET(extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    ai_disabled: true,
    message: "AI sedang dinonaktifkan sementara untuk menghemat penggunaan token. Hubungi admin untuk mengaktifkan kembali.",
    updated_at: new Date().toISOString(),
    ...extra,
  })
}

/**
 * Response standar untuk endpoint POST streaming (chat)
 * saat AI sedang dinonaktifkan. Tetap berbentuk stream teks
 * agar kompatibel dengan frontend yang membaca ReadableStream.
 */
export function aiDisabledResponseStream(): Response {
  const message =
    "⚠️ AI Planning Assistant sedang dinonaktifkan sementara untuk menghemat penggunaan token.\n\nHubungi admin untuk mengaktifkan kembali fitur ini."
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(message))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
