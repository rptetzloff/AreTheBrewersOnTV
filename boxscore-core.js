// Shared (server) parsing of Retrosheet per-game CSVs into a structured box
// score. Pure functions — no fs/fetch/DOM. The server builds indices once from
// the raw CSV files and assembles a box score per request via buildBoxscore().

import { splitCsvLine, parseCurrentNamesCsv, nameForFranchiseAt, parseBallparksCsv, parseTeamstatsLineScores, BREWERS_IDS } from './records-core.js';

const POS_NAMES = { 1:'P', 2:'C', 3:'1B', 4:'2B', 5:'3B', 6:'SS', 7:'LF', 8:'CF', 9:'RF', 10:'DH', 11:'PH', 12:'PR' };
const num = (v) => parseInt(v, 10) || 0;

export function isLfsPointer(raw) {
  return !raw || raw.startsWith('version https://git-lfs.github.com/spec/v1');
}

export function buildPlayerNameMap(raw) {
  const names = new Map();
  if (isLfsPointer(raw)) return names;
  const lines = raw.split('\n');
  const h = splitCsvLine(lines[0]);
  const idI = h.indexOf('id'), lastI = h.indexOf('lastname'), useI = h.indexOf('usename'), fullI = h.indexOf('fullname');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const v = splitCsvLine(lines[i]);
    const id = v[idI]?.trim();
    if (!id) continue;
    const name = [v[useI]?.trim(), v[lastI]?.trim()].filter(Boolean).join(' ') || (fullI >= 0 && v[fullI]?.trim()) || '';
    if (name) names.set(id, name);
  }
  return names;
}

function indexByGid(raw, cols, rowFn) {
  const map = new Map();
  if (isLfsPointer(raw)) return map;
  const lines = raw.split('\n');
  const h = splitCsvLine(lines[0]);
  const idx = {};
  for (const c of cols) idx[c] = h.indexOf(c);
  const gidI = idx.gid;
  if (gidI < 0) return map;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const v = splitCsvLine(lines[i]);
    const gid = v[gidI]?.trim();
    if (!gid) continue;
    const row = rowFn(v, idx);
    if (!row) continue;
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid).push(row);
  }
  return map;
}

export function buildPitchingIndex(raw) {
  return indexByGid(raw, [
    'gid','id','team','p_seq','p_ipouts','p_noout','p_bfp','p_h','p_d','p_t','p_hr',
    'p_r','p_er','p_w','p_iw','p_k','p_hbp','p_wp','p_bk','p_sh','p_sf','p_sb','p_cs',
    'p_pb','wp','lp','save','p_gs','p_gf','p_cg',
  ], (v, i) => ({
    id: v[i.id], team: v[i.team], seq: num(v[i.p_seq]),
    ipouts: num(v[i.p_ipouts]), bf: num(v[i.p_bfp]),
    h: num(v[i.p_h]), d: num(v[i.p_d]), t: num(v[i.p_t]), hr: num(v[i.p_hr]),
    r: num(v[i.p_r]), er: num(v[i.p_er]), bb: num(v[i.p_w]), ibb: num(v[i.p_iw]),
    k: num(v[i.p_k]), hbp: num(v[i.p_hbp]), wp: num(v[i.p_wp]), bk: num(v[i.p_bk]),
    sh: num(v[i.p_sh]), sf: num(v[i.p_sf]), sb: num(v[i.p_sb]), cs: num(v[i.p_cs]),
    isWp: v[i.wp] === '1', isLp: v[i.lp] === '1', isSave: v[i.save] === '1',
    gs: v[i.p_gs] === '1', gf: v[i.p_gf] === '1', cg: v[i.p_cg] === '1',
  }));
}

