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

// Single-game batting average: H/AB in the standard ".333" form. No at-bats
// means the average is undefined, shown as a dash.
function fmtAvg(h, ab) {
  if (!ab) return '—';
  return (h / ab).toFixed(3).replace(/^0/, '');
}

// "Name, Name (2)" list of players with a nonzero stat; count shown only past 1.
function statList(players, key) {
  return players.filter(p => p[key] > 0)
    .map(p => (p[key] > 1 ? `${p.name} (${p[key]})` : p.name)).join(', ');
}

// Notes block from [label, text] pairs, skipping empty texts.
function notesBlock(pairs) {
  const lines = pairs.filter(([, text]) => text)
    .map(([label, text]) => `<div class="boxscore-note"><span class="boxscore-note-label">${esc(label)}:</span> ${esc(text)}</div>`);
  return lines.length ? `<div class="boxscore-notes">${lines.join('')}</div>` : '';
}

function battingTable(bat, teamId, brewIsHome, isVisitor, sideStats) {
  const isBrewers = (isVisitor && !brewIsHome) || (!isVisitor && brewIsHome);
  const headers = ['Player','Pos','H','AB','R','RBI','BB','SO','HR','SB','AVG'];
  const rows = bat.players.map(p => `
    <tr>
      <td class="boxscore-player">${p.letter ? `${p.letter} - ` : ''}${esc(p.name)}</td>
      <td>${esc(p.pos)}</td>
      <td>${p.h}</td><td>${p.ab}</td><td>${p.r}</td>
      <td>${p.rbi}</td><td>${p.bb}</td><td>${p.k}</td>
      <td>${p.hr}</td><td>${p.sb}</td>
      <td>${fmtAvg(p.h, p.ab)}</td>
    </tr>`).join('');
  const t = bat.totals;
  const phNotes = (bat.phNotes || []).map(n => `<div class="boxscore-note boxscore-note-ph">${esc(n)}</div>`).join('');
  const risp = bat.risp
    ? `${bat.risp.h}-${bat.risp.ab}${bat.risp.batters.length ? ` (${bat.risp.batters.join(', ')})` : ''}`
    : '';
  const notes = notesBlock([
    ['2B', statList(bat.players, 'd')],
    ['3B', statList(bat.players, 't')],
    ['HR', bat.hrDetails?.length ? bat.hrDetails.join('; ') : statList(bat.players, 'hr')],
    ['RBI', statList(bat.players, 'rbi')],
    ['SF', statList(bat.players, 'sf')],
    ['SH', statList(bat.players, 'sh')],
    ['GIDP', statList(bat.players, 'gdp')],
    ['HBP', statList(bat.players, 'hbp')],
    ['SB', statList(bat.players, 'sb')],
    ['CS', statList(bat.players, 'cs')],
    ['Team LOB', sideStats?.lob > 0 ? String(sideStats.lob) : ''],
    ['Team RISP', risp],
  ]);
  return `
    <table class="boxscore-table${isBrewers ? ' boxscore-brewers' : ''}">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows}
        <tr class="boxscore-totals">
          <td>Totals</td><td></td>
          <td>${t.h}</td><td>${t.ab}</td><td>${t.r}</td>
          <td>${t.rbi}</td><td>${t.bb}</td><td>${t.k}</td>
          <td>${t.hr}</td><td>${t.sb}</td>
          <td>${fmtAvg(t.h, t.ab)}</td>
        </tr>
      </tbody>
    </table>${phNotes ? `<div class="boxscore-notes">${phNotes}</div>` : ''}${notes}`;
}

// Single-game ERA: earned runs per nine innings (27 outs). A pitcher who
// allowed earned runs without recording an out has an infinite ERA.
function fmtEra(er, ipouts) {
  if (!ipouts) return er > 0 ? 'INF' : '—';
  return ((er * 27) / ipouts).toFixed(2);
}

