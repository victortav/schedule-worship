// =====================================================================
// Perfil: dados + igrejas (entrar/sair, com aprovação) + instrumentos + licenças
// =====================================================================
import { supabase } from '../client.js';
import {
  fetchAbsences, fetchInstruments, fetchMemberInstruments, saveMyInstruments,
  fetchMyChurches, fetchAllChurches, fetchMyRequests,
  requestJoinChurch, cancelJoinRequest, leaveChurch,
} from '../api.js';
import { $, $$, esc, avatar, toast } from '../ui.js';
import { mountAbsences } from './_shared.js';

export const Perfil = {
  async render(el) {
    const ME = window.ME;
    const [{ data: sess }, instruments, mi, absences, mine, all, reqs] =
      await Promise.all([
        supabase.auth.getSession(),
        fetchInstruments(),
        fetchMemberInstruments(),
        fetchAbsences(),
        fetchMyChurches(ME.id),
        fetchAllChurches(),
        fetchMyRequests(ME.id),
      ]);
    const mineIds = mine.map((c) => c.id);
    const mineSet = new Set(mineIds);
    const reqByChurch = Object.fromEntries(reqs.map((r) => [r.church_id, r.status]));
    const available = all.filter((c) => !mineSet.has(c.id));
    const myIds = mi[ME.id] || [];
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
            <div class="muted small">⛪ igreja ativa: ${esc(church?.name || '—')}${
              church ? ' · ' + (church.role === 'admin' ? '👑 admin da igreja' : 'membro') : ''
            }</div>
          </div>
        </div>
      </div>

      <h2 style="margin-top:20px">⛪ Minhas igrejas</h2>
      <div class="card" id="pf-mine"></div>

      <h2 style="margin-top:20px">➕ Entrar em outra igreja</h2>
      <div class="card" id="pf-join"></div>

      <h2 style="margin-top:20px">🎸 Instrumentos que eu toco</h2>
      <div class="card">
        <p class="muted small">Marque os instrumentos que você toca — o primeiro vira o principal.</p>
        <div class="inst-picks" id="pf-inst">
          ${instruments
            .map(
              (i) =>
                `<label><input type="checkbox" value="${i.id}" ${myIds.includes(i.id) ? 'checked' : ''}> ${esc(i.name)}</label>`
            )
            .join('')}
        </div>
        <div class="form-actions"><button class="btn primary" id="pf-save">Salvar instrumentos</button></div>
      </div>

      <h2 style="margin-top:20px">🏖 Minhas licenças</h2>
      <div id="pf-abs"></div>`;

    // ------------------- Minhas igrejas (sair) -------------------
    const mineBox = $('#pf-mine', el);
    for (const c of mine) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="grow"><strong>${esc(c.name)}</strong>
          <div class="muted small">${c.role === 'admin' ? '👑 admin da igreja' : 'membro'}</div></div>
        ${mine.length > 1 ? `<button class="btn small danger" data-leave="${c.id}">Sair</button>` : '<span class="muted small">(única)</span>'}`;
      mineBox.appendChild(row);
      const lv = $(`[data-leave="${c.id}"]`, row);
      if (lv)
        lv.onclick = async () => {
          if (!confirm(`Sair de "${c.name}"?`)) return;
          try {
            await leaveChurch(ME, c.id);
            toast('Você saiu da igreja');
            setTimeout(() => location.reload(), 500);
          } catch {
            /* toast na api */
          }
        };
    }

    // ------------------- Entrar em outra igreja -------------------
    const joinBox = $('#pf-join', el);
    if (!available.length) {
      joinBox.innerHTML = '<p class="muted small">Você já participa de todas as igrejas disponíveis.</p>';
    } else {
      for (const c of available) {
        const st = reqByChurch[c.id];
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `
          <div class="grow"><strong>${esc(c.name)}</strong>
            ${st === 'pending' ? '<div class="muted small">⏳ aguardando aprovação do admin</div>' : ''}</div>
          ${
            st === 'pending'
              ? `<button class="btn small ghost" data-cancel="${c.id}">Cancelar</button>`
              : `<button class="btn small primary" data-req="${c.id}">Solicitar entrada</button>`
          }`;
        joinBox.appendChild(row);

        const rq = $(`[data-req="${c.id}"]`, row);
        if (rq)
          rq.onclick = async () => {
            try {
              await requestJoinChurch(ME, c.id);
              toast('Solicitação enviada — aguarde a aprovação');
              this.render(el);
            } catch {
              /* toast na api */
            }
          };
        const cc = $(`[data-cancel="${c.id}"]`, row);
        if (cc)
          cc.onclick = async () => {
            try {
              await cancelJoinRequest(ME, c.id);
              toast('Solicitação cancelada');
              this.render(el);
            } catch {
              /* toast na api */
            }
          };
      }
    }

    // ------------------- Instrumentos -------------------
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
