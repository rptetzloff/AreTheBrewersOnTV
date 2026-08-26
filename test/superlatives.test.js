import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSuperlatives, streakSpan } from '../records-core.js'
import { LONG_AFTER, game, season } from './helpers/rows.js'

// Deliberately parallel to the Packers repo's file of the same name. Where a
// test exists in both, the shared core has to keep both passing; where one
// exists only here, that behaviour is baseball's and has to stay behind a seam.

const compute = (rows, opts = {}) => computeSuperlatives(rows, { now: LONG_AFTER, ...opts })

test('best start counts only the unbeaten run that opens a season', () => {
	// Field-by-field rather than deepEqual: the entries here also carry a
	// firstGid that the football site's do not, and asserting the whole object
	// would make this test about that difference instead of about the run.
	const [best] = compute(season(2018, 'WWWWLWWW')).bestStarts
	assert.equal(best.season, 2018)
	assert.equal(best.games, 4)
})

test('a season opening with a loss has no best start at all', () => {
	assert.equal(compute(season(2002, 'LWWWW')).bestStarts.length, 0)
})

test('worst start is the mirror image', () => {
	const [worst] = compute(season(2002, 'LLLLWL')).worstStarts
	assert.equal(worst.season, 2002)
	assert.equal(worst.games, 4)
})

test('starts are ranked longest first, ties broken by the earlier season', () => {
	const rows = [...season(1987, 'WWW'), ...season(2021, 'WWW'), ...season(2018, 'WWWW')]
	assert.deepEqual(compute(rows).bestStarts.map((s) => s.season), [2018, 1987, 2021])
})

test('starts ignore postseason games', () => {
	const rows = [
		...season(2018, 'WW'),
		game({ date: '2018-10-12', season: 2018, gametype: 'L', result: 'WIN' }),
	]
	assert.equal(compute(rows).bestStarts[0].games, 2)
})

// Baseball has no realistic perfect season, but the guard is the same one the
// football site uses and it is what keeps a live unbeaten start from being
// announced as finished.
test('an unbeaten season is not perfect until it is over', () => {
	const rows = season(2026, 'WWWW')
	assert.equal(compute(rows, { now: new Date(2026, 5, 15) }).perfectSeasons.length, 0)
	assert.equal(compute(rows, { now: new Date(2027, 2, 1) }).perfectSeasons.length, 1)
})

// The one place these two sites deliberately disagree, and the reason a shared
// core has to parameterise this rather than unify it.
//
// Here a streak ends when the season does: across 162 games the within-season
// run is the record anyone quotes. The football site does the opposite on
// purpose — its longest streak, 15 games, ran from December 2010 into December
// 2011, and ending it at the boundary would erase the record the list exists
// to show.
//
// Merging the two implementations without noticing this would silently rewrite
// one site's record book, which is the failure mode this whole exercise is for.
test('a win streak ends when the season does', () => {
	const rows = [...season(2020, 'WWW'), ...season(2021, 'WWW')]
	const [longest] = compute(rows).winStreaks
	assert.equal(longest.games, 3)
	assert.equal(longest.startSeason, longest.endSeason)
})

test('a loss ends a win streak', () => {
	assert.equal(compute(season(2021, 'WWWLWW')).winStreaks[0].games, 3)
})

test('postseason wins do not extend a regular-season streak', () => {
	const rows = [
		...season(2018, 'WWW'),
		game({ date: '2018-10-12', season: 2018, gametype: 'L', result: 'WIN' }),
		...season(2019, 'L'),
	]
	assert.equal(compute(rows).winStreaks[0].games, 3)
})

// The Packers site has no losing-streak list. This is one of the places the
// two genuinely differ, so the seam has to allow a site to want fewer lists.
test('losing streaks are tracked as well as winning ones', () => {
	const { loseStreaks } = compute(season(2002, 'LLLLLWL'))
	assert.equal(loseStreaks[0].games, 5)
})

