import bcrypt from 'bcryptjs'
import supabase from './supabase'

export async function verifyAdminPassword(password) {
  if (!password) return false

  const { data, error } = await supabase
    .from('config')
    .select('pwd_hash')
    .eq('id', 1)
    .single()

  if (error || !data) return false

  if (!data.pwd_hash) {
    // Primeiro login: aceitar password da variável de ambiente
    const defaultPwd = process.env.ADMIN_PASSWORD || 'admin123'
    if (password !== defaultPwd) return false
    // Guardar hash para próximos logins
    const hash = await bcrypt.hash(password, 10)
    await supabase.from('config').update({ pwd_hash: hash }).eq('id', 1)
    return true
  }

  return bcrypt.compare(password, data.pwd_hash)
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10)
}
