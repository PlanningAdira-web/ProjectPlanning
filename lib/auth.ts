import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

export type Role = "admin" | "planning" | "viewer"

export type User = {
  username : string
  name     : string
  role     : Role
}

// Hak akses per role
export const PERMISSIONS: Record<Role, {
  canRefreshAI : boolean
  canChat      : boolean
  canToggleAI  : boolean
}> = {
  admin    : { canRefreshAI: true,  canChat: true,  canToggleAI: true  },
  planning : { canRefreshAI: false, canChat: true,  canToggleAI: false },
  viewer   : { canRefreshAI: false, canChat: false, canToggleAI: false },
}

export function can(role: Role, action: keyof typeof PERMISSIONS[Role]): boolean {
  return PERMISSIONS[role][action] === true
}

// User tetap di kode — tidak perlu env var
// Untuk ganti password, edit langsung di sini lalu push
const USERS: Array<User & { password: string }> = [
  { username:"analyst",  password:"analyst123",  name:"PPIC Adira",    role:"admin"    },
  { username:"planning", password:"planning123", name:"Planning Team",  role:"planning" },
]

export function findUser(username: string, password: string): User | null {
  const found = USERS.find(u => u.username === username && u.password === password)
  if (!found) return null
  return { username: found.username, name: found.name, role: found.role }
}

// Guest — langsung masuk tanpa password
export const GUEST_USER: User = {
  username : "guest",
  name     : "Guest",
  role     : "viewer",
}

// JWT helpers
const SECRET      = new TextEncoder().encode(process.env.JWT_SECRET ?? "planning-adira-secret-2024")
export const COOKIE_NAME = "planning_session"

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
  } catch { return null }
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}
