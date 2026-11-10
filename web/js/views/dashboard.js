// =====================================================================
// Dashboard: eventos futuros em estado crítico / alerta / ok
// =====================================================================
import { fetchEventStatus } from '../api.js';
import { $, esc, fmtWhen, relDay, statusBadge, statusReasons } from '../ui.js';

export const Dashboard = {
  async render(el) {
    const rows = await fetchEventStatus(window.ACTIVE_CHURCH_ID);
    const crit = rows.filter((r) => r.e_critico);
    const alert = rows.filter((r) => !r.e_critico && r.e_alerta);
    const ok = rows.filter((r) => !r.e_critico && !r.e_alerta);

    el.innerHTML = `
      <h1>Status da banda</h1>
      ${
        rows.length
          ? `<div class="row" style="gap:8px;flex-wrap:wrap">
               <span class="badge b-critico">🔴 ${crit.length} crítico(s)</span>
               <span class="badge b-alerta">🟡 ${alert.length} alerta(s)</span>
               <span class="badge b-ok">🟢 ${ok.length} ok</span>
             </div>`
          : '<div class="empty big"><div class="big">🎉</div><p>Nenhum evento futuro.</p></div>'
      }
      <div id="db-list"></div>`;

    const list = $('#db-list', el);
    for (const r of [...crit, ...alert, ...ok]) {
      const c = document.createElement('a');
      c.className = 'card clickable';
      c.href = `#/evento/${r.id}`;
      c.innerHTML = `
        <div class="row">
          <div class="grow">
            <strong>${r.type === 'ensaio' ? '🎼' : '🎤'} ${esc(r.title)}</strong>
            <div class="muted small">${fmtWhen(r.starts_at, r.ends_at)} · ${relDay(r.starts_at)}${r.location ? ' · ' + esc(r.location) : ''}</div>
          </div>
          ${statusBadge(r)}
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="chip">✅ ${r.confirmados}/${r.membros}</span>
          <span class="chip">🎙 voz: ${r.vozes}</span>
          <span class="chip">🎸 base: ${r.bases}</span>
          ${statusReasons(r).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}
        </div>`;
      list.appendChild(c);
    }
  },
};