import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

// ── Tipe ─────────────────────────────────────────────────────
export type Role = "admin" | "analyst" | "planning" | "viewer"

export type User = {
  username : string
  name     : string
  role     : Role
}

// ── Hak akses per role ────────────────────────────────────────
export const PERMISSIONS: Record<Role, {
  canRefreshAI : boolean   // klik "Refresh Analisis AI"
  canChat      : boolean   // akses Chat Room AI
  canToggleAI  : boolean   // toggle AI on/off (admin only)
}> = {
  admin    : { canRefreshAI: true,  canChat: true,  canToggleAI: true  },
  analyst  : { canRefreshAI: true,  canChat: true,  canToggleAI: false },
  planning : { canRefreshAI: false, canChat: true,  canToggleAI: false },
  viewer   : { canRefreshAI: false, canChat: false, canToggleAI: false },
}

export function can(role: Role, action: keyof typeof PERMISSIONS[Role]): boolean {
  return PERMISSIONS[role][action] === true
}

// ── Daftar user dari env var ──────────────────────────────────
// Format USER_CREDENTIALS di Vercel:
// [{"username":"ppicadira","password":"pass123","name":"PPIC Adira","role":"admin"},...]
export function getUsers(): Array<User & { password: string }> {
  try {
    const raw = process.env.USER_CREDENTIALS ?? "[]"
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function findUser(username: string, password: string): User | null {
  const users = getUsers()
  const found = users.find(
    u => u.username === username && u.password === password
  )
  if (!found) return null
  return { username: found.username, name: found.name, role: found.role }
}

// ── JWT helpers ───────────────────────────────────────────────
const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "planning-ai-secret-ganti-ini"
)
const COOKIE_NAME = "planning_session"

export async function signToken(user: User): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .setIssuedAt()
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as User
  } catch {
    return null
  }
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export { COOKIE_NAME }
