import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gametypeOf } from '../lib/espn-current.js'
import { parseGameinfoCsv, splitCsvLine } from '../records-core.js'

// ESPN's notes as they read in October 2026. The wild card and World Series
// wordings are not from a live payload — the Brewers had a bye and have not
// reached the Series — so they are the forms both phrasings could take.
const post = (headline) => ({ _t: 'post', competitions: [{ notes: [{ headline }] }] })

const header = readFileSync(new URL('../data/gameinfo.csv', import.meta.url), 'utf8').split('\n', 1)[0]
const names = readFileSync(new URL('../data/CurrentNames.csv', import.meta.url), 'utf8')

/** What the history page ends up with: gametypeOf's word, read back by the
 *  same parser the page uses. The word is only right if this comes out right. */
function roundCode(word) {
	const h = splitCsvLine(header)
	const row = h.map((k) => ({
		gid: 'MIL202610030', visteam: 'SDN', hometeam: 'MIL', site: 'MIL06', date: '20261003',
		number: '0', gametype: word, vruns: '2', hruns: '3', wteam: 'MIL', lteam: 'SDN', season: '2026',
	}[k] ?? ''))
	return parseGameinfoCsv(`${header}\n${row.join(',')}`, names)[0].gametype
}

test('each round in ESPN\'s words comes back as its Retrosheet round', () => {
	const cases = [
		['NLDS - Game 1', 'D'],
		['ALDS - Game 5 If Necessary', 'D'],
		['NLCS - Game 1', 'L'],
		['ALCS - Game 7 If Necessary', 'L'],
		['World Series - Game 1', 'W'],
		['NL Wild Card Series - Game 2', 'F'],
		['AL Wild Card Game', 'F'],
	]
	for (const [headline, code] of cases) {
		assert.equal(roundCode(gametypeOf(post(headline))), code, headline)
	}
})

test('a regular-season game is regular whatever its note says', () => {
	assert.equal(gametypeOf({ _t: 'regular', competitions: [{ notes: [{ headline: 'NLDS' }] }] }), 'regular')
	assert.equal(roundCode('regular'), 'R')
})

test('a postseason game with no recognisable note is still a postseason game', () => {
	assert.notEqual(roundCode(gametypeOf(post(''))), 'R')
})
