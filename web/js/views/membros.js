// =====================================================================
// Membros: roster com instrumentos e licenças ativas
// =====================================================================
import { fetchMembers, isOnLeave } from '../api.js';
import { $, esc, avatar } from '../ui.js';

export const Membros = {
  async render(el) {
    const members = await fetchMembers(window.ACTIVE_CHURCH_ID);
    el.innerHTML = `
      <h1>Membros</h1>
      <p class="muted">${members.length} integrantes ativos</p>
      <div id="mb-list"></div>`;

    const list = $('#mb-list', el);
    for (const m of members) {
      const onLeave = isOnLeave(m.absences, new Date().toISOString());
      const lic = m.absences.find((a) => new Date(a.end_date) >= new Date());
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `
        <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
          ${avatar(m.full_name)}
          <div class="grow">
            <strong>${esc(m.full_name)}</strong>
            ${m.role === 'admin' ? '<span class="chip">👑 admin</span>' : ''}
            ${onLeave ? '<span class="chip">🏖 de licença</span>' : ''}
            <div class="muted small">
              ${m.instruments.length
                ? m.instruments.map((i) => `<span class="chip inst">${esc(i.name)}</span>`).join(' ')
                : 'sem instrumento cadastrado'}
            </div>
          </div>
          ${lic
            ? `<span class="chip" title="${esc(lic.reason || 'licença')}">🏖 até ${new Date(lic.end_date).toLocaleDateString('pt-BR')}</span>`
            : ''}
        </div>`;
      list.appendChild(c);
    }
  },
};