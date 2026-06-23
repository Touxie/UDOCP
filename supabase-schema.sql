-- ============================================================
-- Caixa CP — Schema Supabase
-- Executar no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ============================================================

-- Tabela de movimentos
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  description TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de configuração (linha única, id=1)
CREATE TABLE IF NOT EXISTS config (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  epoca        TEXT NOT NULL DEFAULT '2024/2025',
  saldo_inicial NUMERIC(10,2) NOT NULL DEFAULT 0,
  pwd_hash     TEXT
);

-- Garantir que existe exatamente uma linha de config
INSERT INTO config (id, epoca, saldo_inicial)
VALUES (1, '2024/2025', -1683.56)
ON CONFLICT (id) DO NOTHING;

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Leitura pública (anon key pode ler)
CREATE POLICY "Public read transactions"
  ON transactions FOR SELECT TO anon USING (true);

CREATE POLICY "Public read config"
  ON config FOR SELECT TO anon USING (true);

-- Escrita apenas via service_role (API routes do Next.js)
-- A service_role key ignora RLS automaticamente — não é necessária policy adicional.
-- ============================================================
