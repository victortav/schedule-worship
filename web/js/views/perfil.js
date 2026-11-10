// =====================================================================
// Perfil: dados do usuário + instrumentos (edição própria) + licenças
// =====================================================================
import { supabase } from '../client.js';
import {
  fetchAbsences, fetchInstruments, fetchMemberInstruments, saveMyInstruments,
} from '../api.js';
import { $, $$, esc, avatar, toast } from '../ui.js';
import { mountAbsences } from './_shared.js';

export const Perfil = {
  async render(el) {
    const ME = window.ME;
    const [{ data: sess }, instruments, mi, absences] = await Promise.all([
      supabase.auth.getSession(), fetchInstruments(), fetchMemberInstruments(), fetchAbsences(),
    ]);
    const mineIds = mi[ME.id] || [];
    const church = window.ACTIVE_CHURCH;

    el.innerHTML = `
      <h1>Perfil</h1>
      <div class="card">
        <div class="row" style="align-items:center">
          ${avatar(ME.full_name, 56)}
          <div class="grow">
            <strong>${esc(ME.full_name)}</strong>
            <div class="muted small">${esc(sess.session?.user?.email || '')}${
              ME.role === 'system_admin' ? ' · 🛡 admin de sistema' : ''
            }</div>
            <div class="muted small">⛪ ${esc(church?.name || '—')}${
              church ? ' · ' + (church.role === 'admin' ? '👑 admin da igreja' : 'membro') : ''
            }</div>
          </div>
        </div>
      </div>

      <h2 style="margin-top:20px">🎸 Instrumentos que eu toco</h2>
      <div class="card">
        <p class="muted small">Marque os instrumentos que você toca — o primeiro vira o principal.</p>
        <div class="inst-picks" id="pf-inst">
          ${instruments
            .map(
              (i) =>
                `<label><input type="checkbox" value="${i.id}" ${mineIds.includes(i.id) ? 'checked' : ''}> ${esc(i.name)}</label>`
            )
            .join('')}
        </div>
        <div class="form-actions"><button class="btn primary" id="pf-save">Salvar instrumentos</button></div>
      </div>

      <h2 style="margin-top:20px">🏖 Minhas licenças</h2>
      <div id="pf-abs"></div>`;

    $('#pf-save', el).onclick = async () => {
      const ids = $$('#pf-inst input:checked', el).map((c) => Number(c.value));
      try {
        await saveMyInstruments(ME, ids);
        toast('Instrumentos salvos');
      } catch {
        /* toast já veio da api */
      }
    };

    mountAbsences($('#pf-abs', el), ME, absences[ME.id] || [], () => this.render(el));
  },
};