export function buildBattingIndex(raw) {
  return indexByGid(raw, [
    'gid','id','team','b_lp','b_seq','b_pa','b_ab','b_r','b_h','b_d','b_t','b_hr',
    'b_rbi','b_sh','b_sf','b_hbp','b_w','b_iw','b_k','b_sb','b_cs','b_gdp','b_xi',
    'b_roe','dh','ph','pr',
  ], (v, i) => ({
    id: v[i.id], team: v[i.team], lp: num(v[i.b_lp]), seq: num(v[i.b_seq]),
    pa: num(v[i.b_pa]), ab: num(v[i.b_ab]), r: num(v[i.b_r]), h: num(v[i.b_h]),
    d: num(v[i.b_d]), t: num(v[i.b_t]), hr: num(v[i.b_hr]), rbi: num(v[i.b_rbi]),
    sh: num(v[i.b_sh]), sf: num(v[i.b_sf]), hbp: num(v[i.b_hbp]), bb: num(v[i.b_w]),
    ibb: num(v[i.b_iw]), k: num(v[i.b_k]), sb: num(v[i.b_sb]), cs: num(v[i.b_cs]),
    gdp: num(v[i.b_gdp]), xi: num(v[i.b_xi]), roe: num(v[i.b_roe]),
    isDh: v[i.dh] === '1', isPh: v[i.ph] === '1', isPr: v[i.pr] === '1',
  }));
}

export function buildFieldingIndex(raw) {
  return indexByGid(raw, [
    'gid','id','team','d_seq','d_pos','d_ifouts','d_po','d_a','d_e','d_dp','d_tp',
    'd_pb','d_wp','d_sb','d_cs','d_gs',
  ], (v, i) => ({
    id: v[i.id], team: v[i.team], seq: num(v[i.d_seq]), pos: num(v[i.d_pos]),
    ifouts: num(v[i.d_ifouts]), po: num(v[i.d_po]), a: num(v[i.d_a]), e: num(v[i.d_e]),
    dp: num(v[i.d_dp]), tp: num(v[i.d_tp]), pb: num(v[i.d_pb]), gs: v[i.d_gs] === '1',
  }));
}

export function buildGameIndex(raw) {
  const map = new Map();
  if (isLfsPointer(raw)) return map;
  const lines = raw.split('\n');
  const h = splitCsvLine(lines[0]);
  const idx = {};
  for (const c of ['gid','visteam','hometeam','site','date','number','starttime','daynight','innings','usedh','timeofgame','attendance','fieldcond','precip','sky','temp','winddir','windspeed','wp','lp','save','gametype','vruns','hruns','wteam','lteam','season','umphome','ump1b','ump2b','ump3b','umplf','umprf'])
    idx[c] = h.indexOf(c);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const v = splitCsvLine(lines[i]);
    const gid = v[idx.gid]?.trim();
    if (!gid) continue;
    map.set(gid, {
      visteam: v[idx.visteam], hometeam: v[idx.hometeam], site: v[idx.site],
      date: v[idx.date], number: v[idx.number], daynight: v[idx.daynight],
      innings: num(v[idx.innings]), usedh: v[idx.usedh] === 'TRUE',
      timeofgame: num(v[idx.timeofgame]), attendance: num(v[idx.attendance]),
      fieldcond: v[idx.fieldcond], precip: v[idx.precip], sky: v[idx.sky],
      temp: v[idx.temp], winddir: v[idx.winddir], windspeed: v[idx.windspeed],
      wp: v[idx.wp], lp: v[idx.lp], save: v[idx.save], gametype: v[idx.gametype],
      vruns: v[idx.vruns], hruns: v[idx.hruns], wteam: v[idx.wteam], lteam: v[idx.lteam],
      season: v[idx.season],
      umps: {
        HP: v[idx.umphome]?.trim() || '', '1B': v[idx.ump1b]?.trim() || '',
        '2B': v[idx.ump2b]?.trim() || '', '3B': v[idx.ump3b]?.trim() || '',
        LF: v[idx.umplf]?.trim() || '', RF: v[idx.umprf]?.trim() || '',
      },
    });
  }
  return map;
}

