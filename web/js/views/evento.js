// =====================================================================
// Detalhe do evento: status + participação de todos + minha resposta
// =====================================================================
import {
  fetchEvent, fetchEventStatusById, fetchEventConfirmations, fetchMembers,
  isOnLeave, fetchInstruments, fetchMemberInstruments, fetchMyEventInstruments,
} from '../api.js';
import { $, esc, fmtWhen, relDay, statusBadge, statusReasons, avatar, instNames, confirmLabel } from '../ui.js';
import { mountAnswer } from './_shared.js';

export const Evento = {
  async render(el, id) {
    const ME = window.ME;
    const [event, st, conf, members] = await Promise.all([
      fetchEvent(id), fetchEventStatusById(id), fetchEventConfirmations(id), fetchMembers(),
    ]);
    if (!event) {
      el.innerHTML =
        '<div class="empty big"><div class="big">🤔</div><p>Evento não encontrado.</p></div>';
      return;
    }

    const confMap = Object.fromEntries(conf.map((c) => [c.profile_id, c]));
    const [instruments, mi] = await Promise.all([fetchInstruments(), fetchMemberInstruments()]);
    const myInstruments = instruments.filter((i) => (mi[ME.id] || []).includes(i.id));
    const myConf = confMap[ME.id] || { status: 'pendente', instruments: [] };
    const myPicks = await fetchMyEventInstruments(ME, id);

    el.innerHTML = `
      <a href="#/calendario" class="muted small" style="text-decoration:none">‹ voltar</a>
      <h1>${event.type === 'ensaio' ? '🎼' : '🎤'} ${esc(event.title)}</h1>
      <div class="muted">${fmtWhen(event.starts_at, event.ends_at)} · ${relDay(event.starts_at)}${event.location ? ' · 📍 ' + esc(event.location) : ''}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        ${st ? statusBadge(st) : ''}
        ${st ? statusReasons(st).map((x) => `<span class="chip">${esc(x)}</span>`).join('') : ''}
        <span class="chip">✅ ${st ? st.confirmados : 0}/${st ? st.membros : 0} confirmados</span>
      </div>
      ${event.notes ? `<p class="muted" style="margin-top:8px">📝 ${esc(event.notes)}</p>` : ''}

      <h2 style="margin-top:20px">Sua resposta</h2>
      <div class="card" id="ev-answer"></div>

      <h2 style="margin-top:20px">Participação</h2>
      <div class="card">
        ${members
          .map((m) => {
            const c = confMap[m.id] || { status: 'pendente', instruments: [] };
            const lic = isOnLeave(m.absences, event.starts_at);
            return `
            <div class="list-row">
              ${avatar(m.full_name)}
              <div class="grow">
                <strong>${esc(m.full_name)}</strong>
                ${lic ? '<span class="chip">🏖 de licença</span>' : ''}
                ${c.instruments.length ? `<div class="muted small">Tocando: ${esc(instNames(c.instruments))}</div>` : ''}
              </div>
              <span class="chip">${confirmLabel(c.status)}</span>
            </div>`;
          })
          .join('')}
      </div>`;

    mountAnswer($('#ev-answer', el), ME, id, myInstruments, {
      status: myConf.status,
      picks: myPicks,
    });
  },
};