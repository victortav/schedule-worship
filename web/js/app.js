// =====================================================================
// Bootstrap + roteador por hash (sem build, sem dependências)
// Rotas: #/meu-agenda (default) #/dashboard #/calendario #/evento/:id
//        #/membros #/perfil #/admin
// Cada view exporta { render(el, arg) } — função async.
// Contexto global: window.ME, window.ACTIVE_CHURCH(_ID), window.isAdmin()
// =====================================================================
import { supabase } from '/js/client.js';
import { $, esc, initTheme, toggleTheme } from '/js/ui.js';
import { fetchMyChurches, fetchAllChurches } from '/js/api.js';
import { MeuAgenda } from '/js/views/meu-agenda.js';
import { Dashboard } from '/js/views/dashboard.js';
import { Calendario } from '/js/views/calendario.js';
import { Evento } from '/js/views/evento.js';
import { Membros } from '/js/views/membros.js';
import { Perfil } from '/js/views/perfil.js';
import { Repertorio } from '/js/views/repertorio.js';
import { Admin } from '/js/views/admin.js';

const routes = {
  'meu-agenda': MeuAgenda,
  dashboard: Dashboard,
  calendario: Calendario,
  evento: Evento,
  repertorio: Repertorio,
  membros: Membros,
  perfil: Perfil,
  admin: Admin,
};

let ME = null;         // perfil logado
let CHURCHES = [];     // igrejas do usuário
let ACTIVE = null;     // igreja ativa

window.ME = null;
window.ACTIVE_CHURCH = null;
window.ACTIVE_CHURCH_ID = null;
window.MY_CHURCHES = [];
window.isAdmin = () =>
  !!window.ME && (window.ME.role === 'system_admin' || (window.ACTIVE_CHURCH?.role === 'admin'));

async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select().eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadChurches() {
  const mine = await fetchMyChurches(ME.id);
  const roleById = Object.fromEntries(mine.map((c) => [c.id, c.role]));
  const list = ME.role === 'system_admin' ? await fetchAllChurches() : mine;
  return list.map((c) => ({ ...c, role: roleById[c.id] || 'membro' }));
}

function setActive(c) {
  ACTIVE = c;
  window.ACTIVE_CHURCH = c;
  window.ACTIVE_CHURCH_ID = c ? c.id : null;
  if (c) localStorage.setItem('churchId', c.id);
}

function renderChurchPicker() {
  const box = $('#church-pick');
  box.style.display = 'flex';
  if (CHURCHES.length <= 1) {
    box.innerHTML = `<span class="church-name">⛪ ${esc(CHURCHES[0]?.name || '—')}</span>`;
    return;
  }
  box.innerHTML = `<span class="church-name">⛪</span>
    <select id="church-sel" title="Igreja ativa">
      ${CHURCHES.map(
        (c) => `<option value="${c.id}" ${c.id === ACTIVE.id ? 'selected' : ''}>${esc(c.name)}</option>`
      ).join('')}
    </select>`;
  $('#church-sel').onchange = (e) => {
    setActive(CHURCHES.find((c) => c.id === e.target.value));
    updateAdminNav();
    render();
  };
}

function updateAdminNav() {
  const on = window.isAdmin();
  document.querySelectorAll('.admin-only').forEach((a) => (a.style.display = on ? '' : 'none'));
}

function setThemeIcon() {
  const light = document.documentElement.getAttribute('data-theme') === 'light'
    || (!document.documentElement.getAttribute('data-theme')
        && window.matchMedia('(prefers-color-scheme: light)').matches);
  $('#theme-toggle').textContent = light ? '☀️' : '🌙';
}

async function boot() {
  initTheme();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return location.replace('/index.html');

  try {
    ME = await loadProfile(sess.session.user.id);
  } catch (e) {
    console.error(e);
  }
  if (!ME) return setTimeout(boot, 1500);
  window.ME = ME;

  CHURCHES = await loadChurches();
  window.MY_CHURCHES = CHURCHES;

  if (!CHURCHES.length) {
    $('#boot').innerHTML = `<div class="empty big" style="display:block"><div class="big">⛪</div>
      <p>Você ainda não está vinculado a nenhuma igreja.<br>Peça ao administrador para te adicionar.</p></div>`;
    return;
  }
  const saved = localStorage.getItem('churchId');
  setActive(CHURCHES.find((c) => c.id === saved) || CHURCHES[0]);

  $('#boot').style.display = 'none';
  $('#topbar').style.display = '';
  $('#shell').style.display = '';
  $('#bottomnav').style.display = '';

  renderChurchPicker();

  // tema
  $('#theme-toggle').style.display = '';
  setThemeIcon();
  $('#theme-toggle').onclick = () => {
    toggleTheme();
    setThemeIcon();
  };

  // chip do usuário (topbar)
  const chip = $('#user-chip');
  chip.style.display = 'flex';
  const primeiro = (ME.full_name || 'sem nome').split(' ')[0];
  chip.innerHTML = `
    <a href="#/perfil" class="avatar" title="${esc(ME.full_name || '')}"
       style="width:30px;height:30px;font-size:12px;text-decoration:none">
      ${esc((ME.full_name || '?').slice(0, 2).toUpperCase())}
    </a>
    <a href="#/perfil" class="chip-name" style="color:var(--text);font-size:.9rem;text-decoration:none">${esc(primeiro)}</a>
    <button class="btn small ghost" id="btn-logout">Sair</button>`;
  $('#btn-logout').onclick = async () => {
    await supabase.auth.signOut();
    location.replace('/index.html');
  };

  updateAdminNav();
  window.addEventListener('hashchange', render);
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
