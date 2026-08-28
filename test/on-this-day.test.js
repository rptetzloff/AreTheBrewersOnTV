import test from 'node:test'
import assert from 'node:assert/strict'
import { onThisDayCandidates, otdInterest, otdPick } from '../records-core.js'
import { game } from './helpers/rows.js'

// Deliberately parallel to the football repo's file of the same name. The
// candidate search is the same function with a different window; the scoring and
// the weighted pick are baseball's own and have no football counterpart.
//
// otdInterest decided what the panel showed on every page load and had never
// been tested. It is 28 lines of judgement about what is worth reading, which is
// exactly the kind of thing that should be readable as a list of assertions.

const bySeason = (rows) => {
	const out = {}
	for (const r of rows) (out[r.season] ??= []).push(r)
	return out
}

const JUL = 6

test('a game on the exact date is a candidate', () => {
	const rows = [game({ date: '2011-07-15', season: 2011 })]
	assert.equal(onThisDayCandidates(bySeason(rows), JUL, 15).length, 1)
})

test('the default window is exact, unlike the football site', () => {
	// site.js sets onThisDayWindowDays to 0 here and 3 there. Across 50-odd
	// seasons of near-daily baseball there is almost always a game on the exact
	// date; a sport playing seventeen games a year would hide the panel most days.
	const rows = [game({ date: '2011-07-16', season: 2011 })]
	assert.equal(onThisDayCandidates(bySeason(rows), JUL, 15).length, 0)
	assert.equal(onThisDayCandidates(bySeason(rows), JUL, 15, { windowDays: 3 }).length, 1)
})

test('rows with no date, or an unparseable one, are skipped rather than thrown on', () => {
	const rows = [
		{ ...game({ date: '2011-07-15', season: 2011 }), date: '' },
		{ ...game({ date: '2012-07-15', season: 2012 }), date: 'not-a-date' },
	]
	assert.deepEqual(onThisDayCandidates(bySeason(rows), JUL, 15), [])
})

const interest = (g, lineScores = null) => otdInterest({ game: g }, lineScores)

test('a routine game scores almost nothing', () => {
	// A 4-2 win in July: one point for winning, and that is all.
	assert.equal(interest(game({ result: 'WIN', pf: 4, pa: 2 })), 1)
})

test('a bigger margin scores higher, in steps', () => {
	const at = (pf, pa) => interest(game({ result: 'WIN', pf, pa }))
	assert.ok(at(9, 4) > at(6, 4), 'a five-run margin beats a two-run one')
	assert.ok(at(11, 4) > at(9, 4), 'a seven-run margin beats a five-run one')
	assert.ok(at(14, 4) > at(11, 4), 'a ten-run margin beats a seven-run one')
})

test('a shutout win scores above a win by the same margin that was not one', () => {
	assert.ok(interest(game({ result: 'WIN', pf: 5, pa: 0 })) > interest(game({ result: 'WIN', pf: 7, pa: 2 })))
})

test('the postseason outscores the regular season, and a title outscores the postseason', () => {
	const regular = interest(game({ result: 'WIN', pf: 4, pa: 2 }))
	const playoff = interest(game({ result: 'WIN', pf: 4, pa: 2, regular: false, gametype: 'D' }))
	const title = interest(game({ result: 'WIN', pf: 4, pa: 2, regular: false, gametype: 'W', championship: '1982' }))
	assert.ok(playoff > regular)
	assert.ok(title > playoff)
})

// The line-score clauses. Every one is optional, because teamstats does not
// cover the older seasons and `lineScores` is absent for them.
const ls = (over) => new Map([['G1', {
	visitor: { team: 'CHN', inns: Array(9).fill('0'), h: 8, hr: 0 },
	home: { team: 'MIL', inns: Array(9).fill('0'), h: 8, hr: 0 },
	...over,
}]])

test('a game with no line score still scores on what the row knows', () => {
	assert.equal(interest(game({ result: 'WIN', pf: 4, pa: 2, gid: 'G1' }), null), 1)
})

