import test from 'node:test'
import assert from 'node:assert/strict'
import { records } from '../lib/records.js'
import { bestPlayoffRuns, playoffRunsByEra, eraYears, pct3, recordsCopy, RECORD_SLUGS } from '../records-core.js'
import { buildRecordsSvg } from '../lib/cards.js'

// Best Playoff Runs, ported from are-they-sports (#123, #124): each finished
// postseason by winning percentage, then wins, then the earlier year, a
// playoff era at a time.

const series = (round, roundLabel, wins, losses, result) => ({ round, roundLabel, wins, losses, result })
const appearance = (season, ...s) => ({ season, series: s })

test('the Brewers\' postseasons, an era at a time, best first', () => {
	const groups = playoffRunsByEra(records.playoffAppearances)
	assert.deepEqual(groups.map((g) => `${g.era.label} · ${eraYears(g.era)}`), ['LCS era · 1969–1994', 'Wild-card era · 1995 on'],
		'no Brewers season falls in the World Series-only era, so it is left out')
	assert.deepEqual(groups[0].runs.map((r) => [r.season, r.record, r.reached]), [
		[1982, '6–6', 'Lost World Series'],
		[1981, '2–3', 'Lost Division Series'],
	])
	assert.deepEqual(groups[1].runs.slice(0, 3).map((r) => [r.season, r.record]), [[2018, '6–4'], [2011, '5–6'], [2025, '3–6']])
	assert.equal(groups[1].runs.length, 5, 'the best five of the era')
})

test('equal percentages go to more wins, then the earlier year', () => {
	const runs = bestPlayoffRuns([
		appearance(2024, series('F', 'Wild Card', 1, 2, 'Lost')),
		appearance(2025, series('D', 'Division Series', 3, 2, 'Won'), series('L', 'LCS', 0, 4, 'Lost')),
		appearance(2023, series('F', 'Wild Card', 1, 2, 'Lost')),
	])
	assert.deepEqual(runs.map((r) => r.season), [2025, 2023, 2024], '3-6 and 1-2 are both .333; three wins first, then 2023 before 2024')
})

test('a postseason counts once it is over, and a title says so', () => {
	const nlcsWon = appearance(2026,
		series('D', 'Division Series', 3, 1, 'Won'), series('L', 'LCS', 4, 0, 'Won'), series('W', 'World Series', 2, 0, 'Leads'))
	assert.deepEqual(bestPlayoffRuns([nlcsWon]), [], '9-1 with the World Series still being played is not a finished run')
	const champions = appearance(2026,
		series('D', 'Division Series', 3, 1, 'Won'), series('L', 'LCS', 4, 0, 'Won'), series('W', 'World Series', 4, 1, 'Won'))
	const [run] = bestPlayoffRuns([champions])
	assert.deepEqual([run.record, pct3(run.winPct), run.reached], ['11–2', '.846', 'Won the World Series'])
})

test('a perfect record reads 1.000, not .1000', () => {
	assert.equal(pct3(1), '1.000')
	assert.equal(pct3(0.5), '.500')
	assert.equal(pct3(0.0625), '.063')
})

test('the card has its own link preview and share picture', () => {
	assert.ok(RECORD_SLUGS.includes('best-playoff-runs'))
	assert.equal(RECORD_SLUGS.at(-1), 'best-playoff-runs', 'last, so the side-by-side pairs above it stay pairs')
	const copy = recordsCopy('best-playoff-runs', records)
	assert.equal(copy.title, 'Best Brewers Playoff Runs — 6–4 in 2018')
	assert.match(copy.desc, /Wild-card era \(1995 on\), 2018 at 6–4, Lost LCS; LCS era \(1969–1994\), 1982 at 6–6, Lost World Series\./)
	const svg = buildRecordsSvg('best-playoff-runs', records)
	assert.match(svg, /BEST PLAYOFF RUNS/)
	assert.doesNotMatch(svg, /ARE THE BREWERS/, 'its own picture, not the overview one')
	const none = recordsCopy('best-playoff-runs', { ...records, playoffAppearances: [] })
	assert.equal(none.desc, 'The Brewers have not yet reached the playoffs.')
})
