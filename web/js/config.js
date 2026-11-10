// =====================================================================
// Configuração de ambiente
// - Local (Docker): http://localhost:8000 + anon key do .env
// - Produção: preencha PROD abaixo (mesmo arquivo roda nos dois)
// =====================================================================

const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

const LOCAL = {
  supabaseUrl: 'http://localhost:8000',
  // anon key (HS256) vinda de supabase-local/.env — pública por design, a segurança é o RLS
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE',
};

const PROD = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co', // TODO: trocar
  anonKey: 'SUA-ANON-KEY-PUBLICA', // TODO: trocar (Supabase → API → anon key)
};

export const CONFIG = IS_LOCAL ? LOCAL : PROD;
export const IS_LOCAL_ENV = IS_LOCAL;