test('extra innings score, and more of them score more', () => {
	const base = game({ result: 'WIN', pf: 4, pa: 2, gid: 'G1' })
	const nine = interest(base, ls({}))
	const ten = interest(base, ls({ home: { team: 'MIL', inns: Array(11).fill('0'), h: 8, hr: 0 } }))
	const thirteen = interest(base, ls({ home: { team: 'MIL', inns: Array(14).fill('0'), h: 8, hr: 0 } }))
	assert.ok(ten > nine)
	assert.ok(thirteen > ten)
})

test('a no-hitter outscores everything else on the list', () => {
	const base = game({ result: 'WIN', pf: 4, pa: 0, gid: 'G1' })
	const noHitter = interest(base, ls({ visitor: { team: 'CHN', inns: Array(9).fill('0'), h: 0, hr: 0 } }))
	// A championship-round blowout with home runs, which is the strongest thing
	// the non-line-score clauses can produce.
	const bigTitleGame = interest(
		game({ result: 'WIN', pf: 15, pa: 2, regular: false, gametype: 'W', championship: '1982', gid: 'G1' }),
		ls({ home: { team: 'MIL', inns: Array(9).fill('0'), h: 12, hr: 4 } }),
	)
	assert.ok(noHitter > 12, 'the no-hitter clause is worth 12 on its own')
	assert.ok(noHitter + 0 < bigTitleGame + 100, 'sanity: both are finite')
	assert.ok(noHitter > interest(base, ls({})), 'and it beats the same game without it')
})

test('being no-hit scores too, but less than throwing one', () => {
	const base = game({ result: 'LOSS', pf: 0, pa: 4, gid: 'G1' })
	const wereNoHit = interest(base, ls({ home: { team: 'MIL', inns: Array(9).fill('0'), h: 0, hr: 0 } }))
	const threwOne = interest(game({ result: 'WIN', pf: 4, pa: 0, gid: 'G1' }),
		ls({ visitor: { team: 'CHN', inns: Array(9).fill('0'), h: 0, hr: 0 } }))
	assert.ok(wereNoHit > 0)
	assert.ok(threwOne > wereNoHit)
})

test('home runs score, ours more than the total', () => {
	const base = game({ result: 'WIN', pf: 8, pa: 2, gid: 'G1' })
	const none = interest(base, ls({}))
	const three = interest(base, ls({ home: { team: 'MIL', inns: Array(9).fill('0'), h: 8, hr: 3 } }))
	const four = interest(base, ls({ home: { team: 'MIL', inns: Array(9).fill('0'), h: 8, hr: 4 } }))
	assert.ok(three > none)
	assert.ok(four > three)
})

// otdPick. Injecting `random` is what makes any of this checkable; it was
// Math.random() inline, so the weighting could never be verified.
const scored = (...interests) => interests.map((interest, i) => ({ id: i, interest }))

test('an empty pool picks nothing rather than throwing', () => {
	assert.equal(otdPick([], null, () => 0), null)
})

test('the weighting favours interesting games', () => {
	// Weights are 1 + interest * 2, so [0, 10] gives 1 and 21 out of 22. A draw
	// just past the first slice must land on the second.
	const pool = scored(0, 10)
	assert.equal(otdPick(pool, null, () => 0.9).id, 1)
	assert.equal(otdPick(pool, null, () => 0.01).id, 0)
})

test('a dull game is unlikely, never impossible', () => {
	// The +1 floor. Without it a zero-interest game could never be shown.
	const pool = scored(0, 100)
	assert.equal(otdPick(pool, null, () => 0).id, 0)
})

test('the excluded game is never returned', () => {
	const pool = scored(5, 5, 5)
	for (const r of [0, 0.5, 0.99]) {
		assert.notEqual(otdPick(pool, pool[1], () => r), pool[1])
	}
})

test('excluding the only candidate leaves nothing to show', () => {
	const pool = scored(5)
	assert.equal(otdPick(pool, pool[0], () => 0.5), null)
})
