/** The public origin, as it should appear in canonical and og: tags.
 *
 *  Lifted out of server.js so it can be tested, which it never was.
 *
 *  PUBLIC_ORIGIN wins when set, because the canonical URL is a fact about the
 *  site rather than about whichever request happened to arrive. Deriving it from
 *  headers has two failure modes, and both were live:
 *
 *  1. A proxy that does not forward the scheme. On Coolify the app saw no
 *     x-forwarded-proto, fell back to 'http', and emitted
 *     `og:url content="http://dev.arethepackersundefeated.com/records"` on an
 *     HTTPS page. It looked fine in a browser because the proxy rewrites href
 *     attributes to https — so `<link rel="canonical">` was corrected and the
 *     og: tags, being meta content, were not. Two tags built from one variable
 *     disagreeing in the served HTML is what made it visible at all.
 *
 *  2. Any Host header becomes the canonical URL. Reach the app by its container
 *     name, its IP, or a stray domain pointed at the same proxy, and every
 *     canonical tag on the page advertises that instead.
 *
 *  The header path stays as the fallback, because it is what Render has always
 *  used and it works there.
 */
export function originOf(req, env = process.env) {
	// A trailing slash here would produce `//records` in every URL built from it.
	if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/+$/, '');
	// x-forwarded-proto can be a list when more than one proxy is in front:
	// "https, http". The first entry is the one the client spoke.
	const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
	const host = req.headers['x-forwarded-host'] || req.headers.host;
	return `${proto}://${host}`;
}
