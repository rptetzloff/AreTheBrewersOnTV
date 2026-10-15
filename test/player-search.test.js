import test from 'node:test'
import assert from 'node:assert/strict'
import { fold, matchPlayers } from '../player-search.js'
import { playerDirectory } from '../stats-core.js'

const P = (name, first, last, id = fold(name).replace(/ /g, '')) => ({ id, name, first, last })
const players = [
	P('Robin Yount', 1974, 1993), P('Ron Robinson', 1990, 1992), P('Robinson Cancel', 1999, 1999),
	P('CC Sabathia', 2008, 2008), P('Bob McClure', 1977, 1986),
	P('Christian Yelich', 2018, 2025), P('Paul Molitor', 1978, 1992), P('Ed Núñez', 1991, 1992),
	P('B.J. Surhoff', 1987, 1995), P('Ryan Braun', 2007, 2020), P('Ryan Weber', 2021, 2021),
]
const names = (q, n) => matchPlayers(players, q, n).map((p) => p.name)

test('accents, case and punctuation do not matter', () => {
	assert.equal(fold('Núñez'), 'nunez')
	assert.equal(fold('B.J.  Surhoff'), 'bj surhoff')
	assert.deepEqual(names('NUNEZ'), ['Ed Núñez'])
	assert.deepEqual(names('bj'), ['B.J. Surhoff'])
})

// Ranked surname-first, "robin" put Ron Robinson (three seasons) above
// Robin Yount. A whole-word match outranks a prefix, whichever word it is.
test('a whole-word match outranks a word that merely starts with the query', () => {
	assert.deepEqual(names('robin'), ['Robin Yount', 'Ron Robinson', 'Robinson Cancel'])
	assert.equal(names('cc')[0], 'CC Sabathia')
})

test('within a rank the longer Brewers career comes first', () => {
	assert.deepEqual(names('ryan'), ['Ryan Braun', 'Ryan Weber'])
})

test('every word of a two-word query has to start some word of the name', () => {
	assert.deepEqual(names('molitor p'), ['Paul Molitor'])
	assert.deepEqual(names('molitor x'), [])
})

test('a partial word finds the player, and the list is capped', () => {
	assert.deepEqual(names('yel'), ['Christian Yelich'])
	assert.equal(matchPlayers(players, 'r', 3).length, 3)
	assert.deepEqual(names('   '), [])
})

test('the directory has each Brewer once, with his span and whether he pitched', () => {
	const seasons = [
		{ season: 1978, batting: [{ id: 'molip001', name: 'Paul Molitor', pa: 600 }], pitching: [{ id: 'caldm001', name: 'Mike Caldwell', ipouts: 879 }], fielding: [] },
		{ season: 1982, batting: [{ id: 'molip001', name: 'Paul Molitor', pa: 751 }, { id: 'caldm001', name: 'Mike Caldwell', pa: 3 }], pitching: [{ id: 'caldm001', name: 'Mike Caldwell', ipouts: 774 }], fielding: [] },
	]
	assert.deepEqual(playerDirectory(seasons), [
		{ id: 'caldm001', name: 'Mike Caldwell', first: 1978, last: 1982, pitcher: true },
		{ id: 'molip001', name: 'Paul Molitor', first: 1978, last: 1982, pitcher: false },
	])
})
