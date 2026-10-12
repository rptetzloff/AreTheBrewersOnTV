import test from 'node:test'
import assert from 'node:assert/strict'
import {
	espnPostseasonGames, postseasonPanelHtml, currentPostseasonStatus, seriesCountdown,
	standingsRows, raceNumbers, racePanelHtml, RACE_WINDOW_GAMES,
} from '../playoff-core.js'
import { postseasonSeries } from '../records-core.js'

// ---------------------------------------------------------------- postseason

/** One ESPN schedule event, in the shape seasontype=3 returns. */
const ev = (headline, date, { opp = 'LAD', oppName = 'Dodgers', won = null, state = won === null ? 'pre' : 'post', detail = '', tv = ['Fox'] } = {}) => ({
	date,
	competitions: [{
		notes: [{ headline }],
		status: { type: { name: won === null ? (state === 'in' ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED') : 'STATUS_FINAL', state, detail } },
		competitors: [
			{ team: { abbreviation: 'MIL', shortDisplayName: 'Brewers' }, winner: won === true },
			{ team: { abbreviation: opp, shortDisplayName: oppName }, winner: won === false },
		],
		broadcasts: [...tv.map((n) => ({ type: { shortName: 'TV' }, media: { shortName: n } })), { type: { shortName: 'Radio' }, media: { shortName: 'ERADM' } }],
	}],
})

const nlds = [true, true, false, true].map((won, i) =>
	ev(`NLDS - Game ${i + 1}`, `2026-10-0${4 + i}T00:00Z`, { opp: 'SD', oppName: 'Padres', won }))
const nlcs = (results, live = false) => Array.from({ length: 7 }, (_, i) => {
	const won = results[i] ?? null
	const isLive = live && i === results.length
	return ev(`NLCS - Game ${i + 1}${i >= 4 ? ' If Necessary' : ''}`, `2026-10-${12 + i}T00:00Z`,
		{ won, state: isLive ? 'in' : undefined, detail: isLive ? 'Top 9th' : '' })
})
const NOW = new Date('2026-10-11T20:00Z')
const panel = (events) => postseasonPanelHtml(espnPostseasonGames(events), { now: NOW })

test('ESPN events become games: round, game number, result, TV without radio', () => {
	const [g] = espnPostseasonGames([ev('NLCS - Game 5 If Necessary', '2026-10-16T00:00Z', { tv: ['FS1'] })])
	assert.equal(g.round, 'NLCS')
	assert.equal(g.game, 'Game 5')
	assert.equal(g.ifNecessary, true)
	assert.equal(g.result, null)
	assert.deepEqual(g.networks, ['FS1'])
})

test('the night of NLCS Game 1: tied, four wins away, Game 1 live, the NLDS underneath', () => {
	const html = panel([...nlds, ...nlcs([], true)])
	assert.match(html, /NLCS<\/span> vs Dodgers <span class="po-best">Best of 7/)
	assert.match(html, /4 wins from the World Series/)
	assert.match(html, /Game 1 · <span class="live-indicator-small"><\/span>Live · Top 9th · Fox/)
	assert.match(html, /NLDS vs Padres: <strong>won 3-1<\/strong>/)
	assert.equal((html.match(/po-pip on/g) || []).length, 0)
})

test('mid-series: pips fill, the countdown shrinks, the next game is the first unplayed one', () => {
	const html = panel([...nlds, ...nlcs([true, false, true, true, false])])
	assert.equal((html.match(/po-pip on us/g) || []).length, 3)
	assert.equal((html.match(/po-pip on them/g) || []).length, 2)
	assert.match(html, /1 win from the World Series/)
	assert.match(html, /Game 6 \(if necessary\)/)
})

test('a won series with the next not yet scheduled says where it leads', () => {
	assert.match(panel(nlds), /Won the NLDS — on to the NLCS/)
	assert.doesNotMatch(panel(nlds), /po-next/)
})

test('a lost series ends the season, and says so', () => {
	assert.match(panel([...nlds, ...nlcs([false, false, true, false, false])]),
		/Season over — lost the NLCS to the Dodgers, 1-4/)
})

test('four World Series wins is a title', () => {
	const ws = [true, true, false, true, true].map((won, i) =>
		ev(`World Series - Game ${i + 1}`, `2026-10-2${i}T00:00Z`, { opp: 'NYY', oppName: 'Yankees', won }))
	assert.match(panel(ws), /World Series champions!/)
})

test('a wild card win leads to the league\'s division series', () => {
	const s = postseasonSeries([{ round: 'NL Wild Card Series', opponent: 'Cubs', result: 'WIN' }, { round: 'NL Wild Card Series', opponent: 'Cubs', result: 'WIN' }])
	assert.equal(seriesCountdown(s[0]), 'Won the NL Wild Card Series — on to the NLDS')
})

test('no postseason games means no panel and no history status', () => {
	assert.equal(panel([]), null)
	assert.equal(currentPostseasonStatus([]), null)
})

test('the history page gets the current series in words and its round code', () => {
	assert.deepEqual(currentPostseasonStatus(espnPostseasonGames([...nlds, ...nlcs([])])),
		{ code: 'L', text: 'NLCS vs Dodgers: tied 0-0' })
})

// ---------------------------------------------------------------------- race

/** A standings payload in ESPN's shape: divisions of [abbr, w, l, seed]. */
const standings = (divs) => ({
	children: Object.entries(divs).map(([name, teams]) => ({
		name,
		standings: {
			entries: teams.map(([abbr, w, l, seed]) => ({
				team: { abbreviation: abbr, shortDisplayName: abbr },
				stats: [{ name: 'wins', value: w }, { name: 'losses', value: l }, { name: 'playoffSeed', value: seed }],
			})),
		},
	})),
})

// With 22 games left: Brewers lead the Central by five over the Cubs.
const leading = standingsRows(standings({
	'National League Central': [['MIL', 85, 55, 1], ['CHC', 80, 60, 5], ['STL', 70, 70, 9]],
	'National League East': [['PHI', 83, 57, 2], ['ATL', 79, 61, 6], ['NYM', 74, 66, 7]],
	'National League West': [['LAD', 82, 58, 3], ['SD', 81, 59, 4], ['ARI', 75, 65, 8]],
}))

test('a division leader\'s magic numbers come from the formula, against the right rivals', () => {
	const n = raceNumbers(leading)
	assert.equal(n.gamesLeft, 22)
	assert.equal(n.leadsDivision, true)
	assert.equal(n.divisionMagic, 163 - 85 - 60) // the Cubs have the fewest losses in the division
	assert.equal(n.spotMagic, 163 - 85 - 65)     // the Diamondbacks are the best team out (NYM 66)
})

test('a team chasing gets games back and elimination numbers instead', () => {
	const rows = standingsRows(standings({
		'National League Central': [['CHC', 85, 55, 1], ['MIL', 76, 64, 7], ['STL', 70, 70, 9]],
		'National League East': [['PHI', 83, 57, 2], ['ATL', 79, 61, 5], ['NYM', 78, 62, 6]],
		'National League West': [['LAD', 82, 58, 3], ['SD', 81, 59, 4], ['ARI', 75, 65, 8]],
	}))
	const n = raceNumbers(rows)
	assert.equal(n.divisionBehind, 9)
	assert.equal(n.divisionElim, 163 - 85 - 64)
	assert.equal(n.spotBehind, 2)                 // behind the Mets, the sixth seed
	assert.equal(n.spotElim, 163 - 78 - 64)
	const html = racePanelHtml(n)
	assert.match(html, /9 back in the NL Central · elimination number <strong>14<\/strong>/)
	assert.match(html, /2 out of the last wild card · elimination number <strong>21<\/strong>/)
	assert.doesNotMatch(html, /seed/)
})

test('half games are written as halves', () => {
	const rows = standingsRows(standings({
		'National League Central': [['CHC', 85, 55, 1], ['MIL', 84, 57, 2]],
	}))
	assert.match(racePanelHtml(raceNumbers(rows, { spots: 1 })), /1½ back/)
})

test('the race panel waits for the last stretch', () => {
	const early = standingsRows(standings({ 'National League Central': [['MIL', 60, 40, 1], ['CHC', 55, 45, 2]] }))
	assert.equal(raceNumbers(early).gamesLeft > RACE_WINDOW_GAMES, true)
	assert.equal(racePanelHtml(raceNumbers(early)), null)
	assert.match(racePanelHtml(raceNumbers(leading)), /Magic number to win the NL Central: <strong>18<\/strong>/)
	assert.match(racePanelHtml(raceNumbers(leading)), /Currently the #1 seed · 22 games left/)
})

test('clinched reads as clinched, and eliminated from everything hides the panel', () => {
	const clinched = standingsRows(standings({
		'National League Central': [['MIL', 100, 52, 1], ['CHC', 85, 67, 5]],
		'National League West': [['ARI', 80, 72, 8]],
	}))
	const html = racePanelHtml(raceNumbers(clinched))
	assert.match(html, /Clinched the NL Central/)
	assert.match(html, /Clinched a playoff spot/)
	const out = standingsRows(standings({
		'National League Central': [['CHC', 100, 52, 1], ['MIL', 70, 82, 9]],
		'National League East': [['PHI', 95, 57, 6]],
	}))
	assert.equal(racePanelHtml(raceNumbers(out)), null)
})
