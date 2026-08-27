import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	BREWERS_IDS,
	ROUND_ORDER,
	computeSeasonHistory,
	computeSuperlatives,
	parseGameinfoCsv,
	parseGamesCsv,
} from '../records-core.js'
import { computeHeadToHead } from '../h2h-core.js'
import { SITE } from '../site.js'

// The real data, asserted against the real functions.
//
// Same discipline as the Packers repo's file of this name: relations and
// floors, never snapshots. Equality is reserved for facts that have finished
// happening — 1982 is not going to stop being a World Series year.
//
// The reason differs from that repo's, and an earlier version of this comment
// borrowed its reason wrongly. There, update-data.yml runs on a cron every
// Tuesday and commits new games mid-season, so a snapshot assertion fails every
// week. Here the Retrosheet files are refreshed by hand and the workflow only
// validates them — it never commits. The floors are still right, because a
// season's worth of rows arriving at once moves every count, but they are not
// load-bearing in the same way.
//
// What follows from that is worth knowing: this file only ever sees completed
// seasons. The CSV stops at the last finished one, and the season in progress is
// served live from ESPN through lib/seasons.js — the module none of these tests
// can reach, because it reads the CSV at import time and calls the network. So
// the most interesting season is always the one with no coverage.
//
// Deliberately does not read data/plays.lfs.csv. That file is 387MB, is
// fetched through Git LFS, and parses as an empty index when the pointer has
// not been smudged — so a test depending on it would pass or fail based on how
// the repo was cloned rather than on whether the code is right.

const read = (name) => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8')

const rows = parseGameinfoCsv(read('gameinfo.csv'), read('CurrentNames.csv'), read('teamstats.csv'))
const SETTLED = new Date(2030, 5, 1)
const history = computeSeasonHistory(rows, { now: SETTLED })
const supers = computeSuperlatives(rows, { now: SETTLED, top: 10 })

test('the file parses into a plausible number of games', () => {
	assert.ok(rows.length > 8500, `only ${rows.length} games parsed`)
})

test('every row the parser emits is a Brewers game', () => {
	// The filter is by team id on either side. A row that slipped through would
	// be another team's game counted in this team's record.
	const raw = parseGamesCsv(read('gameinfo.csv'))
	const brewers = raw.filter((r) => BREWERS_IDS.has(r.hometeam) || BREWERS_IDS.has(r.visteam))
	assert.equal(rows.length, brewers.length)
})

test('every result is one the code knows how to count', () => {
	// Anything unrecognised is silently dropped by every compute function, so a
	// typo upstream loses games rather than failing loudly.
	const known = new Set(['WIN', 'LOSS', 'TIE', ''])
	const strange = [...new Set(rows.map((r) => r['Brewers Win']))].filter((v) => !known.has(v))
	assert.deepEqual(strange, [])
})

test('every date is ISO, because everything downstream sorts the raw string', () => {
	const bad = rows.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
	assert.deepEqual(bad.map((r) => r.date), [])
})

test('every gametype is one the code has a rule for', () => {
	// Five rounds plus T, which normalizeGametype produces for a bare
	// "playoff" with no round named. Exactly one game in the file is a T: the
	// 2018 NL Central tiebreaker against the Cubs. See the two tests below —
	// it is the most interesting row in the dataset.
	const known = new Set(['R', 'F', 'D', 'L', 'W', 'T'])
	const strange = [...new Set(rows.map((r) => r.gametype))].filter((v) => !known.has(v))
	assert.deepEqual(strange, [], 'an unknown round would be treated as postseason')
})

// Two tests that describe what happens rather than assert what should. The
// tiebreaker is a genuine judgement call and this file is not the place to
// settle it; what it can do is make sure nobody changes the answer by accident.
test('the 2018 tiebreaker is currently classified as a postseason game', () => {
	const tiebreakers = rows.filter((r) => r.gametype === 'T')
	assert.equal(tiebreakers.length, 1)
	const [g] = tiebreakers
	assert.equal(g.date, '2018-10-01')
	assert.equal(g.regular_season, '0')

	// The consequence: 2018 shows 95–67 here. MLB counted Game 163 as a
	// regular-season game, so reference sources say 96–67. Whether this site
	// should agree with them is a decision, not a bug to fix silently.
	const s = history.find((x) => x.season === 2018)
	assert.equal(s.record, '95–67')
	assert.equal(rows.filter((r) => r.season === '2018' && r.regular_season === '1').length, 162)
})

