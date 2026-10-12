import test from 'node:test'
import assert from 'node:assert/strict'
import { postseasonSeriesParts } from '../records-core.js'

// The 2026 postseason as ESPN listed it on 11 October, during NLCS Game 1:
// the Padres in four, then seven Dodgers games with nothing final yet.
const g = (round, opponent, result = null) => ({ round, opponent, result })
const nlds = [g('NLDS', 'Padres', 'WIN'), g('NLDS', 'Padres', 'WIN'), g('NLDS', 'Padres', 'LOSS'), g('NLDS', 'Padres', 'WIN')]
const nlcs = Array.from({ length: 7 }, () => g('NLCS', 'Dodgers'))

test('a finished series and an unstarted one, in the order they were played', () => {
	assert.deepEqual(postseasonSeriesParts([...nlds, ...nlcs]), [
		'NLDS vs Padres: <strong>won 3-1</strong>',
		'NLCS vs Dodgers: <strong>tied 0-0</strong>',
	])
})

test('a series in progress leads, trails or is tied', () => {
	const [, a] = postseasonSeriesParts([...nlds, g('NLCS', 'Dodgers', 'WIN'), g('NLCS', 'Dodgers', 'WIN'), g('NLCS', 'Dodgers', 'LOSS')])
	assert.equal(a, 'NLCS vs Dodgers: <strong>lead 2-1</strong>')
	const [b] = postseasonSeriesParts([g('NLCS', 'Dodgers', 'LOSS'), g('NLCS', 'Dodgers')])
	assert.equal(b, 'NLCS vs Dodgers: <strong>trail 0-1</strong>')
})

test('each round has its own length', () => {
	assert.equal(postseasonSeriesParts([g('NL Wild Card', 'Cubs', 'LOSS'), g('NL Wild Card', 'Cubs', 'LOSS')])[0],
		'NL Wild Card vs Cubs: <strong>lost 0-2</strong>')
	// 3-1 ends a division series but not a championship series.
	const lcs = postseasonSeriesParts([...nlds.map(x => ({ ...x, round: 'NLCS' }))])[0]
	assert.equal(lcs, 'NLCS vs Padres: <strong>lead 3-1</strong>')
	const ws = postseasonSeriesParts(Array.from({ length: 4 }, () => g('World Series', 'Yankees', 'WIN')))[0]
	assert.equal(ws, 'World Series vs Yankees: <strong>won 4-0</strong>')
})

test('a round nobody recognises is never declared over', () => {
	assert.equal(postseasonSeriesParts(Array.from({ length: 5 }, () => g('Postseason', 'Mets', 'WIN')))[0],
		'Postseason vs Mets: <strong>lead 5-0</strong>')
})

// Past seasons arrive with ROUND_LABEL's names and every series finished.

test('the 1982 ALCS was best of five, so a settled 3-2 is a win', () => {
	const alcs = ['LOSS', 'LOSS', 'WIN', 'WIN', 'WIN'].map(r => g('LCS', 'California Angels', r))
	assert.equal(postseasonSeriesParts(alcs)[0], 'LCS vs California Angels: <strong>lead 3-2</strong>')
	assert.equal(postseasonSeriesParts(alcs, { settled: true })[0], 'LCS vs California Angels: <strong>won 3-2</strong>')
})

test('a tiebreaker is one game', () => {
	assert.equal(postseasonSeriesParts([g('Tiebreaker', 'Chicago Cubs', 'WIN')])[0],
		'Tiebreaker vs Chicago Cubs: <strong>won 1-0</strong>')
})

test('no postseason games means no lines', () => {
	assert.deepEqual(postseasonSeriesParts([]), [])
})
