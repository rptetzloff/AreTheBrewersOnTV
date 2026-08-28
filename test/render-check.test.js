import test from 'node:test'
import assert from 'node:assert/strict'
import { compare, missingMarkers, normalise } from '../scripts/render-check.mjs'

// The decision logic of the render check, tested without a browser.
//
// The three guards below are the three ways I got this comparison wrong by hand
// in a single afternoon, each producing a green result that meant nothing. A
// tool that can make the same mistakes silently is not an improvement on doing
// it by hand.

test('the wall-clock line is normalised away', () => {
	const a = normalise('<div>Last updated: 8/27/2026 at 8:01:59 PM</div>')
	const b = normalise('<div>Last updated: 8/28/2026 at 9:14:02 AM</div>')
	assert.equal(a, b)
})

test('the asset cache-buster is normalised away', () => {
	// It *must* differ whenever the JS changes — that is its whole job — so
	// leaving it in would make every real comparison fail for the one reason
	// that is never interesting.
	const a = normalise('<script src="main.js?v=d6e7cbe4"></script>')
	const b = normalise('<script src="main.js?v=ae8d0f02"></script>')
	assert.equal(a, b)
})

test('nothing else is normalised away', () => {
	const html = '<div>Final Record: 12-0-1</div>'
	assert.equal(normalise(html), html)
})

// Guard 1: comparing a build against itself.
test('identical fingerprints are refused, however well the pages match', () => {
	const m = { fingerprint: 'abc', pages: { '/x': { digest: '1', pixels: 'p' } } }
	const report = compare(m, { ...m })
	assert.equal(report.problems.length, 1)
	assert.match(report.problems[0], /same build/)
	// And the point: the pages *do* all match, which is exactly why the refusal
	// has to happen before anyone reads that number.
	assert.deepEqual(report.same, ['/x'])
})

test('different fingerprints raise no objection', () => {
	const report = compare(
		{ fingerprint: 'abc', pages: { '/x': { digest: '1', pixels: 'p' } } },
		{ fingerprint: 'def', pages: { '/x': { digest: '1', pixels: 'p' } } },
	)
	assert.deepEqual(report.problems, [])
	assert.deepEqual(report.same, ['/x'])
})

// Guard 2: comparing two pages that both rendered nothing.
test('a page missing its markers is reported, not recorded', () => {
	const html = '<div id="streak-banner" hidden></div>'
	assert.deepEqual(missingMarkers(html, ['streak-banner']), [])
	assert.deepEqual(missingMarkers(html, ['Final Record: 12-0-1']), ['Final Record: 12-0-1'])
})

test('every missing marker is named, not just the first', () => {
	assert.deepEqual(
		missingMarkers('<p>nothing here</p>', ['one', 'two', 'three']),
		['one', 'two', 'three'],
	)
})

// The comparison itself.
test('pages are sorted into identical, differing, and only-in-one', () => {
	const page = (digest, pixels) => ({ digest, pixels })
	const report = compare(
		{ fingerprint: 'a', pages: { '/same': page('1', 'p'), '/moved': page('2', 'p'), '/gone': page('3', 'p') } },
		{ fingerprint: 'b', pages: { '/same': page('1', 'p'), '/moved': page('9', 'p'), '/new': page('4', 'p') } },
	)
	assert.deepEqual(report.same, ['/same'])
	assert.deepEqual(report.differs.map((d) => d.path), ['/moved'])
	assert.deepEqual(report.missing, ['/gone', '/new'])
})

test('a page whose pixels moved but whose markup did not is still a difference', () => {
	// The single-column bug in one assertion. The stylesheet changed what the
	// page looked like and not one byte of what it said, so a DOM-only check
	// reported it as identical — which it was, and which was not the question.
	const report = compare(
		{ fingerprint: 'a', pages: { '/records': { digest: 'same', pixels: 'one-column' } } },
		{ fingerprint: 'b', pages: { '/records': { digest: 'same', pixels: 'two-columns' } } },
	)
	assert.deepEqual(report.same, [])
	assert.deepEqual(report.differs, [{ path: '/records', dom: false, pixels: true }])
})

test('markup can move while the picture does not, and that is reported too', () => {
	// An aria-label, a link target, a data attribute: real changes that a
	// screenshot cannot see.
	const report = compare(
		{ fingerprint: 'a', pages: { '/x': { digest: '1', pixels: 'p' } } },
		{ fingerprint: 'b', pages: { '/x': { digest: '2', pixels: 'p' } } },
	)
	assert.deepEqual(report.differs, [{ path: '/x', dom: true, pixels: false }])
})

test('a page added or removed between captures is never counted as identical', () => {
	// Otherwise dropping a page from the list would look like a clean refactor.
	const report = compare(
		{ fingerprint: 'a', pages: { '/x': { digest: '1', pixels: 'p' } } },
		{ fingerprint: 'b', pages: {} },
	)
	assert.deepEqual(report.same, [])
	assert.deepEqual(report.missing, ['/x'])
})

test('a live countdown is normalised away', () => {
	// The one page still differing from itself after every other guard was in.
	// Found by comparing a build against itself and asking why the remaining
	// difference was there, rather than assuming it was real.
	const a = normalise('<div class="countdown-small">⏰ 2h 24m</div>')
	const b = normalise('<div class="countdown-small">⏰ 2h 23m</div>')
	assert.equal(a, b)
})

test('normalising the countdown does not eat the element around it', () => {
	assert.equal(
		normalise('<div class="countdown-small">2h</div><div class="score">7-3</div>'),
		'<div class="countdown-small">COUNTDOWN</div><div class="score">7-3</div>',
	)
})