test('a T does not outrank a real round when finding the furthest one reached', () => {
	// ROUND_ORDER has no entry for T, so it compares as undefined and loses to
	// every named round. That gives the right answer for 2018 — the NLCS is
	// further than a tiebreaker — but by omission rather than by decision.
	//
	// The untested case is a season whose only postseason game is a tiebreaker
	// they lost. No such season exists in this data, so nothing here pins it.
	assert.equal(ROUND_ORDER.T, undefined)
	assert.equal(history.find((x) => x.season === 2018).postseason, 'L')
})

test('regular_season and gametype agree with each other', () => {
	// They are derived from the same value but stored separately, so they can
	// drift — and the record line reads one while the round badge reads the other.
	const wrong = rows.filter((r) => (r.gametype === 'R') !== (r.regular_season === '1'))
	assert.deepEqual(wrong.map((r) => `${r.date} ${r.gametype}/${r.regular_season}`), [])
})

test('the result agrees with the scores, except where a game had no score', () => {
	const played = rows.filter((r) => ['WIN', 'LOSS', 'TIE'].includes(r['Brewers Win']))
	const scored = played.filter((r) => r.brewers_score !== '' && r.opponent_score !== '')
	const wrong = scored.filter((r) => {
		const pf = parseInt(r.brewers_score, 10)
		const pa = parseInt(r.opponent_score, 10)
		const implied = pf > pa ? 'WIN' : pf < pa ? 'LOSS' : 'TIE'
		return implied !== r['Brewers Win']
	})
	// Forfeits are the known exception: the recorded winner is not the higher
	// score. If this list grows past a handful, something else is wrong.
	assert.ok(wrong.length <= 2, `${wrong.length} games disagree: ${wrong.slice(0, 3).map((r) => r.date).join(', ')}`)
})

test('seasons are contiguous from the first to the last', () => {
	const years = history.map((s) => s.season)
	for (let i = 1; i < years.length; i++) {
		assert.equal(years[i], years[i - 1] + 1, `gap between ${years[i - 1]} and ${years[i]}`)
	}
})

// Closed history. The franchise began as the 1969 Seattle Pilots, and that
// season only appears at all because SE1 is in BREWERS_IDS — it is the single
// row of data most easily lost by a refactor of the team filter.
test('the history starts in 1969, the Seattle Pilots season', () => {
	assert.equal(history[0].season, 1969)
	assert.ok(history.length >= 57, `only ${history.length} seasons`)
})

test('1982 is a World Series season', () => {
	const ws = history.filter((s) => s.postseason === 'W').map((s) => s.season)
	assert.ok(ws.includes(1982), 'the 1982 World Series appearance is missing')
})

test('a World Series title implies a World Series appearance', () => {
	// A relation rather than a count, because the Brewers have not won one yet
	// and a test asserting that would be a strange thing to have to delete.
	for (const s of history.filter((x) => x.worldseries)) {
		assert.equal(s.postseason, 'W', `${s.season} is a title with no final round`)
	}
})

test('champion and worldseries agree', () => {
	for (const s of history) {
		if (s.worldseries) assert.equal(s.champion, true, `${s.season}`)
	}
})

test('every postseason season reached a round, and no other season did', () => {
	for (const s of history) {
		const played = rows.some((r) => parseInt(r.season, 10) === s.season && r.regular_season !== '1')
		assert.equal(Boolean(s.postseason), played, `${s.season}`)
	}
})

test('the best start and longest streak are at least their historical values', () => {
	// Floors: these are records, and records get broken. A drop below means the
	// computation changed rather than that history did.
	assert.ok(supers.bestStarts[0].games >= 13, `best start is ${supers.bestStarts[0].games}`)
	assert.ok(supers.winStreaks[0].games >= 14, `longest streak is ${supers.winStreaks[0].games}`)
})

test('no win streak spans two seasons, which is this sport rule', () => {
	// The rule the football site deliberately inverts. Asserting it against the
	// real data is what would catch a shared core adopting the other one.
	for (const s of supers.winStreaks) {
		assert.equal(s.startSeason, s.endSeason, `a streak spans ${s.startSeason}–${s.endSeason}`)
	}
})

test('every tie ever is listed, newest first', () => {
	assert.ok(supers.ties.length >= 4, `only ${supers.ties.length} ties`)
	const dates = supers.ties.map((t) => t.date)
	assert.deepEqual(dates, [...dates].sort().reverse())
})

