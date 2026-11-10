// =====================================================================
// Bootstrap + roteador por hash (sem build, sem dependências)
// Rotas: #/meu-agenda (default) #/dashboard #/calendario #/evento/:id
//        #/membros #/perfil #/admin
// Cada view exporta { render(el, arg) } — função async.
// =====================================================================
import { supabase } from '/js/client.js';
import { $, esc } from '/js/ui.js';
import { MeuAgenda } from '/js/views/meu-agenda.js';
import { Dashboard } from '/js/views/dashboard.js';
import { Calendario } from '/js/views/calendario.js';
import { Evento } from '/js/views/evento.js';
import { Membros } from '/js/views/membros.js';
import { Perfil } from '/js/views/perfil.js';
import { Admin } from '/js/views/admin.js';

const routes = {
  'meu-agenda': MeuAgenda,
  dashboard: Dashboard,
  calendario: Calendario,
  evento: Evento,
  membros: Membros,
  perfil: Perfil,
  admin: Admin,
};

let ME = null; // perfil logado (profiles)

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function boot() {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return location.replace('/index.html');

  try {
    ME = await loadProfile(sess.session.user.id);
  } catch (e) {
    console.error(e);
  }
  if (!ME) {
    // O trigger cria o profile no 1º login; se ainda não apareceu, tenta de novo
    return setTimeout(boot, 1500);
  }

  window.ME = ME;
  $('#boot').style.display = 'none';
  $('#topbar').style.display = '';
  $('#shell').style.display = '';
  $('#bottomnav').style.display = '';

  // chip do usuário (topbar)
  const chip = $('#user-chip');
  chip.style.display = 'flex';
  const primeiro = (ME.full_name || 'sem nome').split(' ')[0];
  chip.innerHTML = `
    <a href="#/perfil" class="avatar" title="${esc(ME.full_name || '')}"
       style="width:30px;height:30px;font-size:12px;text-decoration:none">
      ${esc((ME.full_name || '?').slice(0, 2).toUpperCase())}
    </a>
    <a href="#/perfil" style="color:var(--text);font-size:.9rem;text-decoration:none">${esc(primeiro)}</a>
    <button class="btn small ghost" id="btn-logout">Sair</button>`;
  $('#btn-logout').onclick = async () => {
    await supabase.auth.signOut();
    location.replace('/index.html');
  };

  // itens de navegação visíveis só para admin
  const isAdmin = ME.role === 'admin';
  document.querySelectorAll('.admin-only').forEach((a) => (a.style.display = isAdmin ? '' : 'none'));

  window.addEventListener('hashchange', () => render());
  render();
}

function render() {
  const m = location.hash.replace(/^#\//, '').match(/^([\w-]+)(?:\/([^/?#]+))?/);
  const name = m && m[1] in routes ? m[1] : 'meu-agenda';
  const arg = m ? m[2] : undefined;

  document.querySelectorAll('[data-route]').forEach((a) =>
    a.classList.toggle('active', a.dataset.route === name)
  );

  const el = $('#view');
  el.innerHTML = '<div class="loading">⏳</div>';
  routes[name].render(el, arg).catch((e) => {
    console.error(e);
    el.innerHTML = `<div class="empty"><div class="big">⚠️</div>
      <p>Erro ao carregar: ${esc(e.message || e)}</p></div>`;
  });
}

boot();