// Browser modules, served with every local import versioned:
// `from './player-search.js'` goes out as `from './player-search.js?v=…'`.
//
// Cloudflare's browser cache TTL turns the no-cache this server sends for an
// unversioned .js into four hours, and the imports used to be unversioned:
// after the compare page shipped, a browser ran the new compare.js against
// the player-search.js it already had, which ignored the compare page's
// onPick and opened the player page instead. A module's version is the hash
// of its rewritten body, which carries its imports' versions, so a change
// anywhere below an entry script changes that script's URL too, and every
// URL is safe to cache for good.
//
// Every version also carries the release: a hash of the site's code files,
// so each release gives every script and stylesheet a new URL and every
// browser fetches them all again, whether that file changed or not. A copy
// left stale in a browser by some past mistake cannot outlive one release.
// (October 2026: a rolling deploy left an old game.js cached under the new
// release's URL.) The servers of one release compute the same id, which
// matters while old and new overlap during a deploy.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix, extname } from 'node:path';

export const hash8 = (body) => createHash('sha1').update(body).digest('hex').slice(0, 8);

const CODE = new Set(['.js', '.mjs', '.html', '.css']);

/** The release: a hash of the site's code — the top-level .js/.html/.css
 *  files, lib/, and package.json — by name and content, in a fixed order.
 *  Any release that changes code changes it; a data-only update under
 *  data/ does not, since no script changed. */
export function releaseId(root) {
	const h = createHash('sha1');
	const files = [
		...readdirSync(root).filter((f) => CODE.has(extname(f))),
		...readdirSync(join(root, 'lib')).filter((f) => CODE.has(extname(f))).map((f) => `lib/${f}`),
		'package.json',
	].sort();
	for (const f of files) {
		let body = '';
		try { body = readFileSync(join(root, f)); } catch { continue; }
		h.update(f).update('\0').update(body).update('\0');
	}
	return h.digest('hex').slice(0, 8);
}

// `from './x.js'`, `from "../x.js"`, `import '/x.js'` — static imports and
// re-exports of a local file. Bare specifiers (node:fs) are not touched.
const LOCAL_IMPORT = /(\bfrom\s*|\bimport\s*)(['"])(\.{1,2}\/|\/)([\w./-]+\.js)\2/g;

/** A loader over `root`: module(file) -> { body, version } for a path
 *  relative to root ("compare.js", "lib/x.js"), or null when it is not
 *  there. Each file is read and rewritten once. `release` (releaseId) goes
 *  into every version, so a new release changes them all. */
export function browserModules(root, { release = '' } = {}) {
	const cache = new Map();
	function module(file, visiting = new Set()) {
		if (cache.has(file)) return cache.get(file);
		// A cycle would have no version that settles; none exists today, and
		// the import that closes the loop is left unversioned rather than hang.
		if (visiting.has(file)) return null;
		visiting.add(file);
		let raw;
		try { raw = readFileSync(join(root, file), 'utf8'); } catch { return null; }
		const body = raw.replace(LOCAL_IMPORT, (whole, lead, q, prefix, path) => {
			const target = prefix === '/' ? path : posix.normalize(posix.join(posix.dirname(file), prefix + path));
			const dep = module(target, visiting);
			return dep ? `${lead}${q}${prefix}${path}?v=${dep.version}${q}` : whole;
		});
		const mod = { body, version: hash8(release + body) };
		cache.set(file, mod);
		return mod;
	}
	return module;
}
