import test from 'node:test'
import assert from 'node:assert/strict'
import {
	BREWERS_IDS,
	nameForFranchiseAt,
	parseBallparksCsv,
	parseCurrentNamesCsv,
	parseGameinfoCsv,
} from '../records-core.js'
import { currentNamesCsv, gameinfoCsv } from './helpers/rows.js'

// The Retrosheet layer, which has no counterpart in the Packers repo: that
// site's CSV already arrives in the shape the compute functions want, and this
// one has to build it. This file is the seam between a sport's raw data and
// the shared logic above it, so it is the part most worth pinning before any
// of that logic moves into a common core.

const names = currentNamesCsv([
	{ franchiseName: 'MIL', teamName: 'MIL', city: 'Milwaukee', team: 'Brewers', startDate: '4/7/1970', endDate: '' },
	{ franchiseName: 'MIL', teamName: 'SE1', city: 'Seattle', team: 'Pilots', startDate: '4/8/1969', endDate: '10/2/1969' },
	{ franchiseName: 'CHN', teamName: 'CHN', city: 'Chicago', team: 'Cubs', startDate: '5/4/1876', endDate: '' },
	{ franchiseName: 'TBA', teamName: 'TBA', city: 'Tampa Bay', team: 'Devil Rays', startDate: '3/31/1998', endDate: '9/30/2007' },
	{ franchiseName: 'TBA', teamName: 'TBA', city: 'Tampa Bay', team: 'Rays', startDate: '3/31/2008', endDate: '' },
])

const one = (overrides = {}) => ({
	gid: 'MIL202007240', visteam: 'CHN', hometeam: 'MIL', date: '20200724',
	gametype: 'regular', vruns: '2', hruns: '4', wteam: 'MIL', lteam: 'CHN',
	season: '2020', ...overrides,
})

const parse = (games, opts = {}) =>
	parseGameinfoCsv(gameinfoCsv(games), names, opts.teamstats ?? null)

test('the Brewers are both franchises they have ever been', () => {
	// The 1969 Seattle Pilots became the Brewers. A row under SE1 is a Brewers
	// game and dropping it would lose the franchise's first season.
	assert.ok(BREWERS_IDS.has('MIL'))
	assert.ok(BREWERS_IDS.has('SE1'))
})

test('only games the Brewers played are kept', () => {
	const rows = parse([
		one(),
		one({ gid: 'CHN202007250', visteam: 'SLN', hometeam: 'CHN', wteam: 'CHN', lteam: 'SLN' }),
	])
	assert.equal(rows.length, 1)
	assert.equal(rows[0].gid, 'MIL202007240')
})

test('a Seattle Pilots game is a Brewers game', () => {
	const rows = parse([one({ gid: 'SE1196904080', hometeam: 'SE1', season: '1969', date: '19690408' })])
	assert.equal(rows.length, 1)
})

test('the date becomes ISO so it sorts as a string', () => {
	// Everything downstream sorts on this field without parsing it.
	assert.equal(parse([one()])[0].date, '2020-07-24')
})

test('a malformed date is passed through rather than mangled', () => {
	assert.equal(parse([one({ date: 'unknown' })])[0].date, 'unknown')
})

test('the result comes from the winning team, not from the scores', () => {
	// Retrosheet names the winner explicitly. Deriving it from runs would be
	// wrong for a forfeit, where the score does not match the outcome.
	assert.equal(parse([one({ wteam: 'MIL', lteam: 'CHN' })])[0]['result'], 'WIN')
	assert.equal(parse([one({ wteam: 'CHN', lteam: 'MIL' })])[0]['result'], 'LOSS')
})

test('equal scores with no winner named is a tie', () => {
	const rows = parse([one({ vruns: '3', hruns: '3', wteam: '', lteam: '' })])
	assert.equal(rows[0]['result'], 'TIE')
})

test('a game with no result at all yields an empty result rather than a loss', () => {
	const rows = parse([one({ vruns: '', hruns: '', wteam: '', lteam: '' })])
	assert.equal(rows[0]['result'], '')
	assert.equal(rows[0].scoreFor, '')
})

test('scores are assigned by which side the Brewers were on', () => {
	const home = parse([one({ hometeam: 'MIL', vruns: '2', hruns: '4' })])[0]
	assert.equal(home.scoreFor, '4')
	assert.equal(home.scoreAgainst, '2')
	assert.equal(home.location, 'home')

	const away = parse([one({ hometeam: 'CHN', visteam: 'MIL', vruns: '2', hruns: '4' })])[0]
	assert.equal(away.scoreFor, '2')
	assert.equal(away.scoreAgainst, '4')
	assert.equal(away.location, 'away')
})

