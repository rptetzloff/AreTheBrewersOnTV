// What the ESPN proxy may fetch: the four endpoints the site calls, with the
// query parameters each one uses. Anything else is refused.
//
// The proxy used to forward any path under `apis/` and any query string to
// site.api.espn.com. The host was fixed, so it could not be pointed elsewhere,
// but it would fetch, and cache up to 500 of, whatever ESPN URL a stranger
// asked for. CodeQL flagged it as request forgery (alert #4).
//
// The URL sent upstream is built from this table and from numbers, never from
// the request's own strings: the path is the table's, and every parameter is
// parsed to an integer and written back. Every parameter the site sends is
// numeric, so nothing is lost.

const BASE = 'https://site.api.espn.com/';

const ENDPOINTS = new Map([
	['apis/site/v2/sports/baseball/mlb/teams/mil/schedule', ['season', 'seasontype']],
	['apis/site/v2/sports/baseball/mlb/scoreboard', []],
	['apis/site/v2/sports/baseball/mlb/summary', ['event']],
	['apis/v2/sports/baseball/mlb/standings', ['group', 'season', 'level']],
].map(([path, params]) => [path, { path, params }]));

/** The upstream URL for a proxied request, or null to refuse it.
 *  `path` is the part after /api/espn/; `search` is the raw query string. */
export function espnTarget(path, search = '') {
	const endpoint = ENDPOINTS.get(path);
	if (!endpoint) return null;
	const given = new URLSearchParams(search);
	for (const key of given.keys()) if (!endpoint.params.includes(key)) return null;
	const out = new URLSearchParams();
	for (const name of endpoint.params) {
		const value = given.get(name);
		if (value === null) continue;
		if (!/^\d{1,12}$/.test(value)) return null;
		out.set(name, String(Number.parseInt(value, 10)));
	}
	const query = out.toString();
	return `${BASE}${endpoint.path}${query ? `?${query}` : ''}`;
}
