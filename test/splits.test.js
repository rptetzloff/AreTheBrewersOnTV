import test from 'node:test'
import assert from 'node:assert/strict'
import { teamSplits, opposingStarterHands, opposingStarterIds } from '../splits-core.js'
import { game } from './helpers/rows.js'

const MIL = new Set(['MIL'])
const inns = (n) => ({ visitor: { inns: [...Array(n).fill('0'), ...Array(28 - n).fill('')] }, home: { inns: [...Array(n).fill('0'), ...Array(28 - n).fill('')] } })

// Five games: a home day win by one, an away night loss by six, a tie, a
// 2020 seven-inning doubleheader game that went to the eighth, and an
// October game that belongs with September.
const rows = [
	{ ...game({ date: '1982-04-10', result: 'WIN', pf: 3, pa: 2, location: 'home' }), gid: 'a' },
	{ ...game({ date: '1982-06-02', result: 'LOSS', pf: 1, pa: 7, location: 'away' }), gid: 'b' },
	{ ...game({ date: '1982-06-03', result: 'TIE', pf: 4, pa: 4, location: 'away' }), gid: 'c' },
	{ ...game({ date: '2020-09-14', result: 'WIN', pf: 2, pa: 1, location: 'home' }), gid: 'd' },
	{ ...game({ date: '1982-10-03', result: 'WIN', pf: 10, pa: 2, location: 'home' }), gid: 'e' },
]
const gameDay = new Map([
	['a', { daynight: 'day', scheduled: 9 }], ['b', { daynight: 'night', scheduled: 9 }],
	['c', { daynight: 'night', scheduled: 9 }], ['d', { daynight: 'day', scheduled: 7 }],
	['e', { daynight: '', scheduled: 9 }],
])
const lineScores = new Map([['a', inns(9)], ['b', inns(9)], ['c', inns(9)], ['d', inns(8)], ['e', inns(9)]])
const starterHand = new Map([['a', 'R'], ['b', 'L'], ['c', 'R'], ['d', 'R']])
const S = teamSplits(rows, { gameDay, lineScores, starterHand })
const at = (label) => S.find((s) => s.label === label)
const wlt = (s) => [s.g, s.w, s.l, s.t]

test('overall and where: wins, losses, ties and runs', () => {
	assert.deepEqual(wlt(at('All games')), [5, 3, 1, 1])
	assert.equal(at('All games').rs, 20)
	assert.equal(at('All games').ra, 16)
	assert.deepEqual(wlt(at('Home')), [3, 3, 0, 0])
	assert.deepEqual(wlt(at('Away')), [2, 0, 1, 1])
})

test('day and night only where recorded; months grouped as MLB does', () => {
	assert.equal(at('Day').g, 2)
	assert.equal(at('Night').g, 2)
	assert.deepEqual(S.filter((s) => s.group === 'Month').map((s) => [s.label, s.g]),
		[['Mar/Apr', 1], ['June', 2], ['Sept/Oct', 2]])
})

test('extra innings are past the scheduled length, seven-inning doubleheaders included', () => {
	assert.deepEqual(wlt(at('Extra innings')), [1, 1, 0, 0])
	assert.equal(at('One-run games').g, 2)
	assert.equal(at('Blowouts (5+ runs)').g, 2)
})

test('the opposing starter by hand; an unknown hand is in neither', () => {
	assert.equal(at('Right-handed').g, 3)
	assert.equal(at('Left-handed').g, 1)
})

test("the opposing starter is the other team's pitcher with a start", () => {
	const idx = new Map([
		['a', [{ id: 'ours', team: 'MIL', gs: true }, { id: 'rel', team: 'CHN', gs: false }, { id: 'lefty', team: 'CHN', gs: true }]],
		['b', [{ id: 'ours', team: 'MIL', gs: true }, { id: 'nobio', team: 'NYA', gs: true }]],
	])
	assert.deepEqual([...opposingStarterIds(['a', 'b'], idx, MIL)], ['lefty', 'nobio'])
	const bios = new Map([['lefty', { throws: 'L' }]])
	assert.deepEqual([...opposingStarterHands(['a', 'b'], idx, MIL, bios)], [['a', 'L']])
})
