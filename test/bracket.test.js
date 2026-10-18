import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bracketGames, bracketSeries, bracketLayout, seriesStatus, nextOpponentSeries, opponentTrackerHtml, bracketHtml, bracketRefreshMs } from '../bracket-core.js'

// /api/bracket on Oct 18, 2026: the Brewers have swept the NLCS, and Game 5
// of the ALCS, tied 2-2, is in the top of the 8th, with 6 and 7 scheduled.
const { games } = JSON.parse(readFileSync(new URL('./fixtures/bracket-2026-alcs5.json', import.meta.url)))
const series = bracketSeries(games)
const find = (round, abbr) => series.find((s) => s.round === round && s.teams.some((t) => t.abbr === abbr))

// A scoreboard event, as little of one as bracketGames reads.
const event = ({ id = '1', type = 3, note, status = 'STATUS_FINAL', state = 'post', completed = true, away = ['10', 'PHI', 'Phillies', 3], home = ['15', 'ATL', 'Braves', 5] }) => ({
	id, date: '2026-09-29T18:08Z', season: { type },
	competitions: [{
		notes: note ? [{ headline: note }] : [],
		status: { type: { name: status, state, completed, shortDetail: state === 'in' ? 'Bot 7th' : 'Final' } },
		competitors: [
			{ id: home[0], homeAway: 'home', score: String(home[3]), winner: completed && home[3] > away[3], team: { abbreviation: home[1], shortDisplayName: home[2] } },
			{ id: away[0], homeAway: 'away', score: String(away[3]), winner: completed && away[3] > home[3], team: { abbreviation: away[1], shortDisplayName: away[2] } },
		],
	}],
})

test('scoreboard events: postseason only, postponed games dropped, round and game read from the note', () => {
	const out = bracketGames([
		event({ id: '1', note: 'NLWC - Game 1' }),
		event({ id: '2', type: 2 }),
		event({ id: '3', note: 'ALCS - Game 4 Rain - Makeup on Oct 18', status: 'STATUS_POSTPONED', completed: false }),
		event({ id: '4', note: 'ALCS - Game 7 If Necessary', status: 'STATUS_SCHEDULED', state: 'pre', completed: false }),
		event({ id: '5', note: 'World Series - Game 1', status: 'STATUS_SCHEDULED', state: 'pre', completed: false }),
	])
	assert.deepEqual(out.map((g) => [g.id, g.code, g.league, g.n, g.ifNecessary]), [
		['1', 'F', 'NL', 1, false],
		['4', 'L', 'AL', 7, true],
		['5', 'W', '', 1, false],
	])
	assert.deepEqual(out[0].teams.map((t) => [t.abbr, t.home, t.score, t.winner]), [['ATL', true, 5, true], ['PHI', false, 3, false]])
})

test('every series of the 2026 postseason, with wins from final games only', () => {
	assert.equal(series.length, 10)
	assert.deepEqual(series.map((s) => `${s.round} ${s.teams.map((t) => `${t.abbr} ${t.wins}`).join('-')}`), [
		'NLWC ATL 2-PHI 1', 'ALWC HOU 0-CHW 2', 'ALWC NYY 2-BOS 0', 'NLWC SD 2-CHC 0',
		'ALDS CLE 3-CHW 2', 'NLDS LAD 3-ATL 1', 'ALDS TB 3-NYY 0', 'NLDS MIL 3-SD 1',
		'NLCS MIL 4-LAD 0', 'ALCS TB 2-CLE 2',
	])
	const alcs = find('ALCS', 'TB')
	assert.equal(alcs.winner, null)
	assert.equal(alcs.live.n, 5)
	assert.equal(alcs.next.n, 5, 'the live game is the next one')
	assert.equal(find('NLCS', 'MIL').winner, find('NLCS', 'MIL').teams[0].id)
	assert.equal(find('NLCS', 'MIL').next, null)
})

test('the higher seed, home in game 1, is listed first', () => {
	assert.deepEqual(find('ALWC', 'HOU').teams.map((t) => t.abbr), ['HOU', 'CHW'])
	assert.deepEqual(find('NLDS', 'MIL').teams.map((t) => t.abbr), ['MIL', 'SD'])
})

test('each wild card sits beside the division series its winner went to', () => {
	const lay = bracketLayout(series)
	const rows = (lg) => lay[lg].rows.map((r) => `${r.wc?.teams.map((t) => t.abbr).join('/') ?? 'bye'} > ${r.ds?.teams.map((t) => t.abbr).join('/') ?? '?'}`)
	assert.deepEqual(rows('AL'), ['HOU/CHW > CLE/CHW', 'NYY/BOS > TB/NYY'])
	assert.deepEqual(rows('NL'), ['ATL/PHI > LAD/ATL', 'SD/CHC > MIL/SD'])
	assert.equal(lay.AL.cs.round, 'ALCS')
	assert.equal(lay.ws, null)
})

