import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUND_ORDER, computeSeasonHistory } from '../records-core.js'
import { LONG_AFTER, game, season } from './helpers/rows.js'

const history = (rows, opts = {}) => computeSeasonHistory(rows, { now: LONG_AFTER, ...opts })
const seasonOf = (rows, year, opts) => history(rows, opts).find((s) => s.season === year)

test('seasons come back in chronological order regardless of row order', () => {
	const rows = [...season(2011, 'W'), ...season(1982, 'W'), ...season(1970, 'W')]
	assert.deepEqual(history(rows).map((s) => s.season), [1970, 1982, 2011])
})

test('a tie counts half in win percentage', () => {
	const s = seasonOf(season(1970, 'WWTT'), 1970)
	assert.equal(s.record, '2–0–2')
	assert.equal(s.winPct, 0.75)
})

test('a season with no completed games does not appear', () => {
	const rows = [game({ date: '2026-04-05', season: 2026, result: '' })]
	assert.deepEqual(history(rows), [])
})

test('the postseason is excluded from the record by default', () => {
	const rows = [
		...season(2018, 'WWL'),
		game({ date: '2018-10-12', season: 2018, gametype: 'L', result: 'WIN', pf: 5, pa: 1 }),
	]
	assert.equal(seasonOf(rows, 2018).record, '2–1')
})

test('the postseason folds into the record when asked for', () => {
	const rows = [
		...season(2018, 'WWL'),
		game({ date: '2018-10-12', season: 2018, gametype: 'L', result: 'WIN', pf: 5, pa: 1 }),
	]
	assert.equal(seasonOf(rows, 2018, { playoffs: true }).record, '3–1')
})

// Rounds, which the football site has no equivalent of: it has one
// championship game, and this has a ladder.
test('the rounds are ordered from wildcard to World Series', () => {
	assert.ok(ROUND_ORDER.F < ROUND_ORDER.D)
	assert.ok(ROUND_ORDER.D < ROUND_ORDER.L)
	assert.ok(ROUND_ORDER.L < ROUND_ORDER.W)
})

test('the season records the furthest round reached, not the last game played', () => {
	// A team can lose the division series after winning the wildcard round.
	// Reading the last row would report the round they went out in; the chart
	// wants how far they got.
	const rows = [
		...season(2018, 'WWW'),
		game({ date: '2018-10-02', season: 2018, gametype: 'F', result: 'WIN' }),
		game({ date: '2018-10-04', season: 2018, gametype: 'D', result: 'LOSS' }),
	]
	assert.equal(seasonOf(rows, 2018).postseason, 'D')
})

test('a season with no postseason has no round', () => {
	const s = seasonOf(season(2002, 'LLL'), 2002)
	assert.ok(!s.postseason)
})

test('winning the World Series makes a champion', () => {
	const rows = [
		...season(2026, 'WW'),
		game({ date: '2026-10-30', season: 2026, gametype: 'W', result: 'WIN', championship: '2026' }),
	]
	const s = seasonOf(rows, 2026)
	assert.equal(s.champion, true)
	assert.equal(s.championship, true)
})

test('losing the World Series is an appearance, not a title', () => {
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-20', season: 1982, gametype: 'W', result: 'LOSS', championship: '1982' }),
	]
	const s = seasonOf(rows, 1982)
	assert.equal(s.champion, false)
	assert.equal(s.championship, false)
	// but the season still reached the final round
	assert.equal(s.postseason, 'W')
})

test('winning an earlier round but losing the last one is not a title', () => {
	const rows = [
		...season(2018, 'WW'),
		game({ date: '2018-10-04', season: 2018, gametype: 'D', result: 'WIN' }),
		game({ date: '2018-10-12', season: 2018, gametype: 'L', result: 'LOSS' }),
	]
	assert.equal(seasonOf(rows, 2018).champion, false)
})

test('undefeated ignores postseason losses, because the flag is regular-season', () => {
	const rows = [
		...season(2026, 'WWW'),
		game({ date: '2026-10-04', season: 2026, gametype: 'D', result: 'LOSS' }),
	]
	assert.equal(seasonOf(rows, 2026).undefeated, true)
})

test('undefeated waits for the season to settle', () => {
	const rows = season(2026, 'WWW')
	assert.equal(seasonOf(rows, 2026, { now: new Date(2026, 5, 1) }).undefeated, false)
	assert.equal(seasonOf(rows, 2026, { now: new Date(2027, 2, 1) }).undefeated, true)
})

test('runs for and against add up across the season', () => {
	const rows = [
		game({ date: '2011-04-05', season: 2011, pf: 9, pa: 2 }),
		game({ date: '2011-04-06', season: 2011, pf: 4, pa: 3 }),
	]
	const s = seasonOf(rows, 2011)
	assert.equal(s.pf, 13)
	assert.equal(s.pa, 5)
})

test('a season lost entirely is still present', () => {
	const s = seasonOf(season(2002, 'LLL'), 2002)
	assert.equal(s.record, '0–3')
	assert.equal(s.winPct, 0)
	assert.equal(s.undefeated, false)
})
