import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CONFIG } from './config.js';

// Client único do app. Sessão persistida em localStorage; PKCE p/ OAuth Google.
export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// URL do botão "Entrar com Google"
export function googleOAuthUrl() {
  const redirect = `${location.origin}/login-callback.html`;
  return supabase.auth.getUrlForOAuth('google', { redirectTo: redirect });
}