#!/usr/bin/env node
/**
 * Validates and reports on the Retrosheet data files used by the app:
 *   data/gameinfo.csv      — game-by-game results (Retrosheet cwgame output)
 *   data/CurrentNames.csv  — team ID → name lookup (no header row)
 *
 * Run manually after updating the Retrosheet data files to confirm they
 * parsed correctly.
 *
 * Data source: Retrosheet (retrosheet.org) — free for non-commercial use,
 * credit required.
 */

import { readFileSync } from 'fs';
import { parseGameinfoCsv, parseCurrentNamesCsv } from './records-core.js';

function buildSeasonRecords(games) {
    const seasons = {};
    games.forEach(g => {
        const yr = parseInt(g.season);
        if (!seasons[yr]) seasons[yr] = { season: yr, reg_w: 0, reg_l: 0, reg_t: 0, post_w: 0, post_l: 0, post_t: 0 };
        const s = seasons[yr];
        const result = g['Brewers Win'];
        if (g.regular_season === '1') {
            if (result === 'WIN') s.reg_w++;
            else if (result === 'LOSS') s.reg_l++;
            else if (result === 'TIE') s.reg_t++;
        } else if (g.playoff === '1') {
            if (result === 'WIN') s.post_w++;
            else if (result === 'LOSS') s.post_l++;
            else if (result === 'TIE') s.post_t++;
        }
    });
    return Object.values(seasons).sort((a, b) => a.season - b.season);
}

async function main() {
    console.log('Loading data/gameinfo.csv and data/CurrentNames.csv...');
    const gamesRaw = readFileSync('./data/gameinfo.csv', 'utf8');
    const namesRaw = readFileSync('./data/CurrentNames.csv', 'utf8');

    const { teamNames } = parseCurrentNamesCsv(namesRaw);
    console.log(`Team name entries: ${Object.keys(teamNames).length}`);

    const games = parseGameinfoCsv(gamesRaw, namesRaw);
    const completed = games.filter(g => g['Brewers Win'] !== '');
    const seasons = [...new Set(games.map(g => parseInt(g.season)))].sort((a, b) => a - b);

    console.log(`Total Brewers games: ${games.length} (${completed.length} completed)`);
    console.log(`Seasons: ${seasons[0]}–${seasons[seasons.length - 1]} (${seasons.length} seasons)`);

    const records = buildSeasonRecords(completed);
    const maxSeason = records[records.length - 1];
    console.log(`\nLatest season (${maxSeason.season}): ${maxSeason.reg_w}–${maxSeason.reg_l}${maxSeason.reg_t > 0 ? `–${maxSeason.reg_t}` : ''} (RS), ${maxSeason.post_w}–${maxSeason.post_l} (playoffs)`);

    const undefeated = records.filter(r => r.reg_l === 0 && r.reg_w > 0);
    if (undefeated.length) {
        console.log(`Undefeated regular seasons: ${undefeated.map(r => r.season).join(', ')}`);
    }

    console.log('\nData looks good.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