test('before the division series, a wild card has a row of its own', () => {
	const early = bracketSeries(games.filter((g) => g.code === 'F'))
	const lay = bracketLayout(early)
	assert.equal(lay.NL.rows.length, 2)
	assert.ok(lay.NL.rows.every((r) => r.wc && r.ds === null))
	assert.equal(lay.NL.cs, null)
})

test('series status reads like a broadcast', () => {
	assert.equal(seriesStatus(find('ALCS', 'TB')), 'Series tied 2-2')
	assert.equal(seriesStatus(find('NLCS', 'MIL')), 'Brewers won 4-0')
	const chw = { ...find('ALWC', 'CHW'), winner: null, teams: [{ name: 'Astros', wins: 0 }, { name: 'White Sox', wins: 1 }] }
	assert.equal(seriesStatus(chw), 'White Sox lead 1-0')
})

test('the next opponent: the other LCS once the Brewers have won theirs', () => {
	assert.equal(nextOpponentSeries(series, 'MIL').round, 'ALCS')
	// Mid-NLDS, it is the other NLDS; out of it, nothing.
	const nlds = bracketSeries(games.filter((g) => g.code === 'F' || (g.code === 'D' && g.n <= 2)))
	assert.deepEqual(nextOpponentSeries(nlds, 'MIL').teams.map((t) => t.abbr), ['LAD', 'ATL'])
	assert.equal(nextOpponentSeries(series, 'SD'), null)
	assert.equal(nextOpponentSeries(series, 'PHI'), null)
})

test('the tracker: who the Brewers could face, the live score, and the wins', () => {
	const html = opponentTrackerHtml(series, 'MIL', { now: new Date('2026-10-18T23:00:00Z') })
	assert.match(html, /World Series opponent: winner of the ALCS/)
	assert.match(html, /Series tied 2-2/)
	// Away first: Game 5 was in Cleveland.
	assert.match(html, /Game 5 · <span class="live-indicator-small"><\/span>Live · TB 3, CLE 1 · Top 8th/)
	assert.match(html, /<a class="po-espn" href="https:\/\/www\.espn\.com\/mlb\/game\/_\/gameId\/401930515" target="_blank" rel="noopener">ESPN<\/a>/)
	assert.equal((html.match(/po-pip on other/g) || []).length, 4)
	assert.equal(opponentTrackerHtml(series, 'LAD'), null)
})

test('between games, the tracker says when the next one is', () => {
	const after5 = games.map((g) => (g.n === 5 && g.code === 'L' ? { ...g, state: 'post', final: true, teams: g.teams.map((t) => ({ ...t, winner: t.abbr === 'TB' })) } : g))
	// "Today" is the viewer's own calendar day: Game 6 at 8 PM EDT is
	// tomorrow in UTC. Its start instant is the same day everywhere.
	const game6 = games.find((g) => g.code === 'L' && g.n === 6)
	const html = opponentTrackerHtml(bracketSeries(after5), 'MIL', { now: new Date(game6.date) })
	assert.match(html, /Rays lead 3-2/)
	assert.match(html, /Game 6 · Today/)
	assert.doesNotMatch(html, /po-espn/, 'only a live game is linked')
})

test('the bracket: both leagues, the live series marked, the open World Series slot', () => {
	const html = bracketHtml(series, 'MIL')
	assert.equal((html.match(/class="bk-league"/g) || []).length, 2)
	assert.equal((html.match(/bk-s bk-on/g) || []).length, 1)
	assert.match(html, /<div class="bk-t"><span class="bk-abbr">TBD<\/span><\/div><div class="bk-t bk-us" title="Brewers"><span class="bk-abbr">MIL<\/span>/)
	assert.equal(bracketHtml([], 'MIL'), null)
})

test('refresh: a minute while a game is on, until the next start otherwise', () => {
	const MIN = 60 * 1000
	assert.equal(bracketRefreshMs(series), MIN)
	const quiet = bracketSeries(games.filter((g) => g.state !== 'in'))
	const start = Date.parse(quiet.find((s) => s.next).next.date)
	assert.equal(bracketRefreshMs(quiet, start - 30 * MIN), 29 * MIN)
	assert.equal(bracketRefreshMs(quiet, start - 5 * 60 * MIN), 60 * MIN)
	assert.equal(bracketRefreshMs(quiet, start + 10 * MIN), 5 * MIN, 'past its start and not begun')
	assert.equal(bracketRefreshMs(bracketSeries(games.filter((g) => g.final))), 60 * MIN)
})
