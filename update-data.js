#!/usr/bin/env node
/**
 * Fetches current Green Bay Packers game data from nflverse-data (CC-BY-4.0)
 * and merges it with the pre-1999 FiveThirtyEight base data to produce:
 *   data/packers_games.csv       — game-by-game results
 *   data/packers_season_records.csv — per-season win/loss/tie totals
 *
 * Run manually or as a pre-build step to refresh data during the live season.
 *
 * Data sources:
 *   1921–1998: FiveThirtyEight nfl-elo-game dataset (MIT License)
 *   1999–present: nflverse-data schedules (CC-BY-4.0, nflverse.com)
 */

import { createWriteStream, readFileSync, writeFileSync } from 'fs';
import https from 'https';

const NFLVERSE_URL =
    'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const follow = (u) => {
            https.get(u, { headers: { 'User-Agent': 'packers-data-updater/1.0' } }, res => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    follow(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                    return;
                }
                const chunks = [];
                res.on('data', d => chunks.push(d));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            }).on('error', reject);
        };
        follow(url);
    });
}

function parseCsv(raw) {
    const lines = raw.trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const vals = line.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
        return obj;
    });
}

const NFL_TEAM_NAMES = {
    ARI: 'Arizona Cardinals',
    ATL: 'Atlanta Falcons',
    BAL: 'Baltimore Ravens',
    BUF: 'Buffalo Bills',
    CAR: 'Carolina Panthers',
    CHI: 'Chicago Bears',
    CIN: 'Cincinnati Bengals',
    CLE: 'Cleveland Browns',
    DAL: 'Dallas Cowboys',
    DEN: 'Denver Broncos',
    DET: 'Detroit Lions',
    GB:  'Green Bay Packers',
    HOU: 'Houston Texans',
    IND: 'Indianapolis Colts',
    JAC: 'Jacksonville Jaguars',
    JAX: 'Jacksonville Jaguars',
    KC:  'Kansas City Chiefs',
    LA:  'Los Angeles Rams',
    LAC: 'Los Angeles Chargers',
    LAR: 'Los Angeles Rams',
    LV:  'Las Vegas Raiders',
    MIA: 'Miami Dolphins',
    MIN: 'Minnesota Vikings',
    NE:  'New England Patriots',
    NO:  'New Orleans Saints',
    NYG: 'New York Giants',
    NYJ: 'New York Jets',
    OAK: 'Oakland Raiders',
    PHI: 'Philadelphia Eagles',
    PIT: 'Pittsburgh Steelers',
    SD:  'San Diego Chargers',
    SEA: 'Seattle Seahawks',
    SF:  'San Francisco 49ers',
    STL: 'St. Louis Rams',
    TB:  'Tampa Bay Buccaneers',
    TEN: 'Tennessee Titans',
    WAS: 'Washington Commanders',
    WSH: 'Washington Commanders',
};

// Map a nflverse games.csv row to our internal format
function mapNflverseRow(r) {
    const season = parseInt(r.season);
    const isAway = r.away_team === 'GB';
    const isHome = r.home_team === 'GB';
    if (!isAway && !isHome) return null;

    // Only include completed games (both scores present)
    const awayScore = r.away_score === '' ? null : parseInt(r.away_score);
    const homeScore = r.home_score === '' ? null : parseInt(r.home_score);
    if (awayScore === null || homeScore === null) return null;

    const packersScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    const oppAbbr = isHome ? r.away_team : r.home_team;
    const oppTeam = NFL_TEAM_NAMES[oppAbbr] ?? oppAbbr;

    const result = packersScore > oppScore ? 'WIN' : packersScore < oppScore ? 'LOSS' : 'TIE';

    // game_type: REG = regular season; WC/DIV/CON/SB = playoffs
    const isPlayoff = !['REG'].includes(r.game_type);
    const isRegular = r.game_type === 'REG';
    const isSuperBowl = r.game_type === 'SB';

    // location from nflverse: "Home"/"Away"/"Neutral" is in r.location (relative to home_team)
    // We need it relative to GB
    let location;
    if (r.location === 'Neutral') {
        location = 'NEUTRAL';
    } else if (isHome) {
        location = 'HOME';
    } else {
        location = 'AWAY';
    }

    return {
        date: r.gameday,
        season,
        regular_season: isRegular ? 1 : 0,
        playoff: isPlayoff ? 1 : 0,
        superbowl: isSuperBowl ? r.game_type : '',
        Opponent: oppTeam,
        'Packers Win': result,
        packers_score: packersScore,
        opponent_score: oppScore,
        location,
    };
}

