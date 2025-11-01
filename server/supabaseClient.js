// server/supabaseClient.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Estas variáveis vêm do ambiente do Render (.env do serviço)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('⚠️  SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes. Verifique suas variáveis de ambiente.');
}

// Client com a service role key (backend ONLY, nunca expor no front)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = { supabase };