import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { liveDetail, liveDetailHtml, pitchCall, pitchResult, probableStarters, probablesHtml, pitchZoneSvg } from '../live-core.js'

// Two moments of Brewers at Dodgers, NLCS, October 15 2026, trimmed to the
// fields live-core reads. Bottom 2nd: Dustin May has just relieved Shane
// Drohan; Max Muncy, sent up to hit for Rojas with the at-bat under way, is
// at 1-1 with runners on first and third. Three minutes later Andy Pages
// has singled on the first pitch and the at-bat is closed.
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const mid = liveDetail(fixture('live-midatbat.json'))
const over = liveDetail(fixture('live-atbatover.json'))

test('the score, inning and base-out state', () => {
	assert.equal(mid.state, 'in')
	assert.equal(mid.detail, 'Bottom 2nd')
	assert.deepEqual(mid.teams.map((t) => [t.abbr, t.homeAway]), [['LAD', 'home'], ['MIL', 'away']])
	assert.deepEqual(mid.situation, { balls: 1, strikes: 1, outs: 0, onFirst: true, onSecond: false, onThird: true })
})

test("each team's pitcher: the one on the mound, and the other side's last", () => {
	const mound = mid.pitchers.find((p) => p.onMound)
	assert.equal(mound.name, 'Dustin May')
	assert.equal(mound.team, 'MIL')
	assert.equal(typeof mound.pitches, 'number')
	const other = mid.pitchers.find((p) => !p.onMound)
	assert.equal(other.name, 'Tyler Glasnow')
	assert.equal(other.ip, '2.0')
	assert.equal(other.pitches, 27)
})

test('the batter, his day, and his record against this pitcher', () => {
	assert.equal(mid.batter.name, 'Max Muncy')
	assert.equal(mid.batter.team, 'LAD')
	assert.match(mid.batter.vsPitcher, /^Muncy career vs\. May/)
})

test('a pinch-hitter sent up mid at-bat does not end it', () => {
	assert.equal(mid.atBatOver, false)
	assert.deepEqual(mid.pitches.map((p) => [p.n, p.call]), [[1, 'ball'], [2, 'foul']])
	assert.ok(mid.pitches.every((p) => p.type && p.mph > 80 && p.x !== null && p.y !== null))
})

test('a closed at-bat keeps its pitches and drops the count', () => {
	assert.equal(over.batter.name, 'Andy Pages')
	assert.equal(over.atBatOver, true)
	assert.deepEqual(over.pitches.map((p) => [p.call, p.result]), [['inplay', 'Single']])
	assert.equal(over.situation.balls, null)
	assert.equal(over.situation.strikes, null)
	assert.equal(over.situation.outs, 1)
})

test('the play log: newest first, results and changes, no pitches or markers', () => {
	assert.equal(mid.log.length, 2)
	assert.deepEqual(mid.log.map((l) => l.inning), ['Bot 2nd', 'Bot 2nd'])
	assert.equal(mid.log[0].text, 'Muncy hit for Rojas')
	assert.ok(!mid.log.some((l) => /^Pitch \d/.test(l.text)))
	assert.match(over.log[0].text, /^Pages singled/)
})

test('pitch calls and results from ESPN play rows', () => {
	const p = (type, text) => ({ type: { text: type }, text })
	assert.equal(pitchCall(p('Ball', 'Pitch 1 : Ball 1')), 'ball')
	assert.equal(pitchCall(p('Foul Ball', 'Pitch 3 : Strike 2 Foul')), 'foul')
	assert.equal(pitchCall(p('Strike Looking - Overturned', 'Pitch 4 : Strike 3 Looking')), 'strike')
	assert.equal(pitchCall(p('Home Run', 'Pitch 1 : Ball In Play')), 'inplay')
	assert.equal(pitchCall(p('Hit By Pitch', 'Pitch 1 : Ball In Play')), 'hbp')
	assert.equal(pitchResult(p('Strike Swinging', 'Pitch 2 : Strike 2 Swinging')), 'Swinging strike')
	assert.equal(pitchResult(p('Strike Looking - Overturned', 'Pitch 4 : Strike 3 Looking')), 'Called strike')
	assert.equal(pitchResult(p('Fly Out', 'Pitch 4 : Ball In Play')), 'Fly Out')
})

test('not a game: no detail; a finished game: no card block', () => {
	assert.equal(liveDetail(null), null)
	assert.equal(liveDetailHtml({ ...mid, state: 'post' }), '')
})

test('the card block escapes ESPN text and draws a dot per located pitch', () => {
	const html = liveDetailHtml({ ...mid, log: [{ inning: 'Bot 2nd', text: '<b>x</b>', scoring: false }] })
	assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/)
	assert.equal((pitchZoneSvg(mid.pitches).match(/<circle/g) || []).length, 2)
})

test('probable starters: away first, a record when the scoreboard gives one, none while unannounced', () => {
	const event = (comps) => ({ competitions: [{ competitors: comps }] })
	const sp = (name, record) => ({ name: 'probableStartingPitcher', athlete: { displayName: name, shortName: name.replace(/^(\w)\w* /, '$1. ') }, ...(record ? { record } : {}) })
	const got = probableStarters(event([
		{ homeAway: 'home', team: { abbreviation: 'LAD' }, probables: [sp('Tyler Glasnow', '(0-0, 1.93)')] },
		{ homeAway: 'away', team: { abbreviation: 'MIL' }, probables: [sp('Shane Drohan')] },
	]))
	assert.deepEqual(got.map((s) => [s.team, s.short, s.record]), [['MIL', 'S. Drohan', null], ['LAD', 'T. Glasnow', '0-0, 1.93']])
	assert.deepEqual(probableStarters(event([{ homeAway: 'home', team: { abbreviation: 'MIL' } }])), [])
	assert.equal(probablesHtml([]), '')
})
