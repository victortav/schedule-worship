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

// Inicia o login com Google (o supabase-js faz o redirect sozinho).
export async function signInWithGoogle() {
  const redirectTo = `${location.origin}/login-callback.html`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
}