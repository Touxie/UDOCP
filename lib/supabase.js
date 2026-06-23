import { createClient } from '@supabase/supabase-js'

// Server-side only — uses service_role key (bypasses RLS)
// NEVER expose SUPABASE_SERVICE_ROLE_KEY to the browser
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default supabase
