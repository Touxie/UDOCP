import { verifyAdminPassword } from '../../../../lib/auth'
import supabase from '../../../../lib/supabase'

export default async function handler(req, res) {
  const { password, ...body } = req.body || {}

  if (!await verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  // POST — criar movimento
  if (req.method === 'POST') {
    const { date, type, description, amount, notes } = body
    if (!date || !type || !description || !amount) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta' })
    }
    const { data, error } = await supabase
      .from('transactions')
      .insert({ date, type, description, amount: parseFloat(amount), notes: notes || '' })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  // DELETE — eliminar todos
  if (req.method === 'DELETE') {
    const { error } = await supabase.from('transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