// Incrementally collect per-game aggregates from the play-by-play CSV:
// scoring plays, per-pitcher pitch data (PC-ST, first-pitch strikes, strike
// breakdown, ground/fly balls), each batter's first plate appearance (for
// pinch-hit notes), and team hitting with runners in scoring position. The
// raw file is ~400MB, so the caller streams it line by line; the collector
// keeps only these small aggregates.
export function createScoringPlaysCollector() {
  const map = new Map();
  const pitchCounts = new Map();
  const firstPa = new Map();
  const risp = new Map();
  let idx = null;
  const COLS = ['gid','inning','top_bot','batteam','score_v','score_h','batter','pitcher',
    'single','double','triple','hr','sh','sf','hbp','walk','k','xi','roe','fc','othout',
    'ground','fly','line','iw','gdp','wp','pb','bk','sbh','runs','run_b','run1','run2','run3',
    'nump','pa','pitches','ab','bip','outs_pre','br2_pre','br3_pre'];
  const FLAG_COLS = ['single','double','triple','hr','sh','sf','hbp','walk','k','xi','roe','fc','othout','ground','fly','line','iw','gdp','wp','pb','bk','sbh'];
  const readFlags = (v) => {
    const flags = {};
    for (const f of FLAG_COLS) flags[f] = v[idx[f]] === '1';
    return flags;
  };
  const line = (text) => {
    if (!text || !text.trim()) return;
    if (!idx) {
      const h = splitCsvLine(text);
      idx = {};
      for (const c of COLS) idx[c] = h.indexOf(c);
      return;
    }
    const v = splitCsvLine(text);
    const gid = v[idx.gid]?.trim();
    if (!gid) return;
    // Pitch data: sum pitches per pitcher, tracking how many of their plate
    // appearances actually carry pitch data. Retrosheet pitch sequences are
    // partial for many older games; a partial sum reads as a real (absurdly
    // low) pitch count, so the box score only shows NP when every PA has data.
    const np = num(v[idx.nump]);
    const isPa = v[idx.pa] === '1';
    const pitcherId = v[idx.pitcher]?.trim();
    if (pitcherId && (np || isPa || v[idx.bip] === '1')) {
      if (!pitchCounts.has(gid)) pitchCounts.set(gid, new Map());
      const m = pitchCounts.get(gid);
      const e = m.get(pitcherId) || { np: 0, pa: 0, paNp: 0, balls: 0, chars: 0, unk: 0, fps: 0, fpsPa: 0, called: 0, swing: 0, foul: 0, inplay: 0, gb: 0, fb: 0 };
      e.np += np;
      // Ground/fly balls allowed (all eras — from the event notation).
      if (v[idx.bip] === '1') {
        if (v[idx.ground] === '1') e.gb++;
        else if (v[idx.fly] === '1') e.fb++;
      }
      if (isPa) {
        e.pa++;
        if (np) e.paNp++;
        // Tally the pitch sequence. Only the PA-ending row carries the full
        // cumulative sequence — mid-PA rows (steals, pickoffs) repeat the
        // prefix and would double count. Non-pitch markers (pickoff throws
        // 1-3, +, *, ., >, N) are skipped; a leading dot means the start of
        // the PA belongs to a previous pitcher, so it is excluded from the
        // first-pitch-strike tally. B/I/P/V/HBP count as balls, U marks an
        // unknown pitch, C called / S-M-Q swinging / X in play / rest fouls.
        let first = true;
        for (const ch of v[idx.pitches] || '') {
          if (ch === '*' || ch === '>' || ch === '+' || ch === 'N' || (ch >= '1' && ch <= '3')) continue;
          if (ch === '.') { first = false; continue; }
          e.chars++;
          const isBall = ch === 'B' || ch === 'I' || ch === 'P' || ch === 'V' || ch === 'H';
          if (isBall) e.balls++;
          else if (ch === 'U') e.unk++;
          else if (ch === 'C') e.called++;
          else if (ch === 'S' || ch === 'M' || ch === 'Q') e.swing++;
          else if (ch === 'X') e.inplay++;
          else e.foul++;
          if (first) { e.fpsPa++; if (!isBall && ch !== 'U') e.fps++; }
          first = false;
        }
      }
      m.set(pitcherId, e);
    }
    // Team hitting with runners in scoring position (at-bats only).
    const isHit = v[idx.single] === '1' || v[idx.double] === '1' || v[idx.triple] === '1' || v[idx.hr] === '1';
    if (v[idx.ab] === '1' && (v[idx.br2_pre]?.trim() || v[idx.br3_pre]?.trim())) {
      const team = v[idx.batteam];
      const batterId = v[idx.batter]?.trim();
      if (team && batterId) {
        if (!risp.has(gid)) risp.set(gid, new Map());
        const rm = risp.get(gid);
        const r = rm.get(team) || { ab: 0, h: 0, batters: new Map() };
        const b = r.batters.get(batterId) || { ab: 0, h: 0 };
        r.ab++; b.ab++;
        if (isHit) { r.h++; b.h++; }
        r.batters.set(batterId, b);
        rm.set(team, r);
      }
    }
    // First plate appearance per batter — enough to write pinch-hit notes.
    if (isPa) {
      const batterId = v[idx.batter]?.trim();
      if (batterId) {
        if (!firstPa.has(gid)) firstPa.set(gid, new Map());
        const fm = firstPa.get(gid);
        if (!fm.has(batterId)) {
          fm.set(batterId, { inning: num(v[idx.inning]), verb: playVerb(readFlags(v), num(v[idx.runs])) || 'batted' });
        }
      }
    }
    const runs = num(v[idx.runs]);
    if (!runs) return;
    const play = {
      inning: num(v[idx.inning]),
      top: v[idx.top_bot] === '0',
      team: v[idx.batteam],
      batter: v[idx.batter]?.trim() || '',
      pitcher: pitcherId || '',
      preV: num(v[idx.score_v]), preH: num(v[idx.score_h]),
      runs,
      outs: num(v[idx.outs_pre]),
      scorers: [v[idx.run_b], v[idx.run1], v[idx.run2], v[idx.run3]].map(s => s?.trim()).filter(Boolean),
      flags: readFlags(v),
    };
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid).push(play);
  };
  return { line, result: () => ({ scoring: map, pitchCounts, firstPa, risp }) };
}

