// Renders the box score page at /game/:gid. Fetches structured box score data
// from /api/boxscore/:gid (assembled server-side from the Retrosheet CSVs).

const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function gidFromPath() {
  const m = window.location.pathname.match(/^\/game\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function gameMeta(g) {
  const parts = [];
  if (g.parkName) parts.push(esc(g.parkName));
  if (g.attendance) parts.push(`Att: ${g.attendance.toLocaleString()}`);
  if (g.daynight === 'night') parts.push('Night');
  else if (g.daynight === 'day') parts.push('Day');
  if (g.temp && g.temp !== '0' && g.temp !== 'unknown') parts.push(`${g.temp}°F`);
  if (g.innings && g.innings !== 9) parts.push(`${g.innings} innings`);
  if (g.timeofgame) parts.push(`${g.timeofgame} min`);
  return parts.length ? `<div class="boxscore-meta">${parts.join(' · ')}</div>` : '';
}

function lineScoreTable(ls, brewIsHome) {
  if (!ls) return '';
  const { visitor, home } = ls;
  const maxInns = Math.max(
    ...visitor.inns.map((v, i) => (v !== '' ? i + 1 : 0)),
    ...home.inns.map((v, i) => (v !== '' ? i + 1 : 0)),
    9,
  );
  const fc = (v) => (v === '' || v == null ? 'x' : v);
  const innHeaders = Array.from({ length: maxInns }, (_, i) => `<th>${i + 1}</th>`).join('');
  const visInns = Array.from({ length: maxInns }, (_, i) => `<td>${fc(visitor.inns[i])}</td>`).join('');
  const homInns = Array.from({ length: maxInns }, (_, i) => `<td>${fc(home.inns[i])}</td>`).join('');
  return `
    <div class="linescore-wrap">
      <table class="linescore-table">
        <thead>
          <tr><th class="linescore-team-col">Team</th>${innHeaders}<th class="linescore-rhe">R</th><th class="linescore-rhe">H</th><th class="linescore-rhe">E</th></tr>
        </thead>
        <tbody>
          <tr class="${brewIsHome ? '' : 'linescore-brewers'}">
            <td class="linescore-team-col">${esc(visitor.name)}</td>${visInns}
            <td class="linescore-rhe linescore-total">${visitor.r}</td><td class="linescore-rhe">${visitor.h}</td><td class="linescore-rhe">${visitor.e}</td>
          </tr>
          <tr class="${brewIsHome ? 'linescore-brewers' : ''}">
            <td class="linescore-team-col">${esc(home.name)}</td>${homInns}
            <td class="linescore-rhe linescore-total">${home.r}</td><td class="linescore-rhe">${home.h}</td><td class="linescore-rhe">${home.e}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function pitchersLine(g) {
  const items = [];
  if (g.wp) items.push(`<span class="linescore-pitcher"><span class="linescore-pitcher-label">WP</span><span class="linescore-pitcher-name">${esc(g.wp)}</span></span>`);
  if (g.lp) items.push(`<span class="linescore-pitcher"><span class="linescore-pitcher-label">LP</span><span class="linescore-pitcher-name">${esc(g.lp)}</span></span>`);
  if (g.save) items.push(`<span class="linescore-pitcher"><span class="linescore-pitcher-label">S</span><span class="linescore-pitcher-name">${esc(g.save)}</span></span>`);
  return items.length ? `<div class="linescore-pitchers">${items.join('')}</div>` : '';
}

function battingTable(bat, teamId, brewIsHome, isVisitor) {
  const isBrewers = (isVisitor && !brewIsHome) || (!isVisitor && brewIsHome);
  const cols = ['pos','ab','r','h','rbi','bb','k','hr','sb'];
  const headers = ['Player','Pos','AB','R','H','RBI','BB','SO','HR','SB'];
  const rows = bat.players.map(p => `
    <tr>
      <td class="boxscore-player">${esc(p.name)}</td>
      <td>${esc(p.pos)}</td>
      <td>${p.ab || ''}</td><td>${p.r || ''}</td><td>${p.h || ''}</td>
      <td>${p.rbi || ''}</td><td>${p.bb || ''}</td><td>${p.k || ''}</td>
      <td>${p.hr || ''}</td><td>${p.sb || ''}</td>
    </tr>`).join('');
  const t = bat.totals;
  return `
    <table class="boxscore-table${isBrewers ? ' boxscore-brewers' : ''}">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows}
        <tr class="boxscore-totals">
          <td>Totals</td><td></td>
          <td>${t.ab}</td><td>${t.r}</td><td>${t.h}</td>
          <td>${t.rbi}</td><td>${t.bb}</td><td>${t.k}</td>
          <td>${t.hr}</td><td>${t.sb}</td>
        </tr>
      </tbody>
    </table>`;
}

function pitchingTable(pitch, teamId, brewIsHome, isVisitor) {
  const isBrewers = (isVisitor && !brewIsHome) || (!isVisitor && brewIsHome);
  const headers = ['Pitcher','IP','BF','H','R','ER','BB','SO','HR','NP'];
  const rows = pitch.pitchers.map(p => {
    const tag = p.isWp ? ' <span class="boxscore-dec">W</span>' : p.isLp ? ' <span class="boxscore-dec">L</span>' : p.isSave ? ' <span class="boxscore-dec">SV</span>' : '';
    return `
      <tr>
        <td class="boxscore-player">${esc(p.name)}${tag}</td>
        <td>${esc(p.ip)}</td><td>${p.bf}</td><td>${p.h}</td>
        <td>${p.r}</td><td>${p.er}</td><td>${p.bb}</td><td>${p.k}</td>
        <td>${p.hr}</td><td></td>
      </tr>`;
  }).join('');
  const t = pitch.totals;
  return `
    <table class="boxscore-table${isBrewers ? ' boxscore-brewers' : ''}">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows}
        <tr class="boxscore-totals">
          <td>Totals</td><td>${esc(t.ip)}</td><td>${t.bf}</td><td>${t.h}</td>
          <td>${t.r}</td><td>${t.er}</td><td>${t.bb}</td><td>${t.k}</td>
          <td>${t.hr}</td><td></td>
        </tr>
      </tbody>
    </table>`;
}

function fieldingTable(field, brewIsHome, isVisitor) {
  const isBrewers = (isVisitor && !brewIsHome) || (!isVisitor && brewIsHome);
  const headers = ['Player','Pos','PO','A','E','DP'];
  const rows = field.players.map(f => `
    <tr>
      <td class="boxscore-player">${esc(f.name)}</td>
      <td>${esc(f.pos)}</td><td>${f.po}</td><td>${f.a}</td><td>${f.e}</td><td>${f.dp}</td>
    </tr>`).join('');
  const t = field.totals;
  return `
    <table class="boxscore-table${isBrewers ? ' boxscore-brewers' : ''}">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows}
        <tr class="boxscore-totals">
          <td>Totals</td><td></td><td>${t.po}</td><td>${t.a}</td><td>${t.e}</td><td>${t.dp}</td>
        </tr>
      </tbody>
    </table>`;
}

function render(box) {
  const g = box.game;
  const loading = document.getElementById('boxscore-loading');
  if (loading) loading.hidden = true;

  const visAbbr = g.visteam, homeAbbr = g.hometeam;
  const brewAbbr = g.brewAbbr;

  let html = `
    <div class="boxscore-header">
      <div class="boxscore-matchup">
        <span class="boxscore-team">${esc(g.visName)}</span>
        <span class="boxscore-score">${g.visScore}</span>
        <span class="boxscore-sep">—</span>
        <span class="boxscore-team">${esc(g.homeName)}</span>
        <span class="boxscore-score">${g.homeScore}</span>
      </div>
      <div class="boxscore-date">${esc(fmtDate(g.date))}</div>
      ${gameMeta(g)}
    </div>
    ${lineScoreTable(box.linescore, g.brewIsHome)}
    ${pitchersLine(g)}
  `;

  if (box.batting) {
    html += `<h3 class="boxscore-section-title">Batting</h3>`;
    html += `<div class="boxscore-tables">`;
    html += battingTable(box.batting[visAbbr], visAbbr, g.brewIsHome, true);
    html += battingTable(box.batting[homeAbbr], homeAbbr, g.brewIsHome, false);
    html += `</div>`;
  }
  if (box.pitching) {
    html += `<h3 class="boxscore-section-title">Pitching</h3>`;
    html += `<div class="boxscore-tables">`;
    html += pitchingTable(box.pitching[visAbbr], visAbbr, g.brewIsHome, true);
    html += pitchingTable(box.pitching[homeAbbr], homeAbbr, g.brewIsHome, false);
    html += `</div>`;
  }
  if (box.fielding) {
    html += `<h3 class="boxscore-section-title">Fielding</h3>`;
    html += `<div class="boxscore-tables">`;
    html += fieldingTable(box.fielding[visAbbr], g.brewIsHome, true);
    html += fieldingTable(box.fielding[homeAbbr], g.brewIsHome, false);
    html += `</div>`;
  }

  const root = document.getElementById('boxscore-root');
  root.innerHTML = html;
}

async function main() {
  const gid = gidFromPath();
  const root = document.getElementById('boxscore-root');
  const loading = document.getElementById('boxscore-loading');
  const errorEl = document.getElementById('boxscore-error');
  if (!gid) {
    loading.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = 'No game specified.';
    return;
  }
  try {
    const res = await fetch(`/api/boxscore/${encodeURIComponent(gid)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const box = await res.json();
    if (box.error) throw new Error(box.error);
    render(box);
  } catch (err) {
    loading.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = 'Could not load this box score. The game may not exist or detailed data is unavailable.';
    console.error('Box score error:', err);
  }
}

main();
