import test from 'node:test'
import assert from 'node:assert/strict'
import { hyphenRecord, lastMeetings, recentFormParts, rec, streakBannerHtml } from '../records-core.js'

// Step 3 out of main.js. updateStreakBanner was 105 lines here against 62 on the
// football site — the largest divergence between the two files. The six
// sentences are identical; the recent-form line under them is baseball's alone.

/** Daily games from an April opener, so day counts are one apart. */
const run = (results, startDay = 5) =>
	[...results].map((code, i) => ({
		result: { W: 'WIN', L: 'LOSS', T: 'TIE' }[code],
		date: new Date(2011, 3, startDay + i),
	}))

const past = (results) => streakBannerHtml(run(results), { isPastSeason: true })
const live = (results) => streakBannerHtml(run(results), { isPastSeason: false })

// --- the six sentences, which must stay identical to the football repo's ---

test('no games played means no banner at all', () => {
	assert.equal(streakBannerHtml([], { isPastSeason: true }), null)
})

test('games are ordered before counting, whatever order they arrive in', () => {
	const games = run('WWL')
	assert.match(streakBannerHtml([games[2], games[0], games[1]], { isPastSeason: true }), /2 games/)
})

test('a finished season with no losses says so, with its record', () => {
	assert.equal(past('WWWW'), 'Finished the regular season undefeated &mdash; <strong>4-0</strong>')
})

test('a finished season that opened with a defeat says the opener was lost', () => {
	assert.equal(past('LWWW'),
		'Lost the opener &mdash; undefeated for <strong>0 games</strong> to start the season')
})

test('a finished season counts the opening run and how long it lasted', () => {
	assert.equal(past('WWWL'),
		'Undefeated for <strong>3 games</strong> (3 days) to start the season before first loss')
})

test('a tie ends the opening run, and the sentence calls it a loss', () => {
	// Pinned, not endorsed — the same behaviour the football repo pins, where it
	// bites harder: 1929 went 12-0-1 and its front page calls game 11 a defeat.
	// ROADMAP.md carries the candidate wordings; it is a copy decision.
	assert.match(past('WWTW'), /^Undefeated for <strong>2 games<\/strong>/)
})

test('a current season with no losses reports the live streak', () => {
	assert.equal(live('WWW'), 'Undefeated to start the season &mdash; <strong>3</strong>-game win streak')
})

test('a current season that lost its opener reports only the streak since', () => {
	assert.equal(live('LWW'), 'Lost the opener. Currently on a <strong>2-game</strong> win streak.')
})

test('a current season reports the opening run and the streak it is on now', () => {
	assert.equal(live('WWLWW'),
		'The Brewers started the season undefeated for <strong>2 games</strong> (2 days). ' +
		'Currently on a <strong>2-game</strong> win streak.')
})

test('the team name comes from the site manifest', () => {
	assert.match(
		streakBannerHtml(run('WWLW'), { isPastSeason: false, site: { team: 'Packers' } }),
		/^The Packers started the season/,
	)
})

// --- the record helper, which is not the one three functions up ---

test('records in the banner use hyphens, not the en dashes rec uses', () => {
	// These two look the same in a diff and are different bytes on the page.
	// Folding them together would change the rendered text with every test green.
	assert.equal(hyphenRecord(run('WWL')), '2-1')
	assert.equal(rec(2, 1, 0), '2–1')
	assert.notEqual(hyphenRecord(run('WWL')), rec(2, 1, 0))
})

test('a tie shows in the record, and only when there is one', () => {
	assert.equal(hyphenRecord(run('WWT')), '2-0-1')
	assert.equal(hyphenRecord(run('WW')), '2-0')
})

// --- recent form, which the football site has no equivalent of ---

test('the last ten line appears only once ten games have been played', () => {
	const nine = recentFormParts(run('WWWWWWWWW'), new Date(2011, 3, 20))
	assert.equal(nine.filter((p) => p.startsWith('Last 10')).length, 0)
	const ten = recentFormParts(run('WWWWWWWWWW'), new Date(2011, 3, 20))
	assert.equal(ten.filter((p) => p.startsWith('Last 10')).length, 1)
})

test('the last ten line counts the last ten, not the first', () => {
	// Ten losses then ten wins: the line reads 10-0, not 0-10 or 10-10.
	const games = run('LLLLLLLLLLWWWWWWWWWW')
	const [lastTen] = recentFormParts(games, new Date(2011, 3, 30))
	assert.equal(lastTen, 'Last 10: <strong>10-0</strong>')
})

test('the month line covers this calendar month only', () => {
	const games = [
		{ result: 'WIN', date: new Date(2011, 2, 30) },  // March
		{ result: 'LOSS', date: new Date(2011, 3, 2) },  // April
		{ result: 'WIN', date: new Date(2011, 3, 3) },
	]
	const parts = recentFormParts(games, new Date(2011, 3, 20))
	assert.deepEqual(parts, ['April: <strong>1-1</strong>'])
})

test('the same month in a different year does not count', () => {
	const games = [{ result: 'WIN', date: new Date(2010, 3, 2) }]
	assert.deepEqual(recentFormParts(games, new Date(2011, 3, 20)), [])
})

test('a month with no games contributes no line', () => {
	const games = [{ result: 'WIN', date: new Date(2011, 2, 30) }]
	assert.deepEqual(recentFormParts(games, new Date(2011, 3, 20)), [])
})

// --- meetings with the next opponent ---

const meeting = (franchise, result, date) => ({ franchise, result, date })

test('only decided meetings with that franchise count', () => {
	const rows = [
		meeting('CHN', 'WIN', '2011-04-01'),
		meeting('CHN', '', '2011-04-02'),
		meeting('SLN', 'WIN', '2011-04-03'),
	]
	const got = lastMeetings(rows, 'CHN')
	assert.equal(got.length, 1)
	assert.equal(got[0].date, '2011-04-01')
})

test('the most recent meetings are taken, oldest first', () => {
	const rows = Array.from({ length: 15 }, (_, i) =>
		meeting('CHN', 'WIN', `2011-04-${String(i + 1).padStart(2, '0')}`))
	const got = lastMeetings(rows, 'CHN')
	assert.equal(got.length, 10)
	assert.equal(got[0].date, '2011-04-06', 'oldest of the last ten')
	assert.equal(got[9].date, '2011-04-15', 'and the newest is last')
})

test('fewer than ten meetings returns what there is', () => {
	const rows = [meeting('CHN', 'WIN', '2011-04-01'), meeting('CHN', 'LOSS', '2011-04-02')]
	assert.equal(lastMeetings(rows, 'CHN').length, 2)
})
