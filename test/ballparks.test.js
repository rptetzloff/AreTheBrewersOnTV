import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGameDay, inningsPlayed, parkName, ballparkStats } from '../ballparks-core.js'
import { game } from './helpers/rows.js'

const NAMES = { MIL06: [{ name: 'Miller Park', from: 2001, to: 2020 }, { name: 'American Family Field', from: 2021 }] }
const parks = new Map([['MIL05', { park: 'County Stadium', city: 'Milwaukee' }], ['MIL06', { park: 'Miller Park', city: 'Milwaukee' }], ['CHI10', { park: 'Wrigley Field', city: 'Chicago' }]])

test('a renamed park takes the name it had on the day', () => {
	assert.equal(parkName(parks, 'MIL06', 2011, NAMES), 'Miller Park')
	assert.equal(parkName(parks, 'MIL06', 2023, NAMES), 'American Family Field')
	assert.equal(parkName(parks, 'MIL05', 1982, NAMES), 'County Stadium')
	assert.equal(parkName(parks, 'XXX01', 1990, NAMES), 'XXX01')
})

test('innings come from the line score, an unplayed bottom of the ninth included', () => {
	const inns = (n, last = '') => [...Array(n - 1).fill('0'), last || '0', ...Array(28 - n).fill('')]
	assert.equal(inningsPlayed({ visitor: { inns: inns(25) }, home: { inns: inns(25) } }), 25)
	assert.equal(inningsPlayed({ visitor: { inns: inns(9) }, home: { inns: inns(9, 'x') } }), 9)
	assert.equal(inningsPlayed(undefined), null)
})

test('game-day columns: zero means not recorded, and a closed roof is marked', () => {
	const csv = 'gid,site,attendance,timeofgame,temp,daynight,sky\nA,MIL06,40000,181,0,night,dome\nB,MIL05,,0,55,day,sunny'
	const d = parseGameDay(csv)
	assert.deepEqual(d.get('A'), { site: 'MIL06', attendance: 40000, minutes: 181, temp: null, daynight: 'night', roofClosed: true })
	assert.equal(d.get('B').attendance, null)
	assert.equal(d.get('B').minutes, null)
	assert.equal(d.get('B').temp, 55)
})

// Three home games across two parks and a road game, with a rain-shortened
// game, a roof-closed game and an extra-inning one.
const rows = [
	{ ...game({ date: '1982-10-17', result: 'WIN', pf: 6, pa: 4, location: 'home' }), gid: 'cs1' },
	{ ...game({ date: '1983-09-09', result: 'LOSS', pf: 1, pa: 2, location: 'home' }), gid: 'cs2' },
	{ ...game({ date: '2023-04-10', result: 'WIN', pf: 3, pa: 2, location: 'home' }), gid: 'af1' },
	{ ...game({ date: '1984-05-08', result: 'LOSS', pf: 6, pa: 7, location: 'away' }), gid: 'rd1' },
	{ ...game({ date: '1985-04-12', result: 'WIN', pf: 2, pa: 0, location: 'away' }), gid: 'rain' },
]
const gd = new Map([
	['cs1', { site: 'MIL05', attendance: 56562, minutes: 170, temp: 50, daynight: 'night', roofClosed: false }],
	['cs2', { site: 'MIL05', attendance: 2137, minutes: 150, temp: 70, daynight: 'night', roofClosed: false }],
	['af1', { site: 'MIL06', attendance: 40000, minutes: 160, temp: 20, daynight: 'day', roofClosed: true }],
	['rd1', { site: 'CHI10', attendance: 14000, minutes: 486, temp: 60, daynight: 'night', roofClosed: false }],
	['rain', { site: 'CHI10', attendance: 9000, minutes: 70, temp: 45, daynight: 'day', roofClosed: false }],
])
const nine = { visitor: { inns: [...Array(9).fill('0'), ...Array(19).fill('')] }, home: { inns: [...Array(9).fill('0'), ...Array(19).fill('')] } }
const lines = new Map([['cs1', nine], ['cs2', nine], ['af1', nine],
	['rd1', { visitor: { inns: [...Array(25).fill('0'), '', '', ''] }, home: { inns: [...Array(25).fill('0'), '', '', ''] } }],
	['rain', { visitor: { inns: [...Array(5).fill('0'), ...Array(23).fill('')] }, home: { inns: [...Array(5).fill('0'), ...Array(23).fill('')] } }],
])
const S = ballparkStats(rows, gd, lines, parks, { names: NAMES })

test('each home park has its own record, years and crowds', () => {
	assert.deepEqual(S.parks.map((p) => [p.name, p.record, p.first, p.last, p.games]),
		[['County Stadium', '1–1', 1982, 1983, 2], ['American Family Field', '1–0', 2023, 2023, 1]])
	assert.deepEqual(S.parks[1].formerly, [{ name: 'Miller Park', from: 2001, to: 2020 }])
	assert.equal(S.parks[0].biggestCrowd.gid, 'cs1')
	assert.equal(S.parks[0].averageAttendance, Math.round((56562 + 2137) / 2))
})

test("each park's own game-day records come from its home games only", () => {
	const [cs, af] = S.parks
	assert.equal(cs.smallestCrowd.gid, 'cs2')
	assert.equal(cs.hottest.gid, 'cs2')
	assert.equal(cs.coldest.gid, 'cs1')
	assert.equal(cs.longestTime.gid, 'cs1')
	assert.equal(cs.shortestTime.gid, 'cs2')
	// The 25-inning road game is not County Stadium's; no extra innings at home.
	assert.equal(cs.mostInnings, null)
	// A closed roof leaves American Family Field with no temperature records.
	assert.equal(af.hottest, null)
	assert.equal(af.coldest, null)
})

test('crowds are home games; time and innings boards take every game', () => {
	assert.deepEqual(S.biggestCrowds.map((g) => g.gid), ['cs1', 'af1', 'cs2'])
	assert.equal(S.longestTime[0].gid, 'rd1')
	assert.deepEqual(S.mostInnings.map((g) => [g.gid, g.innings]), [['rd1', 25]])
})

test('a rain-shortened game is not one of the shortest, and a closed roof has no temperature', () => {
	assert.ok(!S.shortestTime.some((g) => g.gid === 'rain'))
	assert.equal(S.shortestTime[0].gid, 'cs2')
	// af1 recorded 20 degrees outside a closed roof; it is not the coldest game.
	assert.ok(!S.coldest.some((g) => g.gid === 'af1'))
	assert.equal(S.coldest[0].gid, 'rain')
})
