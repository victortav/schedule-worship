// =====================================================================
// Perfil: dados do usuário + minhas licenças
// (instrumentos e nome são gerenciados pelo admin — read-only aqui)
// =====================================================================
import { supabase } from '../client.js';
import { fetchMembers, fetchAbsences } from '../api.js';
import { $, esc, avatar } from '../ui.js';
import { mountAbsences } from './_shared.js';

export const Perfil = {
  async render(el) {
    const ME = window.ME;
    const [{ data: sess }, members, absences] = await Promise.all([
      supabase.auth.getSession(), fetchMembers(), fetchAbsences(),
    ]);
    const me = members.find((m) => m.id === ME.id) || { instruments: [] };

    el.innerHTML = `
      <h1>Perfil</h1>
      <div class="card">
        <div class="row" style="align-items:center">
          ${avatar(ME.full_name, 56)}
          <div class="grow">
            <strong>${esc(ME.full_name)}</strong>
            <div class="muted small">${esc(sess.session?.user?.email || '')}
              ${ME.role === 'admin' ? ' · 👑 admin' : ''}</div>
          </div>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center">
          <span class="muted small">Instrumentos (editado pelo admin):</span>
          ${me.instruments.length
            ? me.instruments.map((i) => `<span class="chip inst">${esc(i.name)}</span>`).join('')
            : '<span class="muted">nenhum — peça ao admin</span>'}
        </div>
      </div>
      <h2 style="margin-top:20px">🏖 Minhas licenças</h2>
      <div id="pf-abs"></div>`;

    mountAbsences($('#pf-abs', el), ME, absences[ME.id] || [], () => this.render(el));
  },
};