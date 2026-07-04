import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const SYSTEM_PROMPT = `Kamu adalah AI Production Planning Analyst untuk PT Adira Semesta Industry, manufaktur sarung tangan golf.
Kamu menerima data dari Google Sheets berisi data planning produksi.
Bahasa: Indonesia profesional. Angka: gunakan format ribuan (1.200 pcs). Tanggal: DD MMM YYYY.`

export type ChatMessage = { role: "user" | "assistant"; content: string }

const MAX_CHARS_PER_SECTION = 8000

function buildContext(csv: { dst?: string; prepo?: string; shipment?: string }): string {
  const sections: string[] = []

  if (csv.dst) {
    const trimmed = csv.dst.length > MAX_CHARS_PER_SECTION
      ? csv.dst.slice(0, MAX_CHARS_PER_SECTION) + "\n...(data dipotong karena terlalu panjang)"
      : csv.dst
    sections.push(`=== DATA PLANNING DST ===\n${trimmed}`)
  }

  if (csv.prepo) {
    const trimmed = csv.prepo.length > MAX_CHARS_PER_SECTION
      ? csv.prepo.slice(0, MAX_CHARS_PER_SECTION) + "\n...(data dipotong)"
      : csv.prepo
    sections.push(`=== DATA PRE-PRODUCTION ===\n${trimmed}`)
  }

  if (csv.shipment) {
    const trimmed = csv.shipment.length > MAX_CHARS_PER_SECTION
      ? csv.shipment.slice(0, MAX_CHARS_PER_SECTION) + "\n...(data dipotong)"
      : csv.shipment
    sections.push(`=== DATA EXPORT / SPO STOCK ===\n${trimmed}`)
  }

  return sections.join("\n\n")
}

export async function askClaude(
  prompt: string,
  csv: { dst?: string; prepo?: string; shipment?: string }
): Promise<string> {
  const ctx = buildContext(csv)
  const userContent = ctx
    ? `${ctx}\n\n=== INSTRUKSI ===\n${prompt}`
    : prompt

  const res = await anthropic.messages.create({
    model     : "claude-sonnet-4-6",
    max_tokens: 2048,
    system    : SYSTEM_PROMPT,
    messages  : [{ role: "user", content: userContent }],
  })

  // Pastikan ada respons dan tipe benar
  if (!res.content || res.content.length === 0) {
    throw new Error("Claude tidak mengembalikan konten apapun")
  }

  const first = res.content[0]
  if (first.type !== "text") {
    throw new Error(`Claude mengembalikan tipe konten tidak terduga: ${first.type}`)
  }

  return first.text
}

export async function askClaudeStream(
  userMessage: string,
  csv: { dst?: string; prepo?: string; shipment?: string },
  history: ChatMessage[] = []
) {
  const ctx      = buildContext(csv)
  const fullMsg  = ctx
    ? `${ctx}\n\n=== PERTANYAAN ===\n${userMessage}`
    : userMessage

  return anthropic.messages.stream({
    model     : "claude-sonnet-4-6",
    max_tokens: 2048,
    system    : SYSTEM_PROMPT,
    messages  : [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: fullMsg },
    ] as Anthropic.MessageParam[],
  })
}