function buildSeasonRecords(games) {
    const seasons = {};
    games.forEach(g => {
        const yr = parseInt(g.season);
        if (!seasons[yr]) seasons[yr] = { season: yr, reg_w: 0, reg_l: 0, reg_t: 0, post_w: 0, post_l: 0, post_t: 0 };
        const s = seasons[yr];
        const result = g['Packers Win'];
        if (String(g.regular_season) === '1') {
            if (result === 'WIN') s.reg_w++;
            else if (result === 'LOSS') s.reg_l++;
            else if (result === 'TIE') s.reg_t++;
        } else if (String(g.playoff) === '1') {
            if (result === 'WIN') s.post_w++;
            else if (result === 'LOSS') s.post_l++;
            else if (result === 'TIE') s.post_t++;
        }
    });
    return Object.values(seasons).sort((a, b) => a.season - b.season);
}

function rowToCsv(r) {
    return [
        r.date, r.season, r.regular_season, r.playoff, r.superbowl,
        r.Opponent, r['Packers Win'], r.packers_score, r.opponent_score, r.location,
    ].join(',');
}

const GAMES_HEADER = 'date,season,regular_season,playoff,superbowl,Opponent,Packers Win,packers_score,opponent_score,location';
const RECORDS_HEADER = 'season,reg_w,reg_l,reg_t,post_w,post_l,post_t';

async function main() {
    console.log('Fetching nflverse schedules (CC-BY-4.0)...');
    const nflverseRaw = await fetchText(NFLVERSE_URL);
    console.log(`Downloaded ${nflverseRaw.length} bytes`);

    const nflverseRows = parseCsv(nflverseRaw);
    const incomingGames = nflverseRows
        .map(mapNflverseRow)
        .filter(r => r !== null && r.season >= 1999);

    console.log(`Mapped ${incomingGames.length} GB games (1999–present) from nflverse`);

    // Load all existing games
    const baseRaw = readFileSync('./data/packers_games.csv', 'utf8');
    const existingGames = parseCsv(baseRaw);
    const pre1999 = existingGames.filter(g => parseInt(g.season) < 1999);
    console.log(`Loaded ${pre1999.length} base games (pre-1999, FiveThirtyEight)`);

    // Build a lookup of existing 1999+ rows keyed by date+opponent
    const existingMap = new Map();
    existingGames
        .filter(g => parseInt(g.season) >= 1999)
        .forEach(g => existingMap.set(`${g.date}|${g.Opponent}`, g));

    // Upsert: keep existing row if it already has a score, otherwise use incoming
    let kept = 0, updated = 0;
    const merged1999 = incomingGames.map(incoming => {
        const key = `${incoming.date}|${incoming.Opponent}`;
        const existing = existingMap.get(key);
        if (existing && existing['Packers Win'] !== '') {
            kept++;
            return existing;
        }
        updated++;
        return incoming;
    });

    console.log(`Upsert: ${kept} rows kept from CSV, ${updated} rows updated from nflverse`);

    const allGames = [...pre1999, ...merged1999].sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return new Date(a.date) - new Date(b.date);
    });

    // Write games CSV
    const gamesLines = [GAMES_HEADER, ...allGames.map(rowToCsv)].join('\n');
    writeFileSync('./data/packers_games.csv', gamesLines + '\n');
    console.log(`Wrote data/packers_games.csv (${allGames.length} games)`);

    // Write season records CSV
    const records = buildSeasonRecords(allGames);
    const recordsLines = [RECORDS_HEADER, ...records.map(r =>
        `${r.season},${r.reg_w},${r.reg_l},${r.reg_t},${r.post_w},${r.post_l},${r.post_t}`
    )].join('\n');
    writeFileSync('./data/packers_season_records.csv', recordsLines + '\n');
    console.log(`Wrote data/packers_season_records.csv (${records.length} seasons)`);

    // Report latest season in data
    const maxSeason = Math.max(...allGames.map(g => parseInt(g.season)));
    const maxSeasonGames = allGames.filter(g => parseInt(g.season) === maxSeason);
    const completed = maxSeasonGames.filter(g => g['Packers Win'] !== '');
    console.log(`Latest season: ${maxSeason} (${completed.length} completed games)`);
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