// npMode: 'none' (no pitch data in this game — omit the column entirely),
// 'np' (pitch totals only), or 'pcst' (pitches-strikes, e.g. "99-66").
function pitchingTable(pitch, teamId, brewIsHome, isVisitor, npMode) {
  const isBrewers = (isVisitor && !brewIsHome) || (!isVisitor && brewIsHome);
  const headers = ['Pitcher','IP','BF','H','R','ER','BB','SO','HR']
    .concat(npMode === 'none' ? [] : [npMode === 'pcst' ? 'PC-ST' : 'NP'])
    .concat(['ERA']);
  const npCell = (np, nps) => {
    if (npMode === 'none') return '';
    if (!np) return '<td></td>';
    return `<td>${npMode === 'pcst' && nps != null ? `${np}-${nps}` : np}</td>`;
  };
  const rows = pitch.pitchers.map(p => {
    const tag = p.isWp ? ' <span class="boxscore-dec">W</span>' : p.isLp ? ' <span class="boxscore-dec">L</span>' : p.isSave ? ' <span class="boxscore-dec">SV</span>' : '';
    return `
      <tr>
        <td class="boxscore-player">${esc(p.name)}${tag}</td>
        <td>${esc(p.ip)}</td><td>${p.bf}</td><td>${p.h}</td>
        <td>${p.r}</td><td>${p.er}</td><td>${p.bb}</td><td>${p.k}</td>
        <td>${p.hr}</td>${npCell(p.np, p.nps)}
        <td>${fmtEra(p.er, p.ipouts)}</td>
      </tr>`;
  }).join('');
  const t = pitch.totals;
  const short = (name) => name.split(' ').slice(-1)[0];
  const withSeq = pitch.pitchers.filter(p => p.fpsPa != null);
  const withBip = pitch.pitchers.filter(p => p.gb + p.fb > 0);
  const starter = pitch.pitchers.find(p => p.gsc != null);
  const notes = notesBlock([
    ['WP', statList(pitch.pitchers, 'wp')],
    ['HBP', statList(pitch.pitchers, 'hbp')],
    ['Balk', statList(pitch.pitchers, 'bk')],
    ['First-pitch strikes/BF', withSeq.map(p => `${short(p.name)} ${p.fps}/${p.fpsPa}`).join(', ')],
    ['Called-Swinging-Foul-In play strikes', withSeq.map(p => `${short(p.name)} ${p.called}-${p.swing}-${p.foul}-${p.inplay}`).join(', ')],
    ['Ground balls-Fly balls', withBip.map(p => `${short(p.name)} ${p.gb}-${p.fb}`).join(', ')],
    ['Game Score', starter ? `${short(starter.name)} ${starter.gsc}` : ''],
  ]);
  return `
    <table class="boxscore-table${isBrewers ? ' boxscore-brewers' : ''}">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows}
        <tr class="boxscore-totals">
          <td>Totals</td><td>${esc(t.ip)}</td><td>${t.bf}</td><td>${t.h}</td>
          <td>${t.r}</td><td>${t.er}</td><td>${t.bb}</td><td>${t.k}</td>
          <td>${t.hr}</td>${npCell(t.np, t.nps)}
          <td>${fmtEra(t.er, t.ipouts)}</td>
        </tr>
      </tbody>
    </table>${notes}`;
}

// A normal box score only calls out notable fielding: errors, double plays,
// triple plays, passed balls. Everything routine stays implicit.
function fieldingNotes(field, sideStats) {
  const withCount = (teamCount, names) => {
    if (!names) return teamCount > 0 ? String(teamCount) : '';
    return teamCount > 0 ? `${teamCount} (${names})` : names;
  };
  const notes = notesBlock([
    ['E', statList(field.players, 'e')],
    ['DP', withCount(sideStats?.dp || 0, statList(field.players, 'dp'))],
    ['TP', withCount(sideStats?.tp || 0, statList(field.players, 'tp'))],
    ['PB', statList(field.players, 'pb')],
  ]);
  return notes || '<div class="boxscore-notes"><div class="boxscore-note">No errors, double plays, or passed balls.</div></div>';
}

function umpiresLine(g) {
  if (!g.umpires || !g.umpires.length) return '';
  const items = g.umpires.map(u => `<span class="boxscore-ump"><span class="boxscore-ump-pos">${esc(u.pos)}</span> ${esc(u.name)}</span>`);
  return `<div class="boxscore-umps"><span class="boxscore-umps-label">Umpires</span> ${items.join('<span class="boxscore-ump-sep"> · </span>')}</div>`;
}

