// =====================================================================
// Login (index.html) — Google em produção, e-mail/senha no local (mock)
// =====================================================================
import { supabase, googleOAuthUrl } from '/js/client.js';
import { IS_LOCAL_ENV } from '/js/config.js';

const $ = (s) => document.querySelector(s);
const say = (msg) => { $('#li-msg').textContent = msg; };

// Já logado? Vai direto pro app.
const { data: sess } = await supabase.auth.getSession();
if (sess.session) location.replace('/app.html#/meu-agenda');

// No local mostra o formulário de e-mail (e esconde o Google, que
// não está configurado no stack local). Em produção é só o Google.
if (IS_LOCAL_ENV) {
  $('#email-area').style.display = 'block';
  $('#btn-google').style.display = 'none';
}

$('#btn-google').addEventListener('click', () => {
  location.href = googleOAuthUrl();
});

$('#form-login').addEventListener('submit', (e) => e.preventDefault());

$('#btn-login').addEventListener('click', async () => {
  const btn = $('#btn-login');
  btn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: $('#li-email').value.trim(),
      password: $('#li-pass').value,
    });
    if (error) throw error;
    location.replace('/app.html#/meu-agenda');
  } catch (e) {
    say(e.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : e.message);
    btn.disabled = false;
  }
});

$('#btn-signup').addEventListener('click', async () => {
  const email = $('#li-email').value.trim();
  const password = $('#li-pass').value;
  if (!email || !password) return say('Preencha e-mail e senha para criar a conta.');
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: email.split('@')[0] } },
  });
  if (error) return say(error.message);
  // Local: autoconfirm ligado → sessão já existe, entra direto
  location.replace('/app.html#/meu-agenda');
});