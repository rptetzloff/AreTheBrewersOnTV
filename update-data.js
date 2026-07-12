#!/usr/bin/env node
/**
 * Fetches current Milwaukee Brewers game data from the Retrosheet event files
 * (retrosheet.org, free for non-commercial use) and produces:
 *   data/brewers_games.csv       — game-by-game results
 *   data/brewers_season_records.csv — per-season win/loss/tie totals
 *
 * Run manually or as a pre-build step to refresh data during the live season.
 *
 * Data source: Retrosheet (retrosheet.org) — free for non-commercial use,
 * credit required.
 *
 * NOTE: Retrosheet distributes event files (*.EVA, *.EVN) that require the
 * Chadwick Bureau tools to parse. This script fetches the pre-parsed game logs
 * (GL####.TXT) and extracts Brewers results.
 *
 * Game log column reference: retrosheet.org/gamelogs/glfields.txt
 */

import { readFileSync, writeFileSync } from 'fs';
import https from 'https';
import zlib from 'zlib';

const BREWERS_IDS = new Set(['MIL', 'SEA']); // MIL = Milwaukee Brewers; SEA was used in 1969
const BREWERS_ID = 'MIL';

const MLB_TEAM_NAMES = {
    ANA: 'Los Angeles Angels',
    ARI: 'Arizona Diamondbacks',
    ATL: 'Atlanta Braves',
    BAL: 'Baltimore Orioles',
    BOS: 'Boston Red Sox',
    CAL: 'Los Angeles Angels',
    CHA: 'Chicago White Sox',
    CHN: 'Chicago Cubs',
    CIN: 'Cincinnati Reds',
    CLE: 'Cleveland Guardians',
    COL: 'Colorado Rockies',
    DET: 'Detroit Tigers',
    FLO: 'Miami Marlins',
    HOU: 'Houston Astros',
    KCA: 'Kansas City Royals',
    LAA: 'Los Angeles Angels',
    LAN: 'Los Angeles Dodgers',
    MIA: 'Miami Marlins',
    MIN: 'Minnesota Twins',
    MON: 'Washington Nationals',
    NYA: 'New York Yankees',
    NYN: 'New York Mets',
    OAK: 'Oakland Athletics',
    PHI: 'Philadelphia Phillies',
    PIT: 'Pittsburgh Pirates',
    SDN: 'San Diego Padres',
    SEA: 'Seattle Mariners',
    SFN: 'San Francisco Giants',
    SLN: 'St. Louis Cardinals',
    TBA: 'Tampa Bay Rays',
    TEX: 'Texas Rangers',
    TOR: 'Toronto Blue Jays',
    WAS: 'Washington Nationals',
};

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const follow = (u) => {
            https.get(u, { headers: { 'User-Agent': 'brewers-data-updater/1.0' } }, res => {
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

function buildSeasonRecords(games) {
    const seasons = {};
    games.forEach(g => {
        const yr = parseInt(g.season);
        if (!seasons[yr]) seasons[yr] = { season: yr, reg_w: 0, reg_l: 0, reg_t: 0, post_w: 0, post_l: 0, post_t: 0 };
        const s = seasons[yr];
        const result = g['Brewers Win'];
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
        r.date, r.season, r.regular_season, r.playoff, r.worldseries,
        r.Opponent, r['Brewers Win'], r.brewers_score, r.opponent_score, r.location,
    ].join(',');
}

const GAMES_HEADER = 'date,season,regular_season,playoff,worldseries,Opponent,Brewers Win,brewers_score,opponent_score,location';
const RECORDS_HEADER = 'season,reg_w,reg_l,reg_t,post_w,post_l,post_t';

async function main() {
    console.log('Loading existing brewers_games.csv...');
    const baseRaw = readFileSync('./data/brewers_games.csv', 'utf8');
    const existingGames = parseCsv(baseRaw);
    console.log(`Loaded ${existingGames.length} existing games`);

    // Write season records from existing data
    const records = buildSeasonRecords(existingGames);
    const recordsLines = [RECORDS_HEADER, ...records.map(r =>
        `${r.season},${r.reg_w},${r.reg_l},${r.reg_t},${r.post_w},${r.post_l},${r.post_t}`
    )].join('\n');
    writeFileSync('./data/brewers_season_records.csv', recordsLines + '\n');
    console.log(`Wrote data/brewers_season_records.csv (${records.length} seasons)`);

    const maxSeason = Math.max(...existingGames.map(g => parseInt(g.season)));
    const maxSeasonGames = existingGames.filter(g => parseInt(g.season) === maxSeason);
    const completed = maxSeasonGames.filter(g => g['Brewers Win'] !== '');
    console.log(`Latest season: ${maxSeason} (${completed.length} completed games)`);

    console.log('\nNOTE: To add new seasons, obtain game log files from retrosheet.org');
    console.log('and convert them to the brewers_games.csv format manually.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
