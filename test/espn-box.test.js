import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnBoxscore } from '../espn-box-core.js'

// Brewers 6, Dodgers 2, NLCS at Dodger Stadium, October 14 2026, from ESPN's
// summary trimmed to the fields the box score reads; and the next night's
// game in the bottom of the 2nd.
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const box = espnBoxscore(fixture('espn-final.json'))
const live = espnBoxscore(fixture('live-midatbat.json'))

test('game: teams, score, local date, park, crowd, decisions, umpires', () => {
	const g = box.game
	assert.deepEqual([g.visteam, g.hometeam, g.visScore, g.homeScore, g.brewAbbr, g.brewIsHome], ['MIL', 'LAD', 6, 2, 'MIL', false])
	// ESPN's UTC timestamp is already the 15th; the game was the evening of the 14th.
	assert.equal(g.date, '2026-10-14')
	assert.equal(g.parkName, 'Dodger Stadium')
	assert.equal(g.attendance, 50708)
	assert.deepEqual([g.wp, g.lp, g.save], ['DL Hall', 'Blake Snell', 'Trevor Megill'])
	assert.deepEqual(g.umpires.map((u) => u.pos), ['HP', '1B', '2B', '3B', 'LF', 'RF'])
	assert.equal(box.final, true)
})

test('line score with hits and errors summed', () => {
	assert.deepEqual(box.linescore.visitor.inns, ['1', '0', '0', '0', '0', '0', '3', '1', '1'])
	assert.deepEqual([box.linescore.visitor.r, box.linescore.visitor.h, box.linescore.visitor.e], [6, 9, 0])
	assert.deepEqual([box.linescore.home.r, box.linescore.home.h, box.linescore.home.e], [2, 5, 0])
})

test('lineup in batting order, positions, substitutes under the starter they replaced', () => {
	const mil = box.batting.MIL.players
	assert.deepEqual(mil.slice(0, 5).map((p) => [p.order, p.name, p.pos, p.isStarter]), [
		[1, 'Jackson Chourio', 'LF', true], [2, 'Brice Turang', '2B', true], [3, 'William Contreras', 'C', true],
		[4, 'Andrew Vaughn', 'DH', true], [4, 'Christian Yelich', 'DH', false],
	])
	assert.deepEqual(box.batting.MIL.totals, { ab: 35, r: 6, h: 9, rbi: 5, hr: 3, bb: 2, k: 12 })
})

test("ESPN's notes go through, its terse labels worded as the page words them", () => {
	const labels = box.batting.MIL.notes.map(([l]) => l)
	assert.ok(labels.includes('HR') && labels.includes('Team RISP') && labels.includes('SB'))
	assert.match(Object.fromEntries(box.batting.MIL.notes).HR, /^Bauers \(1, 7th inning off Snell/)
	assert.ok(box.pitching.LAD.notes.some(([l]) => l === 'First-pitch strikes/BF'))
	assert.deepEqual(box.fielding.LAD.notes, [['DP', '1 (Freeman)']])
	assert.deepEqual(box.fielding.MIL.notes, [])
})

test('pitching: lines, pitches-strikes, decisions, and batters faced counted from the plays', () => {
	const p = box.pitching.LAD.pitchers[0]
	assert.deepEqual([p.name, p.ip, p.ipouts, p.h, p.er, p.k, p.np, p.nps, p.isLp], ['Blake Snell', '6.0', 18, 4, 4, 9, 101, 63, true])
	// ESPN's own first-pitch-strike note gives each pitcher's batters faced:
	// "Snell 14/24; Phillips 2/3; Wrobleski 4/7; Sasaki 3/3".
	assert.deepEqual(box.pitching.LAD.pitchers.map((x) => [x.name.split(' ').pop(), x.bf]), [['Snell', 24], ['Phillips', 3], ['Sasaki', 3], ['Wrobleski', 7]])
	assert.equal(box.pitching.MIL.totals.bf, 37)
	assert.deepEqual(box.pitching.MIL.pitchers.filter((x) => x.isWp || x.isSave).map((x) => x.name), ['DL Hall', 'Trevor Megill'])
})

test('scoring summary: each run-scoring play once, the wild pitch included once', () => {
	assert.deepEqual(box.scoring.map((s) => [s.inning, s.top, s.team, s.visScore, s.homeScore]), [
		[1, true, 'MIL', 1, 0], [6, false, 'LAD', 1, 2], [7, true, 'MIL', 3, 2], [7, true, 'MIL', 4, 2], [8, true, 'MIL', 5, 2], [9, true, 'MIL', 6, 2],
	])
})

test('a game in progress: not final, its inning as status, extra innings not claimed', () => {
	assert.equal(live.final, false)
	assert.equal(live.status, 'Bottom 2nd')
	assert.equal(live.game.innings, null)
	assert.ok(live.batting.LAD.players.some((p) => p.name === 'Max Muncy' && p.pos === 'PH'))
})

test('nothing to build from: null', () => {
	assert.equal(espnBoxscore(null), null)
	assert.equal(espnBoxscore({ header: { competitions: [{ competitors: [] }] } }), null)
})
