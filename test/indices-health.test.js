import test from 'node:test'
import assert from 'node:assert/strict'
import { indexLoadOutcome, isLfsPointer } from '../lib/indices-health.js'

// The rule that decides whether a degraded start is ordinary or a broken deploy.
//
// Written because the site served box scores with no Scoring Summary for a week
// while returning 200 on every request. The failure was caught, logged, and
// treated exactly like a fresh checkout.

test('a fresh clone with no artifacts starts, as it always has', () => {
	// scripts/build-indices.mjs has not been run. Slow boot, correct output.
	const { fatal } = indexLoadOutcome({ manifestPresent: false })
	assert.equal(fatal, false)
})

test('a manifest that exists but will not load refuses to start', () => {
	// The actual bug: .dockerignore excluded scripts/, the import threw, the
	// throw was caught, and a warning scrolled past.
	const { fatal, reason } = indexLoadOutcome({
		manifestPresent: true,
		error: "Cannot find module '/app/scripts/build-indices.mjs'",
	})
	assert.equal(fatal, true)
	assert.match(reason, /broken deploy/)
	// The message has to say why a 200 is not reassurance, because that is what
	// made this survive.
	assert.match(reason, /still return 200/)
})

test('a manifest that exists and loads is not an outcome this decides', () => {
	// No error means the artifacts worked; nothing to rule on.
	assert.equal(indexLoadOutcome({ manifestPresent: true, error: null }).fatal, false)
})

test('an LFS pointer where the play-by-play should be refuses to start', () => {
	// Every build now runs with the LFS smudge filter off, deliberately: the
	// image excludes the 388MB file. If the artifacts ever stopped loading, the
	// CSV fallback would parse a 130-byte pointer and produce an empty
	// scoring-plays index without complaining.
	const { fatal, reason } = indexLoadOutcome({ manifestPresent: false, playsIsPointer: true })
	assert.equal(fatal, true)
	assert.match(reason, /Git LFS pointer/)
})

test('the escape hatch is explicit and beats everything', () => {
	// For a checkout with neither artifacts nor a fetched play-by-play file,
	// where nobody cares about box scores. It has to be asked for.
	for (const args of [
		{ manifestPresent: true, error: 'boom' },
		{ manifestPresent: false, playsIsPointer: true },
	]) {
		assert.equal(indexLoadOutcome({ ...args, allowDegraded: true }).fatal, false)
	}
})

test('a real LFS pointer is recognised', () => {
	const pointer = [
		'version https://git-lfs.github.com/spec/v1',
		'oid sha256:a1242a86bc0000000000000000000000000000000000000000000000000000',
		'size 407313920',
		'',
	].join('\n')
	assert.equal(isLfsPointer(pointer), true)
})

test('a leading blank line does not hide a pointer', () => {
	assert.equal(isLfsPointer('\n\nversion https://git-lfs.github.com/spec/v1\noid sha256:x'), true)
})

test('the actual CSV is not mistaken for a pointer', () => {
	// The real file starts with a Retrosheet header row.
	assert.equal(isLfsPointer('gid,event,inning,batter,pitcher\nMIL198204060,1,1,younr001,'), false)
})

test('nothing, or the wrong type, is not a pointer', () => {
	assert.equal(isLfsPointer(''), false)
	assert.equal(isLfsPointer(null), false)
	assert.equal(isLfsPointer(undefined), false)
	assert.equal(isLfsPointer(Buffer.from('version https://git-lfs')), false)
})