// Turn a scoring play's flag columns into a readable sentence fragment.
function playVerb(f, runs) {
  if (f.hr) return runs >= 4 ? 'hit a grand slam' : runs === 3 ? 'hit a three-run home run' : runs === 2 ? 'hit a two-run home run' : 'homered';
  if (f.triple) return 'tripled';
  if (f.double) return 'doubled';
  if (f.single) return 'singled';
  if (f.walk) return f.iw ? 'was intentionally walked' : 'walked';
  if (f.hbp) return 'was hit by a pitch';
  if (f.sf) return 'hit a sacrifice fly';
  if (f.sh) return 'laid down a sacrifice bunt';
  if (f.gdp) return 'grounded into a double play';
  if (f.xi) return 'reached on catcher’s interference';
  if (f.roe) return 'reached on an error';
  if (f.fc) return 'reached on a fielder’s choice';
  if (f.k) return 'struck out';
  if (f.othout) return f.ground ? 'grounded out' : f.fly ? 'flied out' : f.line ? 'lined out' : 'was put out';
  return null;
}

// Events where runs score without a batter event.
function nonBatterEvent(f) {
  if (f.sbh) return 'Steal of home';
  if (f.wp) return 'Wild pitch';
  if (f.pb) return 'Passed ball';
  if (f.bk) return 'Balk';
  return 'Runner advance';
}

function ipString(ipouts) {
  const inn = Math.floor(ipouts / 3);
  const frac = ipouts % 3;
  return `${inn}.${frac}`;
}

function positionFor(batter, fielders) {
  if (!fielders) return batter.isDh ? 'DH' : '';
  const rows = fielders.filter(f => f.id === batter.id);
  const started = rows.find(f => f.gs);
  if (started) return POS_NAMES[started.pos] || '';
  // Designated hitters never take the field, so they have no fielding rows.
  if (batter.isDh) return 'DH';
  if (batter.isPh) return 'PH';
  if (batter.isPr) return 'PR';
  if (rows.length) return POS_NAMES[rows[0].pos] || '';
  return '';
}

