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
    const name = (fullI >= 0 && v[fullI]?.trim()) || [v[useI], v[lastI]].filter(Boolean).join(' ').trim();
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
    dp: num(v[i.d_dp]), tp: num(v[i.d_tp]), gs: v[i.d_gs] === '1',
  }));
}

export function buildGameIndex(raw) {
  const map = new Map();
  if (isLfsPointer(raw)) return map;
  const lines = raw.split('\n');
  const h = splitCsvLine(lines[0]);
  const idx = {};
  for (const c of ['gid','visteam','hometeam','site','date','number','starttime','daynight','innings','usedh','timeofgame','attendance','fieldcond','precip','sky','temp','winddir','windspeed','wp','lp','save','gametype','vruns','hruns','wteam','lteam','season'])
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
    });
  }
  return map;
}

function ipString(ipouts) {
  const inn = Math.floor(ipouts / 3);
  const frac = ipouts % 3;
  return `${inn}.${frac}`;
}

function positionFor(batter, fielders) {
  if (!fielders) return '';
  const rows = fielders.filter(f => f.id === batter.id);
  const started = rows.find(f => f.gs);
  if (started) return POS_NAMES[started.pos] || '';
  if (batter.isPh) return 'PH';
  if (batter.isPr) return 'PR';
  if (rows.length) return POS_NAMES[rows[0].pos] || '';
  return '';
}

// Assemble the full box score for a game.
// `indices` = { games, pitching, batting, fielding, playerNames, namesData, parks, lineScores }
export function buildBoxscore(gid, { games, pitching, batting, fielding, playerNames, namesData, parks, lineScores }) {
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
  const buildBattingTable = (teamId) => {
    const teamBat = batRows.filter(b => b.team === teamId).sort((a, b) => a.lp - b.lp || a.seq - b.seq);
    const teamField = fieldRows.filter(f => f.team === teamId);
    // Team totals
    const totals = teamBat.reduce((acc, b) => {
      for (const k of ['ab','r','h','d','t','hr','rbi','bb','k','sb','cs','hbp','sf','sh','gdp']) acc[k] += b[k];
      acc.pa += b.pa;
      return acc;
    }, { pa:0, ab:0, r:0, h:0, d:0, t:0, hr:0, rbi:0, bb:0, k:0, sb:0, cs:0, hbp:0, sf:0, sh:0, gdp:0 });
    return {
      players: teamBat.map(b => ({
        id: b.id, name: playerName(b.id), pos: positionFor(b, teamField),
        isStarter: b.seq === 1, isPh: b.isPh, isPr: b.isPr,
        pa: b.pa, ab: b.ab, r: b.r, h: b.h, d: b.d, t: b.t, hr: b.hr,
        rbi: b.rbi, bb: b.bb, k: b.k, sb: b.sb, cs: b.cs,
        hbp: b.hbp, sf: b.sf, sh: b.sh, gdp: b.gdp,
      })),
      totals,
    };
  };

  // Pitching: group by team, sort by seq
  const pitchRows = pitching.get(gid) || [];
  const buildPitchingTable = (teamId) => {
    const teamPitch = pitchRows.filter(p => p.team === teamId).sort((a, b) => a.seq - b.seq);
    const totals = teamPitch.reduce((acc, p) => {
      for (const k of ['ipouts','bf','h','r','er','bb','k','hr','hbp','wp','bk']) acc[k] += p[k];
      return acc;
    }, { ipouts:0, bf:0, h:0, r:0, er:0, bb:0, k:0, hr:0, hbp:0, wp:0, bk:0 });
    return {
      pitchers: teamPitch.map(p => ({
        id: p.id, name: playerName(p.id), ip: ipString(p.ipouts),
        bf: p.bf, h: p.h, r: p.r, er: p.er, bb: p.bb, k: p.k, hr: p.hr,
        hbp: p.hbp, wp: p.wp, bk: p.bk, isWp: p.isWp, isLp: p.isLp, isSave: p.isSave,
        gs: p.gs, gf: p.gf,
      })),
      totals: { ...totals, ip: ipString(totals.ipouts) },
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
        po: f.po, a: f.a, e: f.e, dp: f.dp, tp: f.tp,
      })),
      totals,
    };
  };

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
    },
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
