// =====================================================================
// Meu agenda (tela inicial): eventos futuros p/ responder presença
// =====================================================================
import {
  fetchEventStatus, fetchMyConfirmations, fetchMyEventInstruments,
  fetchInstruments, fetchMemberInstruments, fetchAbsences,
} from '../api.js';
import { $, esc, fmtWhen, relDay, statusBadge } from '../ui.js';
import { mountAnswer, mountAbsences } from './_shared.js';

export const MeuAgenda = {
  async render(el) {
    const ME = window.ME;
    const [status, instruments, mi, absences] = await Promise.all([
      fetchEventStatus(), fetchInstruments(), fetchMemberInstruments(), fetchAbsences(),
    ]);
    const ids = status.map((r) => r.id);
    const mine = await fetchMyConfirmations(ME, ids);
    const myInstruments = instruments.filter((i) => (mi[ME.id] || []).includes(i.id));

    const pend = status.filter((r) => !mine[r.id] || mine[r.id].status === 'pendente');
    const done = status.filter((r) => mine[r.id] && mine[r.id].status !== 'pendente');

    el.innerHTML = `
      <h1>Meu agenda</h1>
      <p class="muted">Marque se vai aos ensaios e eventos — e com quais instrumentos.</p>
      <div id="ma-pend"></div>
      <h2 id="ma-done-h" style="margin-top:24px"></h2>
      <div id="ma-done"></div>
      <h2 style="margin-top:24px">🏖 Minhas licenças</h2>
      <div id="ma-abs"></div>`;

    const pendEl = $('#ma-pend', el);
    if (!status.length) {
      pendEl.innerHTML = '<div class="empty big"><div class="big">🎉</div><p>Nenhum evento futuro.</p></div>';
    }
    $('#ma-done-h', el).textContent = done.length ? 'Respondidos' : '';

    const makeCard = async (r, listEl) => {
      const my = mine[r.id] || { status: 'pendente' };
      const picks =
        my.status === 'confirmado' ? await fetchMyEventInstruments(ME, r.id) : [];
      const c = document.createElement('div');
      c.className = 'card';
      c.innerHTML = `
        <div class="row">
          <div class="grow">
            <strong>${r.type === 'ensaio' ? '🎼' : '🎤'} ${esc(r.title)}</strong>
            <div class="muted small">${fmtWhen(r.starts_at, r.ends_at)} · ${relDay(r.starts_at)}${r.location ? ' · ' + esc(r.location) : ''}</div>
          </div>
          ${statusBadge(r)}
        </div>
        <div data-answer style="margin-top:10px"></div>`;
      listEl.appendChild(c);
      mountAnswer($('[data-answer]', c), ME, r.id, myInstruments, {
        status: my.status,
        picks,
      });
    };

    for (const r of pend) await makeCard(r, pendEl);
    for (const r of done) await makeCard(r, $('#ma-done', el));

    mountAbsences($('#ma-abs', el), ME, absences[ME.id] || [], () => this.render(el));
  },
};