test('head-to-head covers every opponent exactly once', () => {
	const { opponents } = computeHeadToHead(rows)
	const slugs = opponents.map((o) => o.slug)
	assert.equal(new Set(slugs).size, slugs.length, 'two opponents share a slug')
	const franchises = opponents.map((o) => o.franchise)
	assert.equal(new Set(franchises).size, franchises.length, 'a franchise appears twice')
})

test('head-to-head games add up to the games actually played', () => {
	const counted = computeHeadToHead(rows).opponents.reduce((n, o) => n + o.games, 0)
	const played = rows.filter((r) => ['WIN', 'LOSS', 'TIE'].includes(r['Brewers Win'])).length
	assert.equal(counted, played, 'games were lost or double-counted in the fold')
})

test('every opponent record sums to its game count', () => {
	for (const o of computeHeadToHead(rows).opponents) {
		assert.equal(o.wins + o.losses + o.ties, o.games, `${o.name} does not add up`)
	}
})

test('the opponent list covers the rest of the league and then some', () => {
	const { opponents } = computeHeadToHead(rows)
	// 29 other current franchises, plus any defunct ones met along the way.
	assert.ok(opponents.length >= 29, `only ${opponents.length} opponents`)
	assert.ok(opponents.filter((o) => o.current).length >= 29)
})

// A baseball team does not go undefeated, and this asserts that the data agrees.
//
// The point is not the record — it is that a non-empty list here would be an
// alarm rather than a discovery. The realistic cause is a season with only a
// handful of games recorded, all of them wins: computeSuperlatives asks only
// that losses === 0 and wins > 0, so three wins and no other rows look exactly
// like a perfect season. seasonSettled stops a live 5-0 start from qualifying;
// nothing stops an incomplete historical one.
//
// The margin is the reassuring part. The best season in franchise history is
// .599, and the shortest is 2020's 60 games at 29-31. Anything approaching 1.000
// is not a story, it is a broken import.
test('no season is perfect, and a perfect one would mean the data is wrong', () => {
	assert.equal(SITE.perfectSeasonIsPlausible, false,
		'the manifest should say this cannot happen in this sport')
	assert.deepEqual(supers.perfectSeasons, [],
		'a perfect baseball season means games are missing, not that history changed')

	// .700 rather than a looser figure, because .700 is already near-mythical:
	// exactly two full seasons have cleared it since 1955 — Seattle's 116–46 in
	// 2001 (.716) and New York's 114–48 in 1998 (.704). This franchise has
	// never exceeded .599 and has existed only since 1969, entirely inside that
	// era, so anything at .700 deserves a human look whether it turns out to be
	// a broken import or something worth celebrating.
	const best = history.reduce((a, b) => (b.winPct > a.winPct ? b : a))
	assert.ok(best.winPct < 0.700,
		`${best.season} is ${best.winPct.toFixed(3)} (${best.record}) — check the import before celebrating`)
})

// The gap in the test above, named rather than left to be discovered.
//
// A rate says nothing without a denominator, and the clearest evidence is real:
// the 2020 Dodgers finished .717 in a 60-game season, above both full seasons
// since 1955. A short season and a half-imported one produce the same shape, so
// the rate alone cannot tell a record from a truncated file.
//
// This franchise's own 2020 was 29–31, so nothing here trips today. The check
// that actually holds is the games floor below it.
test('a high win rate over few games is not evidence of anything', () => {
	const shortSeasons = history.filter((s) => s.wins + s.losses + s.ties < 100)
	for (const s of shortSeasons) {
		assert.ok(s.winPct < 0.700,
			`${s.season}: ${s.record} over ${s.wins + s.losses + s.ties} games is a rate without a season behind it`)
	}
})

test('every season has enough games to be a season', () => {
	// The floor that would catch the failure above at its source. 2020 is the
	// genuine minimum at 60 games; anything materially below that is an
	// incomplete import rather than a short season.
	for (const s of history) {
		const played = s.wins + s.losses + s.ties
		assert.ok(played >= 50, `${s.season} has only ${played} games`)
	}
})

// The CSV holds finished seasons only. Retrosheet publishes after a season
// ends, and the one in progress comes from ESPN instead — so a partial season
// appearing here means a hand-refresh caught the file mid-publication.
//
// This is also why the win-rate alarm above cannot see a live season. A team on
// pace for a franchise record is invisible to every test in this file until the
// following winter, which is a limit of the coverage rather than of the data.
test('the newest season in the file is a complete one', () => {
	const newest = history[history.length - 1]
	const played = newest.wins + newest.losses + newest.ties
	assert.ok(played >= 150,
		`${newest.season} has only ${played} games — a partial Retrosheet import`)
})
