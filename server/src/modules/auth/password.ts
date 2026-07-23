import bcrypt from 'bcryptjs'

// System_Architecture §4: hash password (bcrypt). Cost 12 = compromesso sicurezza/latenza.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
