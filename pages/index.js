import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v) {
  const abs = Math.abs(v).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (v < 0 ? '- ' : '') + abs + ' €'
}

function fmtDate(d) {
  if (!d) return ''
  const s = d.split('T')[0].split('-')
  return `${s[2]}/${s[1]}/${s[0]}`
}

function monthLabel(ym) {
  const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const [y, m] = ym.split('-')
  return MONTHS[parseInt(m) - 1] + ' ' + y
}

function computeMovements(transactions, saldoInicial) {
  const sorted = [...transactions].sort((a, b) => {
    const dd = a.date.localeCompare(b.date)
    if (dd !== 0) return dd
    return new Date(a.created_at) - new Date(b.created_at)
  })
  let balance = parseFloat(saldoInicial) || 0
  return sorted.map(t => {
    const si = balance
    const amt = parseFloat(t.amount)
    balance = t.type === 'entrada' ? balance + amt : balance - amt
    return { ...t, amount: amt, saldoInicial: si, saldoFinal: balance }
  })
}

function exportCSV(movs, config) {
  const rows = [['Data','Descritivo','Tipo','Saldo Inicial','Entradas','Saídas','Saldo Final','Notas']]
  movs.forEach(m => rows.push([
    fmtDate(m.date), m.description,
    m.type === 'entrada' ? 'Entrada' : 'Saída',
    m.saldoInicial.toFixed(2),
    m.type === 'entrada' ? m.amount.toFixed(2) : '',
    m.type === 'saida' ? m.amount.toFixed(2) : '',
    m.saldoFinal.toFixed(2), m.notes || '',
  ]))
  const csv = rows.map(r => r.map(c => `"${c}"`).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `caixa_cp_${config.epoca?.replace('/', '-') || 'export'}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  )
}

function EditModal({ transaction: t, onSave, onClose }) {
  const [form, setForm] = useState({
    date: t.date?.split('T')[0] || '',
    type: t.type || 'entrada',
    description: t.description || '',
    amount: t.amount || '',
    notes: t.notes || '',
  })
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-title">Editar Movimento</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Data</label>
            <input type="date" value={form.date} onChange={set('date')} />
          </div>
          <div className="form-group">
            <label>Tipo</label>
            <select value={form.type} onChange={set('type')}>
              <option value="entrada">Entrada (Receita)</option>
              <option value="saida">Saída (Despesa)</option>
            </select>
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label>Descritivo</label>
            <input type="text" value={form.description} onChange={set('description')} />
          </div>
          <div className="form-group">
            <label>Valor (€)</label>
            <input type="number" value={form.amount} onChange={set('amount')} min="0" step="0.01" />
          </div>
          <div className="form-group">
            <label>Notas</label>
            <input type="text" value={form.notes} onChange={set('notes')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(t.id, form)}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState('dashboard')
  const [transactions, setTransactions] = useState([])
  const [config, setConfig] = useState({ epoca: '', saldo_inicial: 0 })
  const [loading, setLoading] = useState(true)
  const [adminAuthed, setAdminAuthed] = useState(false)
  const [adminPwd, setAdminPwd] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [loginPwd, setLoginPwd] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' })
  const [filterMonth, setFilterMonth] = useState('')
  const [filterType, setFilterType] = useState('')
  const [editModal, setEditModal] = useState(null)

  const [newForm, setNewForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'entrada', description: '', amount: '', notes: '',
  })
  const [cfgForm, setCfgForm] = useState({ epoca: '', saldo_inicial: '', new_password: '' })

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ show: true, msg, type })
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3200)
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data')
      if (!res.ok) throw new Error()
      const d = await res.json()
      setConfig(d.config)
      setTransactions(d.transactions || [])
      setCfgForm(f => ({ ...f, epoca: d.config.epoca, saldo_inicial: d.config.saldo_inicial }))
    } catch {
      showToast('Erro ao carregar dados.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const saved = typeof window !== 'undefined' && sessionStorage.getItem('cp_pwd')
    if (saved) { setAdminPwd(saved); setAdminAuthed(true) }
  }, [])

  // ── Auth ──
  const doLogin = async () => {
    setLoginError('')
    setLoginLoading(true)
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPwd }),
      })
      if (res.ok) {
        setAdminPwd(loginPwd)
        sessionStorage.setItem('cp_pwd', loginPwd)
        setAdminAuthed(true)
        setShowLogin(false)
        setLoginPwd('')
        showToast('Sessão iniciada com sucesso.')
      } else {
        setLoginError('Palavra-passe incorreta.')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  const doLogout = () => {
    setAdminPwd('')
    setAdminAuthed(false)
    sessionStorage.removeItem('cp_pwd')
    showToast('Sessão terminada.', 'error')
  }

  // ── CRUD ──
  const adminFetch = useCallback(async (url, method, body) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPwd, ...body }),
    })
    if (res.status === 401) { showToast('Sessão expirada. Autentique novamente.', 'error'); doLogout(); return null }
    return res
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPwd, showToast])

  const addTransaction = async () => {
    const { date, type, description, amount, notes } = newForm
    if (!date || !description || !amount || parseFloat(amount) <= 0) {
      showToast('Preencha todos os campos obrigatórios.', 'error'); return
    }
    const res = await adminFetch('/api/admin/transactions', 'POST', { date, type, description, amount: parseFloat(amount), notes })
    if (res?.ok) {
      showToast('Movimento adicionado.')
      setNewForm(f => ({ ...f, description: '', amount: '', notes: '' }))
      fetchData()
    } else if (res) {
      const d = await res.json()
      showToast(d.error || 'Erro ao adicionar.', 'error')
    }
  }

  const updateTransaction = async (id, form) => {
    const res = await adminFetch(`/api/admin/transactions/${id}`, 'PUT', {
      date: form.date, type: form.type,
      description: form.description, amount: parseFloat(form.amount), notes: form.notes,
    })
    if (res?.ok) {
      showToast('Movimento atualizado.')
      setEditModal(null)
      fetchData()
    } else if (res) {
      showToast('Erro ao atualizar.', 'error')
    }
  }

  const deleteTransaction = async (id) => {
    if (!confirm('Confirma a eliminação deste movimento?')) return
    const res = await adminFetch(`/api/admin/transactions/${id}`, 'DELETE', {})
    if (res?.ok) { showToast('Eliminado.', 'error'); fetchData() }
    else showToast('Erro ao eliminar.', 'error')
  }

  const deleteAll = async () => {
    if (!confirm('Tem a certeza que quer eliminar TODOS os movimentos? Esta ação não pode ser desfeita.')) return
    if (!confirm('CONFIRMAÇÃO FINAL: eliminar tudo?')) return
    const res = await adminFetch('/api/admin/transactions', 'DELETE', {})
    if (res?.ok) { showToast('Todos os movimentos eliminados.', 'error'); fetchData() }
  }

  const saveConfig = async () => {
    const res = await adminFetch('/api/admin/config', 'PUT', cfgForm)
    if (res?.ok) {
      showToast('Configurações guardadas.')
      setCfgForm(f => ({ ...f, new_password: '' }))
      fetchData()
    } else if (res) {
      const d = await res.json()
      showToast(d.error || 'Erro ao guardar.', 'error')
    }
  }

  // ── Computed ──
  const movs = computeMovements(transactions, config.saldo_inicial)
  const months = [...new Set(movs.map(m => m.date.slice(0, 7)))].sort()

  let filteredMovs = movs
  if (filterMonth) filteredMovs = filteredMovs.filter(m => m.date.startsWith(filterMonth))
  if (filterType) filteredMovs = filteredMovs.filter(m => m.type === filterType)

  const totalEntradas = movs.reduce((s, m) => m.type === 'entrada' ? s + m.amount : s, 0)
  const totalSaidas = movs.reduce((s, m) => m.type === 'saida' ? s + m.amount : s, 0)
  const saldoAtual = movs.at(-1)?.saldoFinal ?? (parseFloat(config.saldo_inicial) || 0)

  const byMonth = {}
  movs.forEach(m => {
    const k = m.date.slice(0, 7)
    if (!byMonth[k]) byMonth[k] = { entradas: 0, saidas: 0, saldoFinal: 0 }
    if (m.type === 'entrada') byMonth[k].entradas += m.amount
    else byMonth[k].saidas += m.amount
    byMonth[k].saldoFinal = m.saldoFinal
  })
  const monthKeys = Object.keys(byMonth).sort()
  const chartLabels = monthKeys.map(k => monthLabel(k))
  const chartBalances = monthKeys.map(k => +byMonth[k].saldoFinal.toFixed(2))
  const chartEntradas = monthKeys.map(k => +byMonth[k].entradas.toFixed(2))
  const chartSaidas = monthKeys.map(k => +byMonth[k].saidas.toFixed(2))

  const lineData = {
    labels: chartLabels,
    datasets: [{
      label: 'Saldo Final',
      data: chartBalances,
      borderColor: '#1e40af',
      backgroundColor: 'rgba(30,64,175,.08)',
      borderWidth: 2.5,
      pointRadius: 5,
      pointBackgroundColor: chartBalances.map(v => v >= 0 ? '#16a34a' : '#dc2626'),
      fill: true, tension: .3,
    }],
  }

  const barData = {
    labels: chartLabels,
    datasets: [
      { label: 'Entradas', data: chartEntradas, backgroundColor: 'rgba(22,163,74,.75)', borderRadius: 5 },
      { label: 'Saídas', data: chartSaidas, backgroundColor: 'rgba(220,38,38,.75)', borderRadius: 5 },
    ],
  }

  const lineOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } } },
    scales: {
      y: { ticks: { callback: v => fmt(v) }, grid: { color: '#e2e8f0' } },
      x: { grid: { color: '#e2e8f0' } },
    },
  }

  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } } },
    scales: {
      y: { ticks: { callback: v => fmt(v) }, grid: { color: '#e2e8f0' } },
      x: { grid: { display: false } },
    },
  }

  const closeLogin = () => { setShowLogin(false); setLoginError('') }
  const sortedTransactions = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

  if (loading) return <div className="loading">A carregar...</div>

  const saldoIni = parseFloat(config.saldo_inicial) || 0

  return (
    <>
      <Head>
        <title>Caixa — Comissão de Pais {config.epoca ? `| ${config.epoca}` : ''}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Gestão de caixa da Comissão de Pais" />
      </Head>

      {/* Toast */}
      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.msg}</div>

      {/* Login Modal */}
      {showLogin && (
        <div className="modal-overlay">
          <div className="modal">
            <button className="modal-close" onClick={closeLogin}>✕</button>
            <div className="modal-title">🔐 Área Administrativa</div>
            <p className="login-hint">Introduza a palavra-passe para gerir movimentos.</p>
            <div className="form-group">
              <label>Palavra-passe</label>
              <input
                type="password"
                value={loginPwd}
                onChange={e => setLoginPwd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            {loginError && <div className="form-error">{loginError}</div>}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeLogin}>Cancelar</button>
              <button className="btn btn-primary" onClick={doLogin} disabled={loginLoading}>
                {loginLoading ? 'A verificar...' : 'Entrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <EditModal
          transaction={editModal}
          onSave={updateTransaction}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Nav */}
      <header className="site-header">
        <div className="header-inner">
          <img src="/logo.png" alt="UDO" className="header-logo" onError={e => { e.target.style.display = 'none' }} />
          <div className="header-center">
            <div className="header-title">UNIÃO DESPORTIVA OLIVEIRENSE</div>
            <div className="header-subtitle">CAIXA — COMISSÃO DE PAIS</div>
            <div className="header-line" />
          </div>
          <nav className="header-nav">
            {[
              { id: 'dashboard', label: 'Resumo' },
              { id: 'movimentos', label: 'Movimentos' },
              { id: 'admin', label: 'Admin' },
            ].map(t => (
              <button
                key={t.id}
                className={`nav-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <>
            <div className="stats-grid">
              <StatCard label="Saldo Atual em Caixa" value={fmt(saldoAtual)} sub={`Época ${config.epoca}`} color={saldoAtual >= 0 ? 'positive' : 'negative'} />
              <StatCard label="Total Entradas" value={fmt(totalEntradas)} sub={`${movs.filter(m => m.type === 'entrada').length} movimentos`} color="positive" />
              <StatCard label="Total Saídas" value={fmt(totalSaidas)} sub={`${movs.filter(m => m.type === 'saida').length} movimentos`} color="negative" />
              <StatCard label="Resultado Líquido" value={fmt(totalEntradas - totalSaidas)} sub="Entradas − Saídas" color={(totalEntradas - totalSaidas) >= 0 ? 'positive' : 'negative'} />
            </div>

            {chartLabels.length > 0 ? (
              <>
                <div className="card">
                  <div className="card-title">📈 Evolução do Saldo por Mês</div>
                  <div className="chart-container">
                    <Line data={lineData} options={lineOpts} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">📊 Receitas vs Despesas por Mês</div>
                  <div className="chart-container">
                    <Bar data={barData} options={barOpts} />
                  </div>
                </div>
              </>
            ) : (
              <div className="card">
                <div className="empty-state">
                  Sem movimentos. Aceda ao <strong>Admin</strong> para adicionar dados.
                </div>
              </div>
            )}
          </>
        )}

        {/* ── MOVIMENTOS ── */}
        {tab === 'movimentos' && (
          <div className="card">
            <div className="section-header">
              <div className="card-title">📋 Livro de Caixa</div>
              <div className="filter-row">
                <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                  <option value="">Todos os meses</option>
                  {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">Todos os tipos</option>
                  <option value="entrada">Entradas</option>
                  <option value="saida">Saídas</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descritivo</th>
                    <th className="text-right">Saldo Inicial</th>
                    <th className="text-right">Entradas</th>
                    <th className="text-right">Saídas</th>
                    <th className="text-right">Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  {filterMonth ? (
                    filteredMovs.length > 0 && (
                      <tr className="row-opening">
                        <td colSpan="2" className="td-label-opening">Saldo de abertura do mês</td>
                        <td className={`text-right font-mono td-bold ${filteredMovs[0].saldoInicial >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>
                          {fmt(filteredMovs[0].saldoInicial)}
                        </td>
                        <td /><td /><td />
                      </tr>
                    )
                  ) : (
                    <tr className="row-transitado">
                      <td className="td-label-transitado-sm">Abertura</td>
                      <td className="td-label-transitado">SALDO TRANSITADO DA ÉPOCA ANTERIOR</td>
                      <td className={`text-right font-mono td-bold ${saldoIni >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>
                        {fmt(saldoIni)}
                      </td>
                      <td /><td />
                      <td className={`text-right font-mono td-bold ${saldoIni >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>
                        {fmt(saldoIni)}
                      </td>
                    </tr>
                  )}

                  {filteredMovs.length === 0 ? (
                    <tr><td colSpan="6" className="empty-state">Nenhum movimento encontrado.</td></tr>
                  ) : filteredMovs.map(m => (
                    <tr key={m.id}>
                      <td className="td-date">{fmtDate(m.date)}</td>
                      <td className="td-desc">
                        {m.description}
                        {m.notes && <><br /><span className="td-notes">{m.notes}</span></>}
                      </td>
                      <td className={`text-right font-mono ${m.saldoInicial >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>{fmt(m.saldoInicial)}</td>
                      <td className="text-right font-mono amount-in">{m.type === 'entrada' ? fmt(m.amount) : ''}</td>
                      <td className="text-right font-mono amount-out">{m.type === 'saida' ? fmt(m.amount) : ''}</td>
                      <td className={`text-right font-mono td-bold ${m.saldoFinal >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>{fmt(m.saldoFinal)}</td>
                    </tr>
                  ))}
                </tbody>
                {filteredMovs.length > 0 && (
                  <tfoot>
                    <tr className="tfoot-totals">
                      <td colSpan="2" className="td-label-opening">TOTAIS</td>
                      <td />
                      <td className="text-right font-mono amount-in td-totals">
                        {fmt(filteredMovs.reduce((s, m) => m.type === 'entrada' ? s + m.amount : s, 0))}
                      </td>
                      <td className="text-right font-mono amount-out td-totals">
                        {fmt(filteredMovs.reduce((s, m) => m.type === 'saida' ? s + m.amount : s, 0))}
                      </td>
                      <td className={`text-right font-mono td-totals ${(filteredMovs.at(-1)?.saldoFinal ?? 0) >= 0 ? 'saldo-pos' : 'saldo-neg'}`}>
                        {fmt(filteredMovs.at(-1)?.saldoFinal ?? 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── ADMIN ── */}
        {tab === 'admin' && (
          !adminAuthed ? (
            <div className="card card-locked">
              <div className="lock-icon">🔒</div>
              <div className="lock-title">Área restrita</div>
              <div className="text-hint">Necessita de autenticação para gerir movimentos.</div>
              <button className="btn btn-primary" onClick={() => setShowLogin(true)}>Autenticar</button>
            </div>
          ) : (
            <>
              {/* Config */}
              <div className="card">
                <div className="card-title">⚙️ Configurações da Época</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nome da Época</label>
                    <input
                      type="text"
                      value={cfgForm.epoca}
                      onChange={e => setCfgForm(f => ({ ...f, epoca: e.target.value }))}
                      placeholder="Ex: 2024/2025"
                    />
                  </div>
                  <div className="form-group">
                    <label>Saldo Inicial de Abertura (€)</label>
                    <input
                      type="number"
                      value={cfgForm.saldo_inicial}
                      onChange={e => setCfgForm(f => ({ ...f, saldo_inicial: e.target.value }))}
                      step="0.01"
                    />
                  </div>
                  <div className="form-group">
                    <label>Nova Palavra-passe Admin</label>
                    <input
                      type="password"
                      value={cfgForm.new_password}
                      onChange={e => setCfgForm(f => ({ ...f, new_password: e.target.value }))}
                      placeholder="Deixar vazio para manter"
                    />
                  </div>
                  <div className="form-group form-group-end">
                    <button className="btn btn-primary btn-end" onClick={saveConfig}>
                      Guardar Configurações
                    </button>
                  </div>
                </div>
              </div>

              {/* Add transaction */}
              <div className="card">
                <div className="card-title">➕ Adicionar Movimento</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Data</label>
                    <input
                      type="date"
                      value={newForm.date}
                      onChange={e => setNewForm(f => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="entrada">Entrada (Receita)</option>
                      <option value="saida">Saída (Despesa)</option>
                    </select>
                  </div>
                  <div className="form-group full-col">
                    <label>Descritivo</label>
                    <input
                      type="text"
                      value={newForm.description}
                      onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Nome do movimento..."
                      onKeyDown={e => e.key === 'Enter' && addTransaction()}
                    />
                  </div>
                  <div className="form-group">
                    <label>Valor (€)</label>
                    <input
                      type="number"
                      value={newForm.amount}
                      onChange={e => setNewForm(f => ({ ...f, amount: e.target.value }))}
                      min="0" step="0.01" placeholder="0,00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Notas (opcional)</label>
                    <input
                      type="text"
                      value={newForm.notes}
                      onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="..."
                    />
                  </div>
                  <div className="form-group form-group-end">
                    <button className="btn btn-success btn-end" onClick={addTransaction}>
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {/* Manage transactions */}
              <div className="card">
                <div className="section-header">
                  <div className="card-title">📋 Gerir Movimentos</div>
                  <div className="btn-group">
                    <button className="btn btn-secondary btn-sm" onClick={() => exportCSV(movs, config)}>
                      ⬇ Exportar CSV
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={deleteAll}>
                      🗑 Limpar Tudo
                    </button>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descritivo</th>
                        <th>Tipo</th>
                        <th className="text-right">Valor</th>
                        <th>Notas</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr><td colSpan="6" className="empty-state">Sem movimentos registados.</td></tr>
                      ) : sortedTransactions.map(t => (
                        <tr key={t.id}>
                          <td className="td-date">{fmtDate(t.date)}</td>
                          <td className="td-desc">{t.description}</td>
                          <td><span className={`badge ${t.type === 'entrada' ? 'badge-in' : 'badge-out'}`}>{t.type === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
                          <td className={`text-right font-mono ${t.type === 'entrada' ? 'amount-in' : 'amount-out'}`}>{fmt(parseFloat(t.amount))}</td>
                          <td className="td-notes">{t.notes || ''}</td>
                          <td>
                            <div className="actions-cell">
                              <button className="btn-icon" title="Editar" onClick={() => setEditModal(t)}>✏️</button>
                              <button className="btn-icon" title="Eliminar" onClick={() => deleteTransaction(t.id)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-title">🔓 Sessão</div>
                <button className="btn btn-secondary" onClick={doLogout}>Terminar Sessão</button>
              </div>
            </>
          )
        )}
      </main>
    </>
  )
}
