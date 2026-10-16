import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSlots, slotsParam, slotLine, bestIndexes, COMPARE_ROWS, MAX_PLAYERS, PLAYER_ID } from '../compare-core.js'
import { PLAYER_ID as STATS_PLAYER_ID } from '../stats-core.js'

test('the compare page checks ids with the same pattern as the server', () => {
	assert.equal(PLAYER_ID.source, STATS_PLAYER_ID.source)
})

test('slots: a bare id is a career, id-year a season; hyphenated ids survive', () => {
	assert.deepEqual(parseSlots('younr001-1982,yelic001,lee-c001,lee-c001-2006'), [
		{ id: 'younr001', season: 1982 }, { id: 'yelic001', season: null },
		{ id: 'lee-c001', season: null }, { id: 'lee-c001', season: 2006 },
	])
})

test('slots: bad ids and repeats are dropped, and four is the most', () => {
	assert.deepEqual(parseSlots('../etc,younr001,younr001,<x>,molip001-82'), [{ id: 'younr001', season: null }])
	assert.equal(parseSlots('aaaaa001,bbbbb001,ccccc001,ddddd001,eeeee001').length, MAX_PLAYERS)
	assert.deepEqual(parseSlots(null), [])
})

test('slots round-trip through the URL', () => {
	const s = 'younr001-1982,lee-c001,yelic001-2018'
	assert.equal(slotsParam(parseSlots(s)), s)
})

test("a column's line is the season's, or the career's, or none", () => {
	const p = {
		batting: [{ season: 1982, h: 210 }, { season: 1989, h: 195 }],
		pitching: [],
		career: { batting: { h: 3142 }, pitching: null },
	}
	assert.equal(slotLine(p, 1982, 'batting').h, 210)
	assert.equal(slotLine(p, null, 'batting').h, 3142)
	assert.equal(slotLine(p, 1975, 'batting'), null)
	assert.equal(slotLine(p, null, 'pitching'), null)
	assert.equal(slotLine(null, null, 'batting'), null)
})

test('the better number: higher or lower by the row, ties all marked, nothing for one value or all equal', () => {
	assert.deepEqual([...bestIndexes([29, 36, 160], 1)], [2])
	assert.deepEqual([...bestIndexes([2.43, 2.79, 1.04], -1)], [2])
	assert.deepEqual([...bestIndexes([3, null, 3, 5], -1)].sort(), [0, 2])
	assert.deepEqual([...bestIndexes([156, 147], 0)], [])
	assert.deepEqual([...bestIndexes([7, null], 1)], [])
	assert.deepEqual([...bestIndexes([4, 4], 1)], [])
})

test('playing time marks nothing; strikeouts for a batter and ERA for a pitcher are lower-is-better', () => {
	const by = (side, key) => COMPARE_ROWS[side].find((r) => r.key === key).better
	assert.equal(by('batting', 'g'), 0)
	assert.equal(by('batting', 'pa'), 0)
	assert.equal(by('batting', 'k'), -1)
	assert.equal(by('pitching', 'era'), -1)
	assert.equal(by('pitching', 'k'), 1)
	assert.equal(by('pitching', 'gs'), 0)
})
