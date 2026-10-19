import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { worldSeriesTitle, titleBannerHtml, withTitleBanner } from '../playoff-core.js'
import { buildCsvs } from '../lib/espn-current.js'
import { parseGameinfoCsv, computeSeasonHistory } from '../records-core.js'
import { parseTeamstatsMgr, parseBiofile, parseManagersCsv, computeCoachesFromData } from '../coaches-core.js'

// A 2026 World Series against the Rays, in ESPN's schedule shape, as far as
// `results` goes: W or L per game, then any game still to come. Dates and
// home/away follow the real schedule (2-3-2, Brewers home first).
const DATES = ['2026-10-24T00:00Z', '2026-10-25T00:00Z', '2026-10-27T00:00Z', '2026-10-28T00:00Z', '2026-10-29T00:00Z', '2026-10-31T00:00Z', '2026-11-01T00:00Z']
const MIL_HOME = [true, true, false, false, false, true, true]
function series(results, { shape = 'schedule' } = {}) {
	return DATES.map((date, i) => {
		const r = results[i]
		const final = r === 'W' || r === 'L'
		const score = (n) => (!final ? undefined : shape === 'schedule' ? { value: n, displayValue: String(n) } : String(n))
		const mil = { homeAway: MIL_HOME[i] ? 'home' : 'away', score: score(r === 'W' ? 5 : 2), team: { abbreviation: 'MIL', displayName: 'Milwaukee Brewers' } }
		const tb = { homeAway: MIL_HOME[i] ? 'away' : 'home', score: score(r === 'W' ? 2 : 5), team: { abbreviation: 'TB', displayName: 'Tampa Bay Rays' } }
		return {
			id: String(401908042 + i), date, _t: 'post',
			competitions: [{
				notes: [{ headline: `World Series - Game ${i + 1}${i >= 4 ? ' If Necessary' : ''}` }],
				status: { type: { name: final ? 'STATUS_FINAL' : r === 'live' ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED' } },
				competitors: MIL_HOME[i] ? [mil, tb] : [tb, mil],
			}],
		}
	})
}

test('a title takes four Series wins, however the games went', () => {
	assert.equal(worldSeriesTitle(series('WWW')), null)
	assert.equal(worldSeriesTitle(series('WWWL')), null)
	assert.equal(worldSeriesTitle(series(['W', 'W', 'W', 'live'])), null, 'a game in progress is not a win')
	assert.equal(worldSeriesTitle(series('WWWW')), 'World Series')
	assert.equal(worldSeriesTitle(series('LLLWWWW')), 'World Series')
	assert.equal(worldSeriesTitle(series('LLLL')), null)
})

test('the scoreboard\'s scores read the same as the schedule\'s', () => {
	assert.equal(worldSeriesTitle(series('WLWWW', { shape: 'scoreboard' })), 'World Series')
	assert.equal(worldSeriesTitle(series('WLWW', { shape: 'scoreboard' })), null)
})

test('only Series games count: a 4-0 NLCS is not a title', () => {
	const nlcs = series('WWWW').map((e) => ({ ...e, competitions: [{ ...e.competitions[0], notes: [{ headline: 'NLCS - Game 1' }] }] }))
	assert.equal(worldSeriesTitle(nlcs), null)
})

// The history page, the history card and the managers page all count
// titles from the season's game rows. The season being played gets its rows
// from ESPN (lib/espn-current.js); a title has to survive that trip.
const header = readFileSync(new URL('../data/gameinfo.csv', import.meta.url), 'utf8').split('\n', 1)[0]
const teamstatsHeader = readFileSync(new URL('../data/teamstats.csv', import.meta.url), 'utf8').split('\n', 1)[0]
const names = readFileSync(new URL('../data/CurrentNames.csv', import.meta.url), 'utf8')
const rowsOf = (events) => parseGameinfoCsv(`${header}\n${buildCsvs(events, 2026).gameinfo}`, names)
const season2026 = (events, now) => computeSeasonHistory(rowsOf(events), { now }).find((s) => s.season === 2026)
const OCT_31 = new Date('2026-10-31T12:00:00Z')

test('a Series won in ESPN\'s games is a championship season in the history', () => {
	assert.equal(rowsOf(series('WWWW')).filter((r) => r.championship).length, 4, 'each Series game carries the championship column')
	assert.equal(season2026(series('WWW'), OCT_31).champion, false)
	const won = season2026(series('WWWW'), OCT_31)
	assert.equal(won.champion, true)
	assert.equal(won.championship, true)
	assert.equal(won.postseason, 'W')
})

test('the managers count the title for the manager of the final game', () => {
	const events = series('WWLWW')
	const csvs = buildCsvs(events, 2026)
	const rows = rowsOf(events)
	const gidToMgr = parseTeamstatsMgr(`${teamstatsHeader}\n${csvs.teamstats}`)
	const mgrNames = parseBiofile(readFileSync(new URL('../data/biofile0.csv', import.meta.url), 'utf8'))
	const tenures = parseManagersCsv(readFileSync(new URL('../data/managers.csv', import.meta.url), 'utf8'))
	const { coaches } = computeCoachesFromData(rows, gidToMgr, mgrNames, [2026], tenures)
	const titled = coaches.filter((c) => c.titles > 0)
	assert.equal(titled.length, 1)
	assert.match(titled[0].name, /Murphy/)
})

test('the banner: a title season\'s, linking to it, and nothing otherwise', () => {
	const html = titleBannerHtml({ kind: 'champions', season: 2026, worldSeriesName: 'World Series' })
	assert.equal(html, '<a class="title-banner" href="/2026"><span aria-hidden="true">🏆</span> 2026 World Series Champions <span aria-hidden="true">🏆</span></a>')
	// A Retrosheet season's state names the title "World Series 2026"; the
	// banner does not repeat the year.
	assert.match(titleBannerHtml({ kind: 'champions', season: 2026, worldSeriesName: 'World Series 2026' }), /> 2026 World Series Champions </)
	for (const kind of ['tv-yes', 'tv-no', 'no-game', 'offseason', 'record']) assert.equal(titleBannerHtml({ kind, season: 2026 }), '')
	assert.equal(titleBannerHtml(null), '')
})

test('the banner goes first in the body, and a page without one is untouched', () => {
	const page = '<html><head></head><body>\n<main>x</main></body></html>'
	assert.equal(withTitleBanner(page, '<a>B</a>'), '<html><head></head><body>\n<a>B</a>\n<main>x</main></body></html>')
	assert.equal(withTitleBanner(page, ''), page)
	assert.equal(withTitleBanner('<body class="x">', '<a>B</a>'), '<body class="x">\n<a>B</a>')
	assert.equal(withTitleBanner('<p>no body</p>', '<a>B</a>'), '<p>no body</p>')
})

test('placing the banner stays fast on a page of unclosed body tags', () => {
	const hostile = '<body='.repeat(200000)
	const t = performance.now()
	assert.equal(withTitleBanner(hostile, '<a>B</a>'), hostile)
	assert.ok(performance.now() - t < 200, 'linear, not a scan from every "<body"')
})
