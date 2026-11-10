// =====================================================================
// Helpers de UI: DOM, datas, toasts, badges
// =====================================================================

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

const pad = (n) => String(n).padStart(2, '0');

// "sex, 12 jun · 19:30"
export function fmtWhen(startsAt, endsAt) {
  const d = new Date(startsAt);
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
  const ini = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fim = endsAt ? `–${pad(new Date(endsAt).getHours())}:${pad(new Date(endsAt).getMinutes())}` : '';
  return `${dia} · ${ini}${fim}`;
}

export function fmtDay(startsAt) {
  const d = new Date(startsAt);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function isPast(startsAt) {
  return new Date(startsAt) < new Date();
}

// "hoje", "amanhã" ou "em N dias"
export function relDay(startsAt) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(startsAt);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - hoje) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `em ${diff} dias`;
}

let toastTimer;
export function toast(msg, kind = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Badge de criticidade: 🔴 / 🟡 / 🟢
export function statusLevel(row) {
  if (row.e_critico) return 'critico';
  if (row.e_alerta) return 'alerta';
  return 'ok';
}

export function statusBadge(row) {
  const lvl = statusLevel(row);
  const icon = { critico: '🔴', alerta: '🟡', ok: '🟢' }[lvl];
  const label = { critico: 'Crítico', alerta: 'Alerta', ok: 'OK' }[lvl];
  return `<span class="badge b-${lvl}" title="${label}">${icon} ${label}</span>`;
}

// Motivos do status, viram chips no card do dashboard
export function statusReasons(row) {
  const rs = [];
  if (row.vozes === 0) rs.push('sem voz confirmada');
  if (row.bases === 0) rs.push('sem base confirmada');
  if (!row.e_critico && row.e_alerta)
    rs.push(`só ${row.confirmados} de ${row.membros} confirmados`);
  return rs;
}

// Avatar circular com iniciais (sem depender de foto)
export function avatar(name, size = 34) {
  const iniciais = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${size * 0.4}px">${esc(iniciais)}</span>`;
}

// "Voz, Violão" a partir de lista de instrumentos
export function instNames(list) {
  return list?.length ? list.map((i) => i.name).join(', ') : '—';
}

export function confirmLabel(s) {
  return { confirmado: '✅ Vou', ausente: '❌ Não vou', pendente: '⏳ Pendente' }[s] || s;
}

// ---------------- tema (claro/escuro) ----------------
export function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}
export function currentTheme() {
  return (
    document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  );
}
export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  return next;
}