// Assemble the full box score for a game.
// `indices` = { games, pitching, batting, fielding, playerNames, namesData, parks, lineScores }
export function buildBoxscore(gid, { games, pitching, batting, fielding, playerNames, namesData, parks, lineScores, scoring, pitchCounts, firstPa, risp }) {
  const game = games.get(gid);
  if (!game) return null;

  const { teamNames, teamToFranchise, franchiseEras } = namesData;
  const dateInt = parseInt(game.date, 10) || 0;
  const toIso = (d) => /^\d{8}$/.test(d) ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}` : d;
  const isoDate = toIso(game.date);

  const resolveName = (teamId) => {
    const fran = teamToFranchise[teamId] || teamId;
    return nameForFranchiseAt(franchiseEras, fran, dateInt) || teamNames[teamId] || teamId;
  };

  const visTeam = game.visteam;
  const homeTeam = game.hometeam;
  const visName = resolveName(visTeam);
  const homeName = resolveName(homeTeam);
  const park = parks.find(p => p.id === game.site);
  const parkName = park?.park || park?.city || game.site;

  const brewAbbr = BREWERS_IDS.has(homeTeam) ? homeTeam : visTeam;
  const brewIsHome = BREWERS_IDS.has(homeTeam);

  const playerName = (id) => playerNames.get(id) || id;

  // Line score
  const ls = lineScores?.get(gid);

  // Batting: group by team, sort by lp then seq
  const batRows = batting.get(gid) || [];
  const fieldRows = fielding.get(gid) || [];
  const gameFirstPa = firstPa?.get(gid);
  const gameRisp = risp?.get(gid);
  const gameScoring = scoring?.get(gid);
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th','st','nd','rd'][Math.min(n % 10, 4)] || 'th'}`;
  const buildBattingTable = (teamId) => {
    // Players with no lineup spot and no plate appearance (pitchers under the
    // DH rule) don't belong in the batting table; defensive subs who never
    // batted keep their lineup spot and stay.
    const teamBat = batRows
      .filter(b => b.team === teamId && !(b.lp === 0 && b.pa === 0))
      .sort((a, b) => a.lp - b.lp || a.seq - b.seq);
    const teamField = fieldRows.filter(f => f.team === teamId);
    // Team totals
    const totals = teamBat.reduce((acc, b) => {
      for (const k of ['ab','r','h','d','t','hr','rbi','bb','k','sb','cs','hbp','sf','sh','gdp']) acc[k] += b[k];
      acc.pa += b.pa;
      return acc;
    }, { pa:0, ab:0, r:0, h:0, d:0, t:0, hr:0, rbi:0, bb:0, k:0, sb:0, cs:0, hbp:0, sf:0, sh:0, gdp:0 });
    // Pinch-hitter/runner footnotes ("a - singled for Bauers in the 7th"),
    // lettered in the order they entered the game, not lineup order.
    let letterIdx = 0;
    const phNotes = [];
    const letters = new Map();
    const subs = teamBat.filter(b => b.isPh || b.isPr)
      .sort((a, b) => (gameFirstPa?.get(a.id)?.inning ?? 99) - (gameFirstPa?.get(b.id)?.inning ?? 99));
    for (const b of subs) {
      const letter = String.fromCharCode(97 + letterIdx++);
      letters.set(b.id, letter);
      const replaced = [...teamBat].reverse().find(o => o.lp === b.lp && o.seq < b.seq);
      const forWhom = replaced ? ` for ${playerName(replaced.id)}` : '';
      if (b.isPr) {
        phNotes.push(`${letter} - ran${forWhom}`);
      } else {
        const fp = gameFirstPa?.get(b.id);
        const did = fp ? fp.verb : 'batted';
        const when = fp ? ` in the ${ordinal(fp.inning)}` : '';
        phNotes.push(`${letter} - ${did}${forWhom}${when}`);
      }
    }
    // Home run details from the play-by-play ("off Fairbanks, 2 on, 1 out").
    const hrDetails = gameScoring
      ? gameScoring.filter(p => p.team === teamId && p.flags.hr).map(p => {
          const on = p.runs - 1;
          return `${playerName(p.batter)} (${ordinal(p.inning)} inning off ${playerName(p.pitcher)}, ${on} on, ${p.outs} out)`;
        })
      : null;
    const teamRisp = gameRisp?.get(teamId);
    return {
      players: teamBat.map(b => ({
        id: b.id, name: playerName(b.id), pos: positionFor(b, teamField),
        isStarter: b.seq === 1, isPh: b.isPh, isPr: b.isPr,
        letter: letters.get(b.id) || '',
        pa: b.pa, ab: b.ab, r: b.r, h: b.h, d: b.d, t: b.t, hr: b.hr,
        rbi: b.rbi, bb: b.bb, k: b.k, sb: b.sb, cs: b.cs,
        hbp: b.hbp, sf: b.sf, sh: b.sh, gdp: b.gdp,
      })),
      totals,
      phNotes,
      hrDetails,
      risp: teamRisp ? {
        ab: teamRisp.ab, h: teamRisp.h,
        batters: [...teamRisp.batters].map(([id, s]) => `${playerName(id)} ${s.h}-${s.ab}`),
      } : null,
    };
  };

  // Pitching: group by team, sort by seq
  const pitchRows = pitching.get(gid) || [];
  const gamePitchCounts = pitchCounts?.get(gid);
  const buildPitchingTable = (teamId) => {
    const teamPitch = pitchRows.filter(p => p.team === teamId).sort((a, b) => a.seq - b.seq);
    // Only trust a pitch count when every PA the pitcher faced has pitch data
    // AND the game is from the era where Retrosheet records true pitch
    // sequences (1988+). Earlier games carry deduced minimums (from the final
    // count of each PA) that sum to absurdly low totals.
    const npEra = (parseInt(game.season, 10) || 0) >= 1988;
    const npFor = (id) => {
      if (!npEra) return 0;
      const e = gamePitchCounts?.get(id);
      return e && e.pa > 0 && e.paNp === e.pa ? e.np : 0;
    };
    // Strikes are only reported when the recorded sequence accounts for every
    // pitch with no unknowns; otherwise the box falls back to a bare NP.
    const strikesFor = (id) => {
      const np = npFor(id);
      if (!np) return null;
      const e = gamePitchCounts.get(id);
      return e.unk === 0 && e.chars === e.np ? e.np - e.balls : null;
    };
    const totals = teamPitch.reduce((acc, p) => {
      for (const k of ['ipouts','bf','h','r','er','bb','k','hr','hbp','wp','bk']) acc[k] += p[k];
      acc.np += npFor(p.id);
      const s = strikesFor(p.id);
      if (s == null) acc.npsOk = false; else acc.nps += s;
      return acc;
    }, { ipouts:0, bf:0, h:0, r:0, er:0, bb:0, k:0, hr:0, hbp:0, wp:0, bk:0, np:0, nps:0, npsOk:true });
    const npComplete = teamPitch.every(p => npFor(p.id) > 0);
    // Bill James Game Score for the starter: 50, +1/out, +2/completed inning
    // after the 4th, +1/K, -2/H, -4/ER, -2/unearned run, -1/BB.
    const gameScore = (p) => 50 + p.ipouts + 2 * Math.max(0, Math.floor(p.ipouts / 3) - 4)
      + p.k - 2 * p.h - 4 * p.er - 2 * (p.r - p.er) - p.bb;
    return {
      pitchers: teamPitch.map(p => {
        const e = gamePitchCounts?.get(p.id);
        // Sequence-derived detail is only trustworthy under the same
        // conditions as the pitch count itself.
        const seqOk = npFor(p.id) > 0 && strikesFor(p.id) != null;
        return {
          id: p.id, name: playerName(p.id), ip: ipString(p.ipouts), ipouts: p.ipouts,
          bf: p.bf, h: p.h, r: p.r, er: p.er, bb: p.bb, k: p.k, hr: p.hr,
          hbp: p.hbp, wp: p.wp, bk: p.bk, isWp: p.isWp, isLp: p.isLp, isSave: p.isSave,
          gs: p.gs, gf: p.gf, np: npFor(p.id), nps: strikesFor(p.id),
          fps: seqOk ? e.fps : null, fpsPa: seqOk ? e.fpsPa : null,
          called: seqOk ? e.called : null, swing: seqOk ? e.swing : null,
          foul: seqOk ? e.foul : null, inplay: seqOk ? e.inplay : null,
          gb: e ? e.gb : 0, fb: e ? e.fb : 0,
          gsc: p.gs ? gameScore(p) : null,
        };
      }),
      totals: {
        ...totals, ip: ipString(totals.ipouts),
        np: npComplete ? totals.np : 0,
        nps: npComplete && totals.npsOk ? totals.nps : null,
      },
    };
  };

  // Fielding: group by team, sort by pos then seq
  const buildFieldingTable = (teamId) => {
    const teamField = fieldRows.filter(f => f.team === teamId).sort((a, b) => a.pos - b.pos || a.seq - b.seq);
    const totals = teamField.reduce((acc, f) => {
      acc.po += f.po; acc.a += f.a; acc.e += f.e; acc.dp += f.dp;
      return acc;
    }, { po:0, a:0, e:0, dp:0 });
    return {
      players: teamField.map(f => ({
        id: f.id, name: playerName(f.id), pos: POS_NAMES[f.pos] || '',
        po: f.po, a: f.a, e: f.e, dp: f.dp, tp: f.tp, pb: f.pb,
      })),
      totals,
    };
  };

  // Umpire crew: skip empty slots and Retrosheet's "(none)" placeholder.
  const umpires = Object.entries(game.umps || {})
    .filter(([, id]) => id && id !== '(none)')
    .map(([pos, id]) => ({ pos, name: playerName(id) }));

  // Scoring summary from the play-by-play index (absent when the plays file
  // isn't available, e.g. an unfetched LFS pointer).
  const scoringRows = scoring?.get(gid);
  const scoringPlays = scoringRows ? scoringRows.map(p => {
    const batterName = p.batter ? playerName(p.batter) : '';
    const verb = playVerb(p.flags, p.runs);
    // On a home run the batter is one of the scorers; naming them again is noise.
    const scorers = (p.flags.hr ? p.scorers.filter(id => id !== p.batter) : p.scorers).map(playerName);
    let desc = verb ? `${batterName} ${verb}` : nonBatterEvent(p.flags);
    if (scorers.length) desc += ` — ${scorers.join(', ')} scored`;
    return {
      inning: p.inning, top: p.top, team: p.team, desc, runs: p.runs,
      visScore: p.preV + (p.top ? p.runs : 0),
      homeScore: p.preH + (p.top ? 0 : p.runs),
    };
  }) : null;

  return {
    gid,
    game: {
      date: isoDate,
      season: parseInt(game.season, 10) || 0,
      visteam: visTeam, hometeam: homeTeam,
      visName, homeName,
      visScore: num(game.vruns), homeScore: num(game.hruns),
      site: game.site, parkName,
      attendance: game.attendance,
      innings: game.innings,
      daynight: game.daynight,
      timeofgame: game.timeofgame,
      temp: game.temp, winddir: game.winddir, windspeed: game.windspeed,
      sky: game.sky, precip: game.precip, fieldcond: game.fieldcond,
      usedh: game.usedh,
      wp: game.wp ? playerName(game.wp) : '',
      lp: game.lp ? playerName(game.lp) : '',
      save: game.save ? playerName(game.save) : '',
      gametype: game.gametype,
      brewAbbr, brewIsHome,
      umpires,
    },
    scoring: scoringPlays,
    linescore: ls ? {
      visitor: { ...ls.visitor, name: visName },
      home: { ...ls.home, name: homeName },
    } : null,
    batting: batting.has(gid) ? {
      [visTeam]: buildBattingTable(visTeam),
      [homeTeam]: buildBattingTable(homeTeam),
    } : null,
    pitching: pitching.has(gid) ? {
      [visTeam]: buildPitchingTable(visTeam),
      [homeTeam]: buildPitchingTable(homeTeam),
    } : null,
    fielding: fielding.has(gid) ? {
      [visTeam]: buildFieldingTable(visTeam),
      [homeTeam]: buildFieldingTable(homeTeam),
    } : null,
    hasBatting: batting.has(gid),
    hasFielding: fielding.has(gid),
  };
}
