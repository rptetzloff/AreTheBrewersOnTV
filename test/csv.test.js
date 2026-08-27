import test from 'node:test'
import assert from 'node:assert/strict'
import { esc, formatDate, parseGamesCsv, rec, splitCsvLine } from '../records-core.js'

// The same file exists in the Packers repo and is very nearly identical. The
// difference worth noting is what is absent here: that repo exports localDate,
// because its pages build Date objects from ISO strings. Nothing here does, so
// nothing here needs it — and a shared core should not force the export on a
// site that has no use for it.

test('splitCsvLine keeps quoted commas together', () => {
	assert.deepEqual(
		splitCsvLine('MIL202007240,"Milwaukee, WI",4'),
		['MIL202007240', 'Milwaukee, WI', '4'],
	)
})

test('splitCsvLine unescapes a doubled quote', () => {
	assert.deepEqual(splitCsvLine('a,"say ""hi""",b'), ['a', 'say "hi"', 'b'])
})

test('splitCsvLine trims surrounding whitespace', () => {
	assert.deepEqual(splitCsvLine(' a , b ,c'), ['a', 'b', 'c'])
})

test('splitCsvLine keeps empty trailing fields', () => {
	// gameinfo.csv has 40-odd columns and many rows end in empty ones. Dropping
	// them would shift every field read by index.
	assert.deepEqual(splitCsvLine('a,,c,'), ['a', '', 'c', ''])
})

test('parseGamesCsv maps headers onto rows', () => {
	const rows = parseGamesCsv('gid,season,visteam\nMIL202007240,2020,CHN\n')
	assert.equal(rows.length, 1)
	assert.equal(rows[0].visteam, 'CHN')
})

test('parseGamesCsv fills missing trailing columns with empty strings', () => {
	// A short row must not yield undefined, which renders as the word
	// "undefined" rather than as nothing.
	assert.equal(parseGamesCsv('a,b,c\n1,2\n')[0].c, '')
})

test('formatDate never touches Date, so it cannot drift by a day', () => {
	// new Date('1982-10-20') is UTC midnight, which every timezone west of
	// Greenwich renders as the 19th. This does the arithmetic on the string.
	assert.equal(formatDate('1982-10-20'), 'Oct 20, 1982')
	assert.equal(formatDate('2021-01-01'), 'Jan 1, 2021')
	assert.equal(formatDate('1970-04-07'), 'Apr 7, 1970')
})

test('rec shows ties only when there are some', () => {
	assert.equal(rec(95, 67, 0), '95–67')
	assert.equal(rec(95, 66, 1), '95–66–1')
})

test('rec uses an en dash, which the copy and the OG cards both assume', () => {
	assert.ok(rec(95, 67, 0).includes('–'))
	assert.ok(!rec(95, 67, 0).includes('-'))
})

test('esc escapes the characters that break attributes and markup', () => {
	assert.equal(esc('<a href="x">Tom & Jerry</a>'),
		'&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;')
})

test('esc escapes ampersands before entities, not after', () => {
	// The other order yields &amp;lt; — a double-escape that shows the entity
	// to the reader.
	assert.equal(esc('<'), '&lt;')
	assert.equal(esc('&lt;'), '&amp;lt;')
})
