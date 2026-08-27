import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createBrotliDecompress } from 'node:zlib'
import { join } from 'node:path'
import { ARTIFACT_DIR, FORMAT, replacer, reviver } from '../scripts/build-indices.mjs'

// The precomputed box-score indices, checked without rebuilding them.
//
// These tests read the committed artifacts rather than the 457MB of CSV behind
// them, so they run in the same bare checkout as everything else. What they
// cannot check is whether the artifacts are current — that is what the format
// version and the server's fallback are for.

const readIndex = async (name) => {
	const rl = createInterface({
		input: createReadStream(join(ARTIFACT_DIR, `${name}.ndjson.br`)).pipe(createBrotliDecompress()),
		crlfDelay: Infinity,
	})
	let header = null
	let plain
	const map = new Map()
	for await (const line of rl) {
		if (!line) continue
		if (!header) { header = JSON.parse(line); continue }
		if (header.kind === 'map') { const [k, v] = JSON.parse(line, reviver); map.set(k, v) }
		else plain = JSON.parse(line, reviver)
	}
	return { header, value: header.kind === 'map' ? map : plain }
}

const manifest = JSON.parse(await readFile(join(ARTIFACT_DIR, 'manifest.json'), 'utf8'))

test('the manifest matches the format the server expects', () => {
	// A mismatch makes the server fall back to CSV rather than serve wrong data,
	// so this failing is a warning that the artifacts need rebuilding.
	assert.equal(manifest.format, FORMAT)
	assert.ok(manifest.indices.length >= 13, `only ${manifest.indices.length} indices`)
})

test('every index named in the manifest is readable', async () => {
	for (const name of manifest.indices) {
		const { header } = await readIndex(name)
		assert.ok(header, `${name}: no header line`)
		assert.ok(['map', 'value'].includes(header.kind), `${name}: kind ${header.kind}`)
	}
})

test('every map index has exactly the number of entries its header claims', async () => {
	// The guard against a file truncated mid-write, which would otherwise be an
	// index that is quietly short rather than an error.
	for (const name of manifest.indices) {
		const { header, value } = await readIndex(name)
		if (header.kind !== 'map') continue
		assert.equal(value.size, header.size, `${name} is short`)
	}
})

// The bug this file exists for. pitchCounts, firstPa and risp are Maps of Maps.
// A round trip that only revives the outer one leaves the inner as a plain
// object — which throws nothing, serves every other page correctly, and fails
// on every box score with "gameFirstPa?.get is not a function".
test('the three nested-map indices revive as Maps at both levels', async () => {
	for (const name of ['pitchCounts', 'firstPa', 'risp']) {
		const { value } = await readIndex(name)
		assert.ok(value instanceof Map, `${name} outer is not a Map`)
		const inner = value.values().next().value
		assert.ok(inner instanceof Map, `${name} inner is ${inner?.constructor?.name} — the reviver is not running at depth`)
	}
})

test('the flat indices are still the shapes the box score reads', async () => {
	const games = (await readIndex('games')).value
	assert.ok(games instanceof Map)
	assert.equal(typeof games.values().next().value, 'object')

	for (const name of ['batting', 'fielding', 'pitching', 'scoring']) {
		const v = (await readIndex(name)).value
		assert.ok(v instanceof Map, `${name} is not a Map`)
		assert.ok(Array.isArray(v.values().next().value), `${name} values are not arrays`)
	}

	const names = (await readIndex('playerNames')).value
	assert.equal(typeof names.values().next().value, 'string')
})

// The tagging is what makes any of the above work, and it is small enough to
// pin directly rather than only through the artifacts.
test('the replacer and reviver round-trip nested maps', () => {
	const original = new Map([['a', new Map([['b', new Map([['c', 1]])]])]])
	const back = JSON.parse(JSON.stringify(original, replacer), reviver)
	assert.ok(back instanceof Map)
	assert.ok(back.get('a') instanceof Map)
	assert.ok(back.get('a').get('b') instanceof Map)
	assert.equal(back.get('a').get('b').get('c'), 1)
})

test('an object that merely looks like a tagged map is left alone', () => {
	// __map has to be an array of entries. A plain object carrying that key
	// with anything else in it is data, not a tag.
	const back = JSON.parse(JSON.stringify({ __map: 'not an array' }), reviver)
	assert.equal(back.__map, 'not an array')
	assert.ok(!(back instanceof Map))
})
