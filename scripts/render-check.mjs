// Render pages with a real browser and compare two builds byte for byte.
//
// Every defect this repo shipped in August was invisible to `node --test` and
// obvious the moment something rendered the page: the records grid that read as
// correct while collapsing to one column, and every past season showing 0-0
// while 118 tests passed. The check that found both was a browser, a screenshot
// and a diff — run by hand, and got wrong three times in one afternoon.
//
// The ways it was wrong are the reason this file exists. Each produced a *green*
// result that meant nothing:
//
//   1. Comparing a build against itself. The check for "is the server running
//      the new code" matched a substring that appeared in both. See fingerprint.
//   2. Comparing two empty pages. The panel under test was hidden in both
//      captures, so "identical" was true and worthless. See markers.
//   3. Comparing noise. The on-this-day panel picks at random, so pages differ
//      between runs of the same build. See the pinned query strings below.
//   4. Generalising from one page. Screenshots were called reproducible on the
//      strength of three captures of /records; five other pages paint a live
//      clock and differ every run. See `pixels: false`.
//
// A tool that can still make those mistakes silently is not an improvement on
// doing it by hand, which is why each has a guard and each guard has a test.
//
// Usage:
//
//   node scripts/render-check.mjs capture out/before
//   git switch some-branch
//   node scripts/render-check.mjs capture out/after
//   node scripts/render-check.mjs diff out/before out/after
//
// No dependencies, and no browser is downloaded: it uses the Chrome or Edge
// already on the machine. Set CHROME to override the path.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = process.env.RENDER_CHECK_PORT || '3199';
const ORIGIN = `http://localhost:${PORT}`;

/** The pages to render, and what each must contain to count as rendered.
 *
 *  `markers` is the guard against a comparison that passes because both sides
 *  showed nothing. A page missing one fails the capture rather than being
 *  quietly recorded, because a hidden panel is exactly the state in which two
 *  builds agree for the wrong reason.
 *
 *  The query strings are not decoration. `otd` pins the on-this-day date, whose
 *  panel otherwise picks a random game and differs between two runs of the same
 *  build. 02-05 is one of only seven dates with exactly one candidate, which
 *  makes the choice deterministic — and it lands on Super Bowl XLV, so the
 *  championship path is one of the ones being compared.
 */
const PAGES = [
	// `pixels: false` where the page paints a live clock. index.html — the home
	// page and every season page — renders "Last updated: <date> at <time>" with
	// seconds, so two captures minutes apart differ in pixels for that reason and
	// nothing else. The DOM comparison still covers them, and normalise() strips
	// the same line out of it.
	//
	// Measured rather than assumed, on the football repo where this file was
	// written first: two captures of an identical build differ in pixels on
	// exactly the pages showing the clock and on none of those that do not.
	//
	// ?otd pins the on-this-day date, whose panel picks at random. 03-27 is the
	// value for THIS site, not the football one's 02-05: site.js sets
	// onThisDayWindowDays to 0 here, so a date is only usable if a game fell on
	// it exactly, and 03-27 is one of two with exactly one such game. Copying the
	// football date across would hide the panel on every page and make every
	// comparison agree for the wrong reason.
	{ path: '/?otd=03-27', markers: ['history-spark', 'season-label'], pixels: false },
	{ path: '/1982?otd=03-27', markers: ['Final Record: 95-67-1', 'Playoff Record: 6-6', 'streak-banner'], pixels: false },
	{ path: '/2002?otd=03-27', markers: ['Final Record: 56-106', 'streak-banner'], pixels: false },
	{ path: '/2011?otd=03-27', markers: ['Final Record: 96-66', 'Playoff Record: 5-6'], pixels: false },
	{ path: '/records', markers: ['records-grid', 'record-card', 'Best Seasons'] },
	{ path: '/history', markers: ['history'] },
	{ path: '/vs', markers: ['Head-to-Head'] },
	{ path: '/managers', markers: ['managers'] },
	// A box score, which is the only page reading the precomputed indices. It is
	// also the page that rendered blank for every game when those indices lost
	// their nested Maps, while the site booted cleanly and logged success.
	{ path: '/game/SLN198210120', markers: ['boxscore', 'Brewers'] },
];

/** The scripts whose content decides whether two captures are different builds
 *  at all. Hashed together into one fingerprint. */
