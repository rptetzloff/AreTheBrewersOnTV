import test from 'node:test'
import assert from 'node:assert/strict'
import { computeHeadToHead, h2hCopy, meetings, slugifyOpponent, streakSentence } from '../h2h-core.js'
import { game } from './helpers/rows.js'

// Parallel to the Packers repo's file of the same name. The interesting
// difference is how the two sites fold a franchise's history together: that one
// keeps a hardcoded alias table, and this one carries a franchise code on every
// row from Retrosheet. Same problem, two answers — so the shared core has to
// take the grouping key rather than decide it.

const vs = (opponent, opts = {}) => game({ opponent, ...opts })
const only = (rows, name) => computeHeadToHead(rows).bySlug.get(slugifyOpponent(name))

test('slugifyOpponent makes a URL-safe name', () => {
	assert.equal(slugifyOpponent('St. Louis Cardinals'), 'st-louis-cardinals')
	assert.equal(slugifyOpponent('Chicago Cubs'), 'chicago-cubs')
})

test('slugifyOpponent collapses punctuation rather than doubling separators', () => {
	assert.ok(!slugifyOpponent('St. Louis Cardinals').includes('--'))
})

// Retrosheet gives every row a franchise code, so a relocated team folds
// without a hand-maintained alias list. OAK covers Philadelphia, Kansas City,
// Oakland and Sacramento.
test('games fold by franchise code, not by displayed name', () => {
	const rows = [
		vs('Kansas City Athletics', { franchise: 'OAK', date: '1968-06-01', result: 'WIN' }),
		vs('Oakland Athletics', { franchise: 'OAK', date: '1998-06-01', result: 'LOSS' }),
	]
	const { opponents } = computeHeadToHead(rows)
	assert.equal(opponents.length, 1)
	assert.equal(opponents[0].games, 2)
	assert.equal(opponents[0].franchise, 'OAK')
})

test('two franchises sharing a city stay separate', () => {
	const rows = [
		vs('Chicago Cubs', { franchise: 'CHN', date: '2020-07-24' }),
		vs('Chicago White Sox', { franchise: 'CHA', date: '2020-08-24' }),
	]
	assert.equal(computeHeadToHead(rows).opponents.length, 2)
})

test('opponents are ordered by games played, rivals first', () => {
	const rows = [
		...[1, 2, 3].map((i) => vs('Chicago Cubs', { franchise: 'CHN', date: `200${i}-06-10` })),
		...[1, 2, 3, 4, 5].map((i) => vs('St. Louis Cardinals', { franchise: 'SLN', date: `200${i}-07-10` })),
		vs('Miami Marlins', { franchise: 'MIA', date: '2004-08-10' }),
	]
	assert.deepEqual(
		computeHeadToHead(rows).opponents.map((o) => o.name),
		['St. Louis Cardinals', 'Chicago Cubs', 'Miami Marlins'],
	)
})

test('the record counts every meeting, postseason included', () => {
	const rows = [
		vs('St. Louis Cardinals', { franchise: 'SLN', date: '2011-06-10', result: 'WIN' }),
		vs('St. Louis Cardinals', { franchise: 'SLN', date: '2011-10-10', result: 'LOSS', gametype: 'L' }),
	]
	const o = only(rows, 'St. Louis Cardinals')
	assert.equal(o.record, '1–1')
	assert.equal(o.games, 2)
})

test('the postseason split is broken out separately', () => {
	const rows = [
		vs('St. Louis Cardinals', { franchise: 'SLN', date: '2011-06-10', result: 'WIN' }),
		vs('St. Louis Cardinals', { franchise: 'SLN', date: '2011-10-10', result: 'LOSS', gametype: 'L' }),
	]
	const o = only(rows, 'St. Louis Cardinals')
	assert.equal(o.playoffGames, 1)
	assert.equal(o.playoffRecord, '0–1')
})

test('an opponent never met in the postseason has no postseason record', () => {
	const o = only([vs('Miami Marlins', { franchise: 'MIA', date: '2004-08-10' })], 'Miami Marlins')
	assert.equal(o.playoffGames, 0)
	assert.equal(o.playoffRecord, null)
})

test('the streak counts back from the most recent meeting', () => {
	const rows = [
		vs('Chicago Cubs', { franchise: 'CHN', date: '2018-06-10', result: 'LOSS' }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '2019-06-10', result: 'WIN' }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '2020-06-10', result: 'WIN' }),
	]
	assert.deepEqual(only(rows, 'Chicago Cubs').streak, { result: 'WIN', count: 2 })
})

test('a run of two or more reads as a streak', () => {
	const rows = [
		vs('Chicago Cubs', { franchise: 'CHN', date: '2019-06-10', result: 'WIN' }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '2020-06-10', result: 'WIN' }),
	]
	assert.equal(streakSentence(only(rows, 'Chicago Cubs')), 'The Brewers have won the last 2 meetings.')
})

test('biggest win is by margin and only considers wins', () => {
	const rows = [
		vs('Chicago Cubs', { franchise: 'CHN', date: '2018-06-10', result: 'WIN', pf: 12, pa: 1 }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '2019-06-10', result: 'WIN', pf: 8, pa: 2 }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '2020-06-10', result: 'LOSS', pf: 0, pa: 9 }),
	]
	assert.equal(only(rows, 'Chicago Cubs').biggestWin.pf, 12)
})

test('an opponent never beaten has no biggest win', () => {
	assert.equal(only([vs('Miami Marlins', { franchise: 'MIA', result: 'LOSS' })], 'Miami Marlins').biggestWin, null)
})

test('first and last meeting bracket the history', () => {
	const rows = [
		vs('Chicago Cubs', { franchise: 'CHN', date: '2020-07-24' }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '1970-06-01' }),
	]
	const o = only(rows, 'Chicago Cubs')
	assert.equal(o.first.date, '1970-06-01')
	assert.equal(o.last.date, '2020-07-24')
})

test('win percentage counts a tie as half', () => {
	const rows = [
		vs('Chicago Cubs', { franchise: 'CHN', date: '2010-06-10', result: 'WIN' }),
		vs('Chicago Cubs', { franchise: 'CHN', date: '2011-06-10', result: 'TIE' }),
	]
	assert.equal(only(rows, 'Chicago Cubs').winPct, 0.75)
})

test('meetings pluralises', () => {
	assert.equal(meetings(1), '1 meeting')
	assert.equal(meetings(2), '2 meetings')
})

test('h2hCopy falls back to landing copy for an unknown slug', () => {
	const data = computeHeadToHead([vs('Chicago Cubs', { franchise: 'CHN' })])
	const copy = h2hCopy('not-a-team', data)
	assert.match(copy.desc, /Chicago Cubs/)
})

test('h2hCopy names the opponent and the record', () => {
	const data = computeHeadToHead([vs('Chicago Cubs', { franchise: 'CHN', result: 'WIN' })])
	assert.match(h2hCopy('chicago-cubs', data).title, /Chicago Cubs/)
	assert.match(h2hCopy('chicago-cubs', data).title, /1–0/)
})
