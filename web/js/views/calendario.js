// =====================================================================
// Calendário mensal (inicia na segunda-feira) com status de cada evento
// =====================================================================
import { fetchEventStatusBetween } from '../api.js';
import { $, esc, statusLevel } from '../ui.js';

const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const Calendario = {
  cursor: new Date(),
  async render(el) {
    const y = this.cursor.getFullYear();
    const m = this.cursor.getMonth();
    const rows = await fetchEventStatusBetween(
      window.ACTIVE_CHURCH_ID,
      new Date(y, m - 1, 1).toISOString(),
      new Date(y, m + 1, 0, 23, 59).toISOString()
    );

    const byDay = {};
    for (const r of rows) (byDay[new Date(r.starts_at).toDateString()] ??= []).push(r);

    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7; // segunda = 0
    const total = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = offset - 1; i >= 0; i--) cells.push({ d: new Date(y, m, -i), other: true });
    for (let d = 1; d <= total; d++) cells.push({ d: new Date(y, m, d), other: false });
    let nd = 1;
    while (cells.length % 7) cells.push({ d: new Date(y, m + 1, nd++), other: true });

    const hojeStr = new Date().toDateString();
    const title = cap(first.toLocaleDateString('pt-BR', { month: 'long' }));

    el.innerHTML = `
      <h1>Calendário</h1>
      <div class="cal-nav">
        <button class="btn small ghost" id="cal-prev" title="Mês anterior">‹</button>
        <strong class="cal-month">${title} ${y}</strong>
        <button class="btn small ghost" id="cal-next" title="Mês seguinte">›</button>
        <button class="btn small" id="cal-today">Hoje</button>
      </div>
      <div class="cal-head">${DOW.map((d) => `<span class="dow">${d}</span>`).join('')}</div>
      <div class="cal-grid">
        ${cells
          .map((c) => {
            const evs = byDay[c.d.toDateString()] || [];
            return `<div class="cal-cell${c.other ? ' other' : ''}${c.d.toDateString() === hojeStr ? ' today' : ''}${evs.length ? ' dn' : ''}">
              <span>${c.d.getDate()}</span>
              ${evs
                .slice(0, 3)
                .map((r) => `<a class="cal-ev e-${statusLevel(r)}" href="#/evento/${r.id}" title="${esc(r.title)}">${esc(r.title)}</a>`)
                .join('')}
              ${evs.length > 3 ? `<span class="muted small">+${evs.length - 3}</span>` : ''}
            </div>`;
          })
          .join('')}
      </div>`;

    const go = (delta) => {
      this.cursor = new Date(y, m + delta, 1);
      this.render(el);
    };
    $('#cal-prev', el).onclick = () => go(-1);
    $('#cal-next', el).onclick = () => go(1);
    $('#cal-today', el).onclick = () => {
      this.cursor = new Date();
      this.render(el);
    };
  },
};