test('streakSpan names one season or two', () => {
	assert.equal(streakSpan({ startSeason: 2018, endSeason: 2018 }), '2018')
	assert.equal(streakSpan({ startSeason: 2020, endSeason: 2021 }), '2020–2021')
})

test('lopsided wins are ranked by margin, not by score', () => {
	const rows = [
		game({ date: '1992-04-15', result: 'WIN', pf: 22, pa: 2 }),  // margin 20
		game({ date: '2010-05-20', result: 'WIN', pf: 18, pa: 1 }),  // margin 17
	]
	assert.deepEqual(compute(rows).lopsidedWins.map((g) => g.pf), [22, 18])
})

test('equal margins are broken by the higher score', () => {
	const rows = [
		game({ date: '1992-04-15', result: 'WIN', pf: 10, pa: 0 }),
		game({ date: '2010-05-20', result: 'WIN', pf: 15, pa: 5 }),
	]
	assert.equal(compute(rows).lopsidedWins[0].pf, 15)
})

test('a postseason game in a lopsided list is flagged as one', () => {
	const rows = [game({ date: '1982-10-12', season: 1982, gametype: 'W', result: 'WIN', pf: 10, pa: 0, worldseries: '1982' })]
	const [g] = compute(rows).lopsidedWins
	assert.equal(g.playoff, true)
	assert.equal(g.worldseries, true)
})

test('ties are listed in full and newest first', () => {
	const rows = [
		game({ date: '1970-05-01', result: 'TIE', pf: 3, pa: 3 }),
		game({ date: '1985-06-11', result: 'TIE', pf: 7, pa: 7 }),
		game({ date: '1978-04-20', result: 'WIN' }),
	]
	const { ties } = compute(rows)
	assert.deepEqual(ties.map((t) => t.date), ['1985-06-11', '1970-05-01'])
})

test('rows with no result are ignored rather than counted as losses', () => {
	// A scheduled game arrives with empty runs and no winning team, and the
	// data workflow commits them mid-season.
	const rows = [...season(2026, 'WW'), game({ date: '2026-04-20', season: 2026, result: '' })]
	const { perfectSeasons } = compute(rows, { now: new Date(2027, 2, 1) })
	assert.equal(perfectSeasons.length, 1)
	assert.equal(perfectSeasons[0].wins, 2)
})

// Postseason structure, which the football site does not model at all: it has
// one championship game, and this has rounds.
test('a postseason appearance is recorded once per season, not once per game', () => {
	const rows = [
		...season(2018, 'WWW'),
		game({ date: '2018-10-04', season: 2018, gametype: 'D', result: 'WIN' }),
		game({ date: '2018-10-05', season: 2018, gametype: 'D', result: 'WIN' }),
		game({ date: '2018-10-12', season: 2018, gametype: 'L', result: 'LOSS' }),
	]
	const { playoffAppearances } = compute(rows)
	assert.equal(playoffAppearances.length, 1)
	assert.equal(playoffAppearances[0].season, 2018)
})

test('a World Series appearance is recorded whether it was won or lost', () => {
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-12', season: 1982, gametype: 'W', result: 'LOSS', worldseries: '1982' }),
	]
	const { worldSeriesAppearances } = compute(rows)
	assert.equal(worldSeriesAppearances.length, 1)
	assert.equal(worldSeriesAppearances[0].season, 1982)
})

test('a season with no postseason games appears in neither list', () => {
	const { playoffAppearances, worldSeriesAppearances } = compute(season(2002, 'LLL'))
	assert.equal(playoffAppearances.length, 0)
	assert.equal(worldSeriesAppearances.length, 0)
})

test('top is respected', () => {
	const rows = [2015, 2016, 2017, 2018, 2019, 2020].flatMap((y) => season(y, 'WWL'))
	assert.equal(compute(rows, { top: 3 }).bestStarts.length, 3)
})
