import { verifyAdminPassword } from '../../../../lib/auth'
import supabase from '../../../../lib/supabase'

export default async function handler(req, res) {
  const { id } = req.query
  const { password, ...body } = req.body || {}

  if (!await verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  // PUT — atualizar movimento
  if (req.method === 'PUT') {
    const { date, type, description, amount, notes } = body
    if (!date || !type || !description || !amount) {
      return res.status(400).json({ error: 'Campos obrigatórios em falta' })
    }
    const { data, error } = await supabase
      .from('transactions')
      .update({ date, type, description, amount: parseFloat(amount), notes: notes || '' })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  // DELETE — eliminar movimento
  if (req.method === 'DELETE') {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ ok: true })
  }

  res.status(405).end()
}
