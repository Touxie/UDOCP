import supabase from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const [configRes, transRes] = await Promise.all([
    supabase.from('config').select('epoca, saldo_inicial').eq('id', 1).single(),
    supabase.from('transactions').select('*').order('date', { ascending: true }).order('created_at', { ascending: true }),
  ])

  if (configRes.error) return res.status(500).json({ error: configRes.error.message })

  res.json({
    config: configRes.data,
    transactions: transRes.data || [],
  })
}
