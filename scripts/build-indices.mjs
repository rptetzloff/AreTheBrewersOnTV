// Precompute the box-score indices the server builds at boot.
//
// server.js streams ~457MB of Retrosheet CSV every time it starts, to produce
// about 111MB of in-memory indices. That is 5.7 seconds and a 339MB heap peak
// on a box whose cap is 400MB — which is why render.yaml carries
// --max-old-space-size=400 and a comment about it.
//
// The same indices, brotli-compressed, are 6.6MB total. Measured against a
// working implementation, which matters — the first numbers written here were
// taken before the thing produced correct output, and were wrong:
//
//     456.7 MB CSV    ->    6.6 MB of artifacts
//     5.3 s boot      ->    4.2 s
//
// The time saving is real but modest, because reviving three Maps-of-Maps a
// line at a time is not free. The size saving is the point: 456MB of source
// data no longer has to be present for the server to run.
//
// Written as one newline-delimited file per index, and that is not a stylistic
// choice — see ARTIFACT_DIR below for what the two simpler formats did.
//
// Run this whenever the Retrosheet files change, and commit the result. The
// server prefers the artifacts and falls back to reading the CSVs, so a missing
// or stale one costs speed rather than correctness.
//
//     node --max-old-space-size=3000 scripts/build-indices.mjs
//
// The heap flag is for this script, not the server: building needs more room
// than loading, which is the whole point.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { brotliCompressSync, constants } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import {
	buildBattingIndex,
	buildFieldingIndex,
	buildGameIndex,
	buildPitchingIndex,
	buildPlayerNameMap,
	createScoringPlaysCollector,
} from '../boxscore-core.js';
import {
	parseBallparksCsv,
	parseCurrentNamesCsv,
	parseTeamstatsLineScores,
} from '../records-core.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** One newline-delimited file per index, and both halves of that were learned
 *  the hard way rather than designed.
 *
 *  A single 112MB JSON blob will not load inside the server's 400MB cap.
 *  JSON.parse needs the whole document as a string and a JS string is UTF-16,
 *  so 112MB of bytes becomes ~224MB before parsing starts, on top of the buffer
 *  and the structure being built. Measuring that load in isolation suggested it
 *  was fine; it is not, because in isolation nothing else is on the heap.
 *
 *  Splitting into one JSON file per index was the second attempt and also
 *  failed: the largest index alone still needs its whole document as a string,
 *  and loading all thirteen wanted a 600MB cap against a 512MB box.
 *
 *  So: one JSON value per line. The reader parses a line at a time and the
 *  transient is a single entry, which is exactly what the CSV path was already
 *  doing by streaming — and the only reason that path fits. */
export const ARTIFACT_DIR = join(ROOT, 'data', 'indices');

/** The format version, bumped when the shape of an index changes.
 *
 *  The server refuses an artifact whose version it does not recognise and
 *  falls back to the CSVs, so a stale file after a boxscore-core change is a
 *  slow boot rather than a wrong box score. */
export const FORMAT = 2;

async function* lines(name) {
	const rl = createInterface({
		input: createReadStream(join(ROOT, 'data', name), 'utf8'),
		crlfDelay: Infinity,
	});
	yield* rl;
}

const read = (name) => readFile(join(ROOT, 'data', name), 'utf8');

/** Every index is a Map and every consumer calls .get(), so the round trip has
 *  to preserve that. JSON turns a Map into `{}` silently.
 *
 *  Three of the thirteen — pitchCounts, firstPa and risp — are Maps of Maps, so
 *  this has to work at any depth rather than only at the top level. An earlier
 *  version of this file applied the tagging only to whole indices and then
 *  stopped applying it at all when the format became line-based; the result was
 *  a server that booted fine, served every page fine, and threw
 *  "gameFirstPa?.get is not a function" on every box score.
 *
 *  Tagged rather than positional so the reviver can tell a serialised Map from
 *  an object that happens to have the same keys. */
export const replacer = (key, value) =>
	value instanceof Map ? { __map: [...value] } : value;

export const reviver = (key, value) =>
	value && typeof value === 'object' && Array.isArray(value.__map)
		? new Map(value.__map)
		: value;

/** Build every index from the CSVs. Exported so the server can use exactly this
 *  function as its fallback, rather than keeping a second copy of the order
 *  these are built in. */