const SOURCES = ['/main.js', '/records-core.js', '/boxscore-core.js', '/records.js', '/styles.css'];

/** Strip the things that differ between any two runs and mean nothing.
 *
 *  The cache-buster *must* differ whenever the JS changes — that is its job — so
 *  leaving it in would make every real comparison fail for the one reason that
 *  is never interesting.
 *
 *  The countdown to the next game is the same problem in the DOM rather than the
 *  markup: it counts down. Two captures a minute apart read "2h 24m" and
 *  "2h 23m", which was the one page still differing from itself after the other
 *  guards were in. Found by comparing a build against itself and asking why,
 *  rather than by assuming the remaining difference was real. */
export function normalise(html) {
	return html
		.replace(/Last updated: [^<]*/g, 'Last updated: NORMALISED')
		.replace(/\?v=[a-f0-9]+/g, '?v=NORMALISED')
		.replace(/(class="[^"]*countdown[^"]*"[^>]*>)[^<]*/g, '$1COUNTDOWN')
		.replace(/(id="[^"]*countdown[^"]*"[^>]*>)[^<]*/g, '$1COUNTDOWN');
}

/** Which markers are missing from a page. Empty means it rendered. */
export function missingMarkers(html, markers) {
	return markers.filter((m) => !html.includes(m));
}

/** Compare two capture manifests. Returns a report rather than printing, so the
 *  decision logic is testable without a browser anywhere near it. */
