import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnTarget } from '../lib/espn-target.js'

const BASE = 'https://site.api.espn.com/'

test('every request the site makes is still proxied', () => {
	const cases = [
		['apis/site/v2/sports/baseball/mlb/teams/mil/schedule', ''],
		['apis/site/v2/sports/baseball/mlb/teams/mil/schedule', '?seasontype=3'],
		['apis/site/v2/sports/baseball/mlb/teams/mil/schedule', '?seasontype=2&season=2011'],
		['apis/site/v2/sports/baseball/mlb/scoreboard', ''],
		['apis/site/v2/sports/baseball/mlb/summary', '?event=401908030'],
		['apis/v2/sports/baseball/mlb/standings', '?group=8'],
	]
	for (const [path, search] of cases) {
		assert.ok(espnTarget(path, search)?.startsWith(BASE + path), `${path}${search}`)
	}
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/summary', '?event=401908030'),
		`${BASE}apis/site/v2/sports/baseball/mlb/summary?event=401908030`)
})

test('anything else is refused', () => {
	assert.equal(espnTarget('apis/site/v2/sports/football/nfl/scoreboard'), null)
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/../../../../x'), null)
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/scoreboard', '?dates=20261011'), null)
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/summary', '?event=1&event2=x'), null)
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/summary', '?event=abc'), null)
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/summary', '?event=1%26x%3D2'), null)
})

// The allowlist only works if it lists everything the pages call. Read every
// /api/espn/ URL out of the client source and ask whether its path is allowed,
// so a new endpoint fails here instead of 404ing in production.
test('every /api/espn/ path in the client source is on the list', () => {
	const files = ['main.js', 'history.js', 'game.js', 'vs.js', 'records.js', 'managers.js']
	const paths = new Set()
	for (const f of files) {
		let src = ''
		try { src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8') } catch { continue }
		for (const m of src.matchAll(/\/api\/espn\/(apis\/[\w/.-]+)/g)) paths.add(m[1])
	}
	assert.ok(paths.size >= 4)
	for (const p of paths) assert.notEqual(espnTarget(p), null, p)
})
