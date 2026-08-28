import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSeasonHistory, seasonTally } from '../records-core.js'
import { game, season } from './helpers/rows.js'

// Deliberately parallel to the football repo's file of the same name. Where a
// test exists in both, a shared core has to keep both passing; where one exists
// only here, that behaviour is baseball's and has to stay behind a seam.
//
// seasonTally was running untested on both sites until now — it sat inline in
// processCsvSeasonData, which tallied and rendered in one pass.

test('regular-season wins, losses and ties are counted separately', () => {
	const t = seasonTally(season(2011, 'WWLT'))
	assert.deepEqual([t.wins, t.losses, t.ties], [2, 1, 1])
})

test('postseason games do not touch the regular-season record', () => {
	const rows = [
		...season(2011, 'WWL'),
		game({ date: '2011-10-09', season: 2011, gametype: 'D', result: 'WIN' }),
	]
	const t = seasonTally(rows)
	assert.deepEqual([t.wins, t.losses, t.ties], [2, 1, 0])
	assert.deepEqual(t.postseason, { w: 1, l: 0, t: 0 })
})

test('a season with no playoff games has no postseason at all', () => {
	assert.equal(seasonTally(season(2002, 'LLL')).postseason, null)
})

test('a postseason of ties alone does not count as a postseason', () => {
	// Added because a mutation survived without it: the football repo pins this
	// and this one did not, which is exactly the drift a shared core has to stop.
	// Baseball does produce tied games — called for darkness or weather before
	// the modern rules — so this is reachable here rather than theoretical.
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-12', season: 1982, gametype: 'D', result: 'TIE' }),
	]
	assert.equal(seasonTally(rows).postseason, null)
})

// The difference from football, and the reason this file is not a copy.
//
// A World Series is a best-of-seven. Winning one game in it is not winning it,
// so the test is more championship-round wins than losses. That same test gives
// the football answer for a one-game final — a win is 1 > 0 — which is why the
// two sites can share the line rather than branching on a flag.
test('winning a single World Series game is not winning the World Series', () => {
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-12', season: 1982, gametype: 'W', result: 'WIN', championship: '1982' }),
		game({ date: '1982-10-13', season: 1982, gametype: 'W', result: 'LOSS', championship: '1982' }),
		game({ date: '1982-10-14', season: 1982, gametype: 'W', result: 'LOSS', championship: '1982' }),
	]
	assert.equal(seasonTally(rows).championshipName, null)
})

test('taking the series is winning it', () => {
	const rows = [
		...season(2026, 'WW'),
		game({ date: '2026-10-28', season: 2026, gametype: 'W', result: 'WIN', championship: '2026' }),
		game({ date: '2026-10-29', season: 2026, gametype: 'W', result: 'WIN', championship: '2026' }),
		game({ date: '2026-10-30', season: 2026, gametype: 'W', result: 'LOSS', championship: '2026' }),
	]
	assert.equal(seasonTally(rows).championshipName, 'World Series 2026')
})

test('losing the series outright yields no name', () => {
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-12', season: 1982, gametype: 'W', result: 'LOSS', championship: '1982' }),
	]
	assert.equal(seasonTally(rows).championshipName, null)
})

test('the single-game rule falls out of the series rule', () => {
	// What the football site needs, asserted here so a shared core cannot lose
	// it: one championship game, won, is a title.
	const rows = [
		...season(2010, 'WW'),
		game({ date: '2011-02-06', season: 2010, gametype: 'W', result: 'WIN', championship: 'xlv' }),
	]
	assert.equal(seasonTally(rows, { championship: 'Super Bowl' }).championshipName, 'Super Bowl XLV')
})

test('the vocabulary comes from the site, not from the sport in the code', () => {
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-12', season: 1982, gametype: 'W', result: 'WIN', championship: '1982' }),
	]
	assert.equal(seasonTally(rows, { championship: 'Commissioner’s Trophy' }).championshipName,
		'Commissioner’s Trophy 1982')
})

test('undefeated means no losses yet', () => {
	assert.equal(seasonTally(season(2026, 'WWW')).undefeated, true)
	assert.equal(seasonTally(season(2026, 'WWL')).undefeated, false)
})

test('a season with no games played is not undefeated', () => {
	assert.equal(seasonTally([]).undefeated, false)
})

test('an unfinished season can be undefeated here but not in the records list', () => {
	// The one difference that keeps these two functions separate, pinned so a
	// later merge of them has to fail this test first. A baseball team opens 1-0
	// about half the time; the front page may say so, the records page may not.
	const rows = season(2030, 'WWW')
	assert.equal(seasonTally(rows).undefeated, true)

	const [inHistory] = computeSeasonHistory(rows, { now: new Date(2030, 5, 1) })
	assert.equal(inHistory.undefeated, false, 'the season has not finished yet')
})