test('gametype words become the single-letter codes the rest of the code uses', () => {
	const cases = [
		['regular', 'R', '1'],
		['wildcard', 'F', '0'],
		['divisionseries', 'D', '0'],
		['lcs', 'L', '0'],
		['worldseries', 'W', '0'],
	]
	for (const [word, code, regular] of cases) {
		const row = parse([one({ gametype: word })])[0]
		assert.equal(row.gametype, code, word)
		assert.equal(row.regular_season, regular, word)
	}
})

// 'worldseries' here is Retrosheet's word for the round, not ours for the
// column. The key rename turned the row field into `championship` and must not
// touch the value the CSV actually carries — normalizeGametype still matches
// WORLDSERIES, and renaming this input is what broke this test the first time.
test('a World Series game records the season it decided', () => {
	const row = parse([one({ gametype: 'worldseries' })])[0]
	assert.equal(row.championship, '2020')
	assert.equal(parse([one()])[0].championship, '')
})

test('a missing gametype falls back to regular season', () => {
	// Absent rather than unknown: an empty column must not quietly promote a
	// game into the postseason.
	assert.equal(parse([one({ gametype: '' })])[0].gametype, 'R')
})

// The era logic. Retrosheet keeps one row per name a franchise has used, and
// a game has to be labelled with the name in use on the day it was played.
test('an opponent carries the name it had at the time', () => {
	const { franchiseEras } = parseCurrentNamesCsv(names)
	assert.equal(nameForFranchiseAt(franchiseEras, 'TBA', 20070401), 'Tampa Bay Devil Rays')
	assert.equal(nameForFranchiseAt(franchiseEras, 'TBA', 20080401), 'Tampa Bay Rays')
})

test('a franchise with one name uses it for every date', () => {
	const { franchiseEras } = parseCurrentNamesCsv(names)
	assert.equal(nameForFranchiseAt(franchiseEras, 'CHN', 18800101), 'Chicago Cubs')
	assert.equal(nameForFranchiseAt(franchiseEras, 'CHN', 20200724), 'Chicago Cubs')
})

test('relocated teams group under one franchise so their history is not split', () => {
	const { teamToFranchise } = parseCurrentNamesCsv(names)
	assert.equal(teamToFranchise['SE1'], 'MIL')
	assert.equal(teamToFranchise['MIL'], 'MIL')
})

test('an unknown team code still produces a usable opponent name', () => {
	// Defunct franchises are absent from CurrentNames. Falling through to the
	// raw code keeps them as one opponent rather than dropping the games.
	const row = parse([one({ visteam: 'WS1' })])[0]
	assert.ok(row.Opponent.length > 0)
	assert.equal(row.franchise, 'WS1')
})

test('parseCurrentNamesCsv reads the Retrosheet date format', () => {
	const { franchiseEras } = parseCurrentNamesCsv(names)
	// M/D/YYYY, not ISO. Reading it as ISO would put every era in the wrong
	// century and every game under the wrong name.
	const tba = franchiseEras['TBA']
	assert.ok(Array.isArray(tba) && tba.length === 2)
})

test('parseBallparksCsv reads the columns the real file actually has', () => {
	// Written first against invented column names and an invented return type,
	// so it failed rather than passing vacuously. The header is ID/City/Park
	// Name/First/Last and the function returns an array, not a map. Pinning
	// that matters because a rename upstream yields rows of empty strings,
	// which render as blank park labels rather than as an error.
	const raw =
		'ID,Country,State,City,Park Name,First,Last\n' +
		'MIL06,United States,Wisconsin,Milwaukee,American Family Field,20010406,\n'
	const parks = parseBallparksCsv(raw)
	assert.equal(parks.length, 1)
	assert.deepEqual(parks[0], {
		id: 'MIL06',
		city: 'Milwaukee',
		park: 'American Family Field',
		first: '20010406',
		last: '',
	})
})

test('parseBallparksCsv skips blank lines and rows with no id', () => {
	const raw =
		'ID,Country,State,City,Park Name,First,Last\n' +
		'MIL06,United States,Wisconsin,Milwaukee,American Family Field,20010406,\n' +
		'\n' +
		',United States,Wisconsin,Nowhere,No Park,,\n'
	assert.equal(parseBallparksCsv(raw).length, 1)
})
