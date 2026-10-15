import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SITE } from '../site.js'

// Every record slug needs its own share card. best-seasons, worst-seasons,
// no-hitters and perfect-games had none and fell through to the overview, so
// sharing any of them showed the same picture as /records — a valid PNG, just
// not theirs, which is why nothing noticed.
//
// This reads lib/cards.js as text rather than importing it: cards.js loads
// @resvg/resvg-js, a native module, and the test job runs on a bare checkout
// with no install. So it proves each slug has a case, not that the case draws
// the right thing; that was checked by rendering.
test('every record slug has its own share card', () => {
	const src = readFileSync(new URL('../lib/cards.js', import.meta.url), 'utf8')
	const missing = SITE.records.filter((slug) => !src.includes(`case '${slug}'`))
	assert.deepEqual(missing, [])
})
