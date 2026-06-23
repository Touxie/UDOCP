import { verifyAdminPassword } from '../../../lib/auth'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Password obrigatória' })

  const ok = await verifyAdminPassword(password)
  if (ok) return res.json({ ok: true })
  return res.status(401).json({ error: 'Palavra-passe incorreta' })
}