export async function buildIndices() {
	const collector = createScoringPlaysCollector();
	for await (const line of lines('plays.lfs.csv')) collector.line(line);

	const [namesRaw, teamstatsRaw, parksRaw] = await Promise.all([
		read('CurrentNames.csv'),
		read('teamstats.csv'),
		read('ballparks.csv'),
	]);

	return {
		...collector.result(),
		games: await buildGameIndex(lines('gameinfo.csv')),
		pitching: await buildPitchingIndex(lines('pitching.csv')),
		batting: await buildBattingIndex(lines('batting.csv')),
		fielding: await buildFieldingIndex(lines('fielding.csv')),
		playerNames: await buildPlayerNameMap(lines('biofile0.csv')),
		namesData: parseCurrentNamesCsv(namesRaw),
		parks: parseBallparksCsv(parksRaw),
		lineScores: parseTeamstatsLineScores(teamstatsRaw),
	};
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

async function main() {
	const started = Date.now();
	const indices = await buildIndices();
	const built = Date.now();

	await mkdir(ARTIFACT_DIR, { recursive: true });
	// Quality 5 rather than 11: smaller than gzip -9 and compresses in under a
	// second, where 11 takes minutes for about 5% more. This runs on every data
	// refresh, so the time is not free.
	let jsonBytes = 0;
	let packedBytes = 0;
	const names = Object.keys(indices).sort();
	for (const name of names) {
		const value = indices[name];
		// Newline-delimited, one Map entry per line.
		//
		// Not a whole JSON document, and the reason is memory rather than
		// taste. JSON.parse needs the entire document as a UTF-16 string, so a
		// 47MB index costs ~94MB before parsing starts, plus the array of
		// entries, plus the Map being built from it. Loading all thirteen that
		// way needed a 600MB cap; this box has 512MB and render.yaml caps the
		// heap at 400.
		//
		// A line at a time bounds the transient to one entry, which is what the
		// CSV path already did by streaming and is the only reason it fits.
		// Named rows rather than lines, because `lines` is the CSV generator at
		// the top of this file and shadowing it here would be a trap for the
		// next edit even though nothing calls it after this point.
		const rows = value instanceof Map
			? [JSON.stringify({ kind: 'map', size: value.size }),
				...[...value].map((entry) => JSON.stringify(entry, replacer))]
			: [JSON.stringify({ kind: 'value' }), JSON.stringify(value, replacer)];

		const json = Buffer.from(`${rows.join('\n')}\n`);
		const packed = brotliCompressSync(json, {
			params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
		});
		jsonBytes += json.length;
		packedBytes += packed.length;
		await writeFile(join(ARTIFACT_DIR, `${name}.ndjson.br`), packed);
	}
	// The manifest is what the server reads first: it names the format and the
	// files, so a partial write is detectable rather than a missing index that
	// renders as an empty box score.
	await writeFile(
		join(ARTIFACT_DIR, 'manifest.json'),
		`${JSON.stringify({ format: FORMAT, indices: names }, null, '\t')}\n`,
	);

	const csvBytes = (
		await Promise.all(
			['plays.lfs.csv', 'gameinfo.csv', 'pitching.csv', 'batting.csv', 'fielding.csv',
				'biofile0.csv', 'CurrentNames.csv', 'teamstats.csv', 'ballparks.csv']
				.map((f) => stat(join(ROOT, 'data', f)).then((s) => s.size).catch(() => 0)),
		)
	).reduce((a, b) => a + b, 0);

	console.log(`data/indices/ written — ${names.length} files plus a manifest`);
	console.log(`  sources   ${mb(csvBytes)}`);
	console.log(`  json      ${mb(jsonBytes)}`);
	console.log(`  artifact  ${mb(packedBytes)}`);
	console.log(`  built in  ${((built - started) / 1000).toFixed(1)}s, packed in ${((Date.now() - built) / 1000).toFixed(1)}s`);
}

// Only when run directly, so the exports above stay importable by the server
// and by tests without rebuilding 457MB of anything.
//
// pathToFileURL rather than string surgery. On Windows argv[1] is a drive path
// and import.meta.url is file:///C:/... with three slashes, so the obvious
// comparison never matches and the script silently does nothing at all. It did
// exactly that on the first run, and printing nothing is the worst way for a
// build step to fail.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