function scoringSummary(box) {
  if (!box.scoring || !box.scoring.length) return '';
  const g = box.game;
  const rows = box.scoring.map(p => {
    const isBrewers = p.team === g.brewAbbr;
    return `
      <tr class="${isBrewers ? 'boxscore-scoring-brewers' : ''}">
        <td class="boxscore-scoring-inn" title="${p.top ? 'Top' : 'Bottom'} of inning ${p.inning}"><i class="mdi ${p.top ? 'mdi-arrow-up' : 'mdi-arrow-down'}"></i>${p.inning}</td>
        <td class="boxscore-scoring-desc">${esc(p.desc)}</td>
        <td class="boxscore-scoring-score">${esc(g.visteam)} ${p.visScore}, ${esc(g.hometeam)} ${p.homeScore}</td>
      </tr>`;
  }).join('');
  return `
    <h3 class="boxscore-section-title">Scoring Summary</h3>
    <div class="linescore-wrap">
      <table class="boxscore-table boxscore-scoring">
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Per-team panel: batting (with notes), fielding notes, pitching underneath.
function teamPanel(box, teamId, isVisitor, hidden, npMode) {
  const g = box.game;
  const bat = box.batting?.[teamId];
  const field = box.fielding?.[teamId];
  const pitch = box.pitching?.[teamId];
  const sideStats = box.linescore?.[isVisitor ? 'visitor' : 'home'];
  let html = `<div class="boxscore-teampanel" data-panel="${esc(teamId)}"${hidden ? ' hidden' : ''}>`;
  if (bat) {
    html += `<h3 class="boxscore-section-title">Batting</h3>`;
    html += battingTable(bat, teamId, g.brewIsHome, isVisitor, sideStats);
  }
  if (field) {
    html += `<h3 class="boxscore-section-title">Fielding</h3>`;
    html += fieldingNotes(field, sideStats);
  }
  if (pitch) {
    html += `<h3 class="boxscore-section-title">Pitching</h3>`;
    html += pitchingTable(pitch, teamId, g.brewIsHome, isVisitor, npMode);
  }
  html += `</div>`;
  return html;
}

function render(box) {
  const g = box.game;
  const loading = document.getElementById('boxscore-loading');
  if (loading) loading.hidden = true;

  const visAbbr = g.visteam, homeAbbr = g.hometeam;

  const shortDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const navBtn = (dir, target) => target
    ? `<a class="boxscore-navbtn" id="bs-${dir}" href="/game/${encodeURIComponent(target.gid)}" title="${dir === 'prev' ? 'Previous' : 'Next'} game — ${esc(shortDate(target.date))}" aria-label="${dir === 'prev' ? 'Previous' : 'Next'} game"><i class="mdi mdi-chevron-${dir === 'prev' ? 'left' : 'right'}"></i></a>`
    : `<span class="boxscore-navbtn boxscore-navbtn-empty"></span>`;

  let html = `
    <div class="boxscore-header">
      <a class="boxscore-close" id="bs-close" href="/${g.season}#g-${encodeURIComponent(box.gid)}" title="Back to the ${g.season} season" aria-label="Back to the ${g.season} season"><i class="mdi mdi-close"></i></a>
      <div class="boxscore-navrow">
        ${navBtn('prev', box.nav?.prev)}
        <div class="boxscore-matchup">
          <span class="boxscore-team">${esc(g.visName)}</span>
          <span class="boxscore-score">${g.visScore}</span>
          <span class="boxscore-sep">—</span>
          <span class="boxscore-team">${esc(g.homeName)}</span>
          <span class="boxscore-score">${g.homeScore}</span>
        </div>
        ${navBtn('next', box.nav?.next)}
      </div>
      <div class="boxscore-date">${esc(fmtDate(g.date))}</div>
      ${gameMeta(g)}
    </div>
    ${lineScoreTable(box.linescore, g.brewIsHome)}
    ${pitchersLine(g)}
    ${umpiresLine(g)}
    ${scoringSummary(box)}
  `;

  if (box.batting || box.fielding || box.pitching) {
    // Team tabs: away team on the left, home team on the right. Default to
    // the Brewers' side of the box.
    const defaultTeam = g.brewAbbr;
    html += `
      <div class="boxscore-teamtabs" role="tablist">
        <button type="button" class="boxscore-teamtab${defaultTeam === visAbbr ? ' active' : ''}" data-team="${esc(visAbbr)}" role="tab" aria-selected="${defaultTeam === visAbbr}">${esc(g.visName)}</button>
        <button type="button" class="boxscore-teamtab${defaultTeam === homeAbbr ? ' active' : ''}" data-team="${esc(homeAbbr)}" role="tab" aria-selected="${defaultTeam === homeAbbr}">${esc(g.homeName)}</button>
      </div>`;
    // Pitch data is all-or-nothing per game: omit the column entirely when
    // absent, and only use PC-ST when every pitcher's strike count is known.
    const allPitchers = [visAbbr, homeAbbr].flatMap(t => box.pitching?.[t]?.pitchers || []);
    const withNp = allPitchers.filter(p => p.np > 0);
    const npMode = !withNp.length ? 'none' : withNp.every(p => p.nps != null) ? 'pcst' : 'np';
    html += teamPanel(box, visAbbr, true, defaultTeam !== visAbbr, npMode);
    html += teamPanel(box, homeAbbr, false, defaultTeam !== homeAbbr, npMode);
  }

  const root = document.getElementById('boxscore-root');
  root.innerHTML = html;

  // Close is a plain link to /YYYY#g-<gid>: the season page scrolls to and
  // highlights that game's row, which lands better than raw scroll restore —
  // after flipping through games it returns to the game being viewed.
  // Prev/next: replace instead of push, so flipping through games doesn't
  // stack history — the browser back button also returns to the season page.
  for (const id of ['bs-prev', 'bs-next']) {
    const el = document.getElementById(id);
    if (el?.href) el.addEventListener('click', (e) => { e.preventDefault(); location.replace(el.href); });
  }

  // Team tab switching
  root.querySelectorAll('.boxscore-teamtab').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = btn.dataset.team;
      root.querySelectorAll('.boxscore-teamtab').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      root.querySelectorAll('.boxscore-teampanel').forEach(p => { p.hidden = p.dataset.panel !== team; });
    });
  });

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
    // Append this script's asset version so API responses cached from an
    // older deploy (24h max-age) are not reused against newer page code.
    const scriptV = (() => {
      try { return new URL(document.querySelector('script[src*="game.js"]').src, location.href).searchParams.get('v') || ''; }
      catch { return ''; }
    })();
    const res = await fetch(`/api/boxscore/${encodeURIComponent(gid)}${scriptV ? `?v=${scriptV}` : ''}`);
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
