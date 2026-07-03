import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

export type Role = "admin" | "planning" | "viewer"

export type User = {
  username : string
  name     : string
  role     : Role
}

export const PERMISSIONS: Record<Role, {
  canRefreshAI : boolean
  canChat      : boolean
  canBalancing : boolean
  canToggleAI  : boolean
  canTodo      : boolean
}> = {
  admin    : { canRefreshAI:true,  canChat:true,  canBalancing:true,  canToggleAI:true,  canTodo:true  },
  planning : { canRefreshAI:false, canChat:true,  canBalancing:true,  canToggleAI:false, canTodo:true  },
  viewer   : { canRefreshAI:false, canChat:false, canBalancing:false, canToggleAI:false, canTodo:false },
}

export function can(role: Role, action: keyof typeof PERMISSIONS[Role]): boolean {
  return PERMISSIONS[role][action] === true
}

const USERS: Array<User & { password: string }> = [
  { username:"analyst",  password:"analyst123",  name:"PPIC Adira",   role:"admin"    },
  { username:"planning", password:"planning123", name:"Planning Team", role:"planning" },
]

export function findUser(username: string, password: string): User | null {
  const found = USERS.find(u => u.username === username && u.password === password)
  if (!found) return null
  return { username: found.username, name: found.name, role: found.role }
}

export const GUEST_USER: User = { username:"guest", name:"Guest", role:"viewer" }

const SECRET      = new TextEncoder().encode(process.env.JWT_SECRET ?? "planning-adira-secret-2024")
export const COOKIE_NAME = "planning_session"

export async function signToken(user: User): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg:"HS256" })
    .setExpirationTime("24h")
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
