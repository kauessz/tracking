// server/supabaseClient.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.warn("⚠️  SUPABASE_URL ou SUPABASE_SERVICE_KEY ausentes. Verifique suas variáveis de ambiente.");
}

// client com service role -> acesso total (somente servidor)
const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = { supabase };