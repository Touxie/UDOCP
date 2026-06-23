import { verifyAdminPassword, hashPassword } from '../../../lib/auth'
import supabase from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).end()

  const { password, epoca, saldo_inicial, new_password } = req.body || {}

  if (!await verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  const updates = {}
  if (epoca !== undefined && epoca !== '') updates.epoca = epoca
  if (saldo_inicial !== undefined && saldo_inicial !== '') {
    updates.saldo_inicial = parseFloat(saldo_inicial)
  }
  if (new_password && new_password.length >= 4) {
    updates.pwd_hash = await hashPassword(new_password)
  } else if (new_password && new_password.length > 0) {
    return res.status(400).json({ error: 'A palavra-passe deve ter pelo menos 4 caracteres' })
  }

  if (Object.keys(updates).length === 0) return res.json({ ok: true })

  const { error } = await supabase.from('config').update(updates).eq('id', 1)
  if (error) return res.status(500).json({ error: error.message })

  res.json({ ok: true })
}
