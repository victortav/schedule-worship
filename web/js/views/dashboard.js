// =====================================================================
// Status (dashboard): eventos futuros em estado crítico / alerta / ok
// Estilo cards, com botão "Ver evento" e resumo do repertório.
// =====================================================================
import { fetchEventStatus, fetchEventSongs } from '../api.js';
import { $, esc, fmtWhen, relDay, statusBadge, statusReasons } from '../ui.js';
import { shareEvent } from './_shared.js';

export const Dashboard = {
  async render(el) {
    const rows = await fetchEventStatus(window.ACTIVE_CHURCH_ID);
    const crit = rows.filter((r) => r.e_critico);
    const alert = rows.filter((r) => !r.e_critico && r.e_alerta);
    const ok = rows.filter((r) => !r.e_critico && !r.e_alerta);

    el.innerHTML = `
      <h1>Status da banda <span class="muted small">⛪ ${esc(window.ACTIVE_CHURCH?.name || '')}</span></h1>
      ${
        rows.length
          ? `<div class="row" style="gap:8px;flex-wrap:wrap">
               <span class="badge b-critico">🔴 ${crit.length} crítico(s)</span>
               <span class="badge b-alerta">🟡 ${alert.length} alerta(s)</span>
               <span class="badge b-ok">🟢 ${ok.length} ok</span>
             </div>`
          : ''
      }
      <div id="db-list" style="margin-top:12px"></div>`;

    const list = $('#db-list', el);
    if (!rows.length) {
      list.innerHTML =
        '<div class="empty big"><div class="big">🎉</div><p>Nenhum evento futuro.</p></div>';
      return;
    }

    for (const r of [...crit, ...alert, ...ok]) {
      const songs = await fetchEventSongs(r.id);
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="row">
          <div class="grow">
            <strong>${r.type === 'ensaio' ? '🎼' : '🎤'} ${esc(r.title)}</strong>
            <div class="muted small">${fmtWhen(r.starts_at, r.ends_at)} · ${relDay(r.starts_at)}${
              r.location ? ' · ' + esc(r.location) : ''
            }</div>
          </div>
          ${statusBadge(r)}
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="chip">✅ ${r.confirmados}/${r.membros}</span>
          <span class="chip">🎙 voz: ${r.vozes}</span>
          <span class="chip">🎸 base: ${r.bases}</span>
          ${statusReasons(r).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}
        </div>
        <div class="form-actions" style="margin-top:10px">
          <a class="btn small primary" href="#/evento/${r.id}">Ver evento</a>
          ${
            songs.length
              ? `<a class="btn small ghost" href="#/evento/${r.id}">🎵 ${songs.length} música${songs.length > 1 ? 's' : ''}</a>`
              : '<span class="muted small" style="align-self:center">sem repertório</span>'
          }
          <button class="btn small ghost" data-share="${r.id}">📤 Compartilhar</button>
        </div>`;
      list.appendChild(card);
      $(`[data-share="${r.id}"]`, card).onclick = async () => {
        try {
          await shareEvent(r.id);
        } catch {
          /* toast na api */
        }
      };
    }
  },
};