export function compare(before, after) {
	const problems = [];
	if (before.fingerprint === after.fingerprint) {
		problems.push(
			'both captures ran the same build — the fingerprints are identical, so ' +
			'any "no differences" below is meaningless');
	}
	const paths = [...new Set([...Object.keys(before.pages), ...Object.keys(after.pages)])].sort();
	const same = [], differs = [], missing = [];
	for (const p of paths) {
		const b = before.pages[p], a = after.pages[p];
		if (!b || !a) { missing.push(p); continue; }
		const dom = b.digest !== a.digest;
		const pixels = b.pixels !== a.pixels;
		if (!dom && !pixels) same.push(p);
		else differs.push({ path: p, dom, pixels });
	}
	return { problems, same, differs, missing };
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

function chromePath() {
	if (process.env.CHROME) return process.env.CHROME;
	const candidates = [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
	];
	const found = candidates.find((p) => existsSync(p));
	if (!found) throw new Error('no Chrome or Edge found — set CHROME to its path');
	return found;
}

function dumpDom(url) {
	// res/rej rather than resolve/reject: `resolve` is imported from node:path
	// and shadowing it here would be a trap for the next edit.
	return new Promise((res, rej) => {
		const child = spawn(chromePath(), [
			'--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
			// Long enough for the page to fetch its CSV and render. Without this
			// the dump happens at load, before any of the data arrives.
			'--virtual-time-budget=15000',
			'--dump-dom', url,
		]);
		let out = '';
		child.stdout.on('data', (d) => { out += d; });
		child.on('error', rej);
		child.on('close', () => res(out));
	});
}

/** A screenshot of the same page, at a fixed viewport.
 *
 *  The DOM alone is not enough. The worst layout bug this repo shipped — the
 *  records page collapsing to a single column at every viewport above 600px —
 *  changed no markup at all. It was a stylesheet whose container had no definite
 *  width, and a DOM comparison of before and after is byte-identical.
 *
 *  Chrome's PNG output is reproducible on one machine *for a page that paints
 *  nothing time-dependent*. That qualifier is the whole story: measured across
 *  two captures of an identical build, the five pages showing a live clock
 *  differ every time and the three that do not are byte-identical. Pages opt out
 *  with `pixels: false` above rather than the tool pretending otherwise.
 *
 *  Reproducible on ONE machine, and only there. Fonts and GPU differ across
 *  boxes, so this is no use as a committed baseline — which is also why this
 *  tool compares two captures taken minutes apart and never a stored one.
 */
function screenshot(url, file) {
	return new Promise((res, rej) => {
		const child = spawn(chromePath(), [
			'--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
			'--virtual-time-budget=15000', '--window-size=1400,1600',
			`--screenshot=${file}`, url,
		], { stdio: 'ignore' });
		child.on('error', rej);
		child.on('close', () => res());
	});
}

async function waitForServer(tries = 40) {
	for (let i = 0; i < tries; i++) {
		try {
			const res = await fetch(`${ORIGIN}/`);
			if (res.ok) return;
		} catch { /* not up yet */ }
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`server did not answer on ${ORIGIN}`);
}

async function capture(outDir) {
	mkdirSync(outDir, { recursive: true });
	// The heap flag matches render.yaml. Without it the box-score indices do
	// not fit and the server dies partway through a capture, which reads as a
	// pile of missing markers rather than as the memory problem it is.
	const server = spawn('node', ['--max-old-space-size=400', 'server.js'], {
		env: { ...process.env, PORT },
		stdio: 'ignore',
	});
	try {
		await waitForServer();

		// Fingerprint first: if this matches the other capture's, the comparison
		// is between a build and itself and nothing below can mean anything.
		const sources = [];
		for (const s of SOURCES) {
			const res = await fetch(ORIGIN + s);
			sources.push(res.ok ? await res.text() : '');
		}
		const fingerprint = sha(sources.join('\n'));

		const pages = {};
		const failures = [];
		for (const { path, markers, pixels: wantPixels = true } of PAGES) {
			const slug = path.replace(/[^a-z0-9]/gi, '_');
			const html = normalise(await dumpDom(ORIGIN + path));
			const absent = missingMarkers(html, markers);
			if (absent.length) failures.push(`${path} is missing: ${absent.join(', ')}`);
			writeFileSync(join(outDir, `${slug}.html`), html);

			let pixels = null;
			if (wantPixels) {
				const png = resolve(outDir, `${slug}.png`);
				await screenshot(ORIGIN + path, png);
				pixels = existsSync(png) ? sha(readFileSync(png)) : null;
				if (!pixels) failures.push(`${path} produced no screenshot`);
			}

			pages[path] = { digest: sha(html), bytes: html.length, pixels };
			const how = wantPixels ? 'dom+pixels' : 'dom only  ';
			console.log(`  ${absent.length ? 'EMPTY' : 'ok   '} ${how}  ${path}  ${html.length} bytes`);
		}

		writeFileSync(join(outDir, 'manifest.json'),
			`${JSON.stringify({ fingerprint, pages }, null, '\t')}\n`);

		if (failures.length) {
			console.error('\npages did not render what they should have:');
			for (const f of failures) console.error(`  ${f}`);
			console.error('a comparison against this capture would be worthless');
			return 1;
		}
		console.log(`\ncaptured ${PAGES.length} pages to ${outDir}  (build ${fingerprint.slice(0, 12)})`);
		return 0;
	} finally {
		server.kill();
	}
}

function diff(beforeDir, afterDir) {
	const read = (d) => JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8'));
	const report = compare(read(beforeDir), read(afterDir));

	for (const p of report.problems) console.error(`REFUSED: ${p}`);
	if (report.problems.length) return 1;

	for (const p of report.same) console.log(`  identical            ${p}`);
	for (const d of report.differs) {
		// Which of the two moved is the whole diagnosis. Pixels alone means a
		// stylesheet changed what the page looks like without changing what it
		// says — which is the single-column bug exactly.
		const what = d.dom && d.pixels ? 'DOM and pixels' : d.dom ? 'DOM only      ' : 'PIXELS only   ';
		console.log(`  ${what}       ${d.path}`);
	}
	for (const p of report.missing) console.log(`  only in one capture  ${p}`);

	console.log(`\n${report.same.length} identical, ${report.differs.length} differing`);
	if (report.differs.length) {
		console.log('\nTo see what changed:');
		for (const d of report.differs) {
			const slug = d.path.replace(/[^a-z0-9]/gi, '_');
			if (d.dom) console.log(`  diff ${join(beforeDir, slug)}.html ${join(afterDir, slug)}.html`);
			if (d.pixels) console.log(`  compare ${join(beforeDir, slug)}.png ${join(afterDir, slug)}.png`);
		}
	}
	// Differences are not failures. A refactor should produce none; a change to
	// what the page says should produce exactly the ones intended, and only a
	// person can say which this is.
	return 0;
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'capture' && a) process.exit(await capture(a));
else if (cmd === 'diff' && a && b) process.exit(diff(a, b));
else if (cmd) {
	console.error(`unknown command: ${cmd}`);
	process.exit(2);
}
