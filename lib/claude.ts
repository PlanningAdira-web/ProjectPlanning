import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const SYSTEM_PROMPT = `Kamu adalah AI Production Planning Analyst untuk manufaktur alas kaki.
Data tersedia dari Google Sheets: Planning DST & Sewing, Pre-Production Checklist, Shipment History.
Aturan: Jawab Bahasa Indonesia, profesional dan ringkas.
Format: ringkasan singkat → poin kritis → rekomendasi aksi.
Angka: gunakan titik pemisah ribuan (1.200 pcs). Tanggal: DD MMM YYYY.`

export type ChatMessage = { role: "user" | "assistant"; content: string }

function buildContext(data: Record<string, string>): string {
  return Object.entries(data)
    .filter(([, v]) => v && v !== "(sheet kosong)")
    .map(([name, csv]) => `=== SHEET: ${name} ===\n${csv}`)
    .join("\n\n")
}

export async function askClaude(prompt: string, data: Record<string, string>): Promise<string> {
  const ctx = buildContext(data)
  const content = ctx ? `${ctx}\n\n=== PERTANYAAN ===\n${prompt}` : prompt
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  })
  return (res.content[0] as Anthropic.TextBlock).text
}

export async function askClaudeStream(
  message: string,
  data: Record<string, string>,
  history: ChatMessage[] = []
) {
  const ctx = buildContext(data)
  const fullMsg = ctx ? `${ctx}\n\n=== PERTANYAAN ===\n${message}` : message
  return anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: fullMsg },
    ] as Anthropic.MessageParam[],
  })
}
