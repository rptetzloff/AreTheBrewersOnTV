import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCalendar, gameEvent, icsText, foldLine } from '../lib/calendar.js'
import { parseTvLookup } from '../tv-core.js'

const L = parseTvLookup(
	'key,alias,display_name,type,amherst\nFOX,,FOX,broadcast,11 (WZAW) | 1 (WLUK)\nFS1,,FS1,cable,49\nMLB.TV,,MLB.TV,streaming,\nRadio,,Radio,radio,',
	'provider,display_name,service_areas\namherst,Amherst Communications,"Portage | Waushara"',
)
const NOW = new Date('2026-10-14T12:00Z')
const ORIGIN = 'https://arethebrewersontv.com'

const game = ({ id = '1', date = '2026-10-15T00:08Z', status = 'STATUS_SCHEDULED', home = false, scores = null, tv = ['FS1'], note = 'NLCS - Game 3', timeValid = true, t = 'post' } = {}) => ({
	id, date, _t: t,
	competitions: [{
		timeValid,
		notes: note ? [{ headline: note }] : [],
		status: { type: { name: status } },
		venue: { fullName: 'Dodger Stadium' },
		competitors: [
			{ homeAway: home ? 'home' : 'away', team: { abbreviation: 'MIL' }, score: scores && { value: scores[0] } },
			{ homeAway: home ? 'away' : 'home', team: { abbreviation: 'LAD', shortDisplayName: 'Dodgers' }, score: scores && { value: scores[1] } },
		],
		broadcasts: [...tv.map((n) => ({ media: { shortName: n }, type: { shortName: 'TV' } })), { media: { shortName: 'MLB.TV' }, type: { shortName: 'Streaming' } }],
	}],
})
const field = (lines, name) => lines.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`))
const ev = (g, opts = {}) => gameEvent(g, L, new Map(), { origin: ORIGIN, now: NOW, ...opts })

test('an upcoming game is titled with the channel and the provider\'s number for it', () => {
	assert.equal(field(ev(game()), 'SUMMARY'), 'SUMMARY:Brewers @ Dodgers · FS1')
	assert.equal(field(ev(game(), { provider: 'amherst' }), 'SUMMARY'), 'SUMMARY:Brewers @ Dodgers · FS1 49')
	// The service area picks the number.
	assert.equal(field(ev(game({ tv: ['FOX'], home: true }), { provider: 'amherst', area: 1 }), 'SUMMARY'), 'SUMMARY:Brewers vs Dodgers · FOX 1 (WLUK)')
})

test('a finished game is titled with the result', () => {
	assert.equal(field(ev(game({ status: 'STATUS_FINAL', scores: [7, 4] })), 'SUMMARY'), 'SUMMARY:W 7–4 @ Dodgers')
	assert.equal(field(ev(game({ status: 'STATUS_FINAL', scores: [2, 3] })), 'SUMMARY'), 'SUMMARY:L 2–3 @ Dodgers')
})

test('a postponed game is cancelled, and a game with no start time is all day', () => {
	const p = ev(game({ status: 'STATUS_POSTPONED' }))
	assert.ok(p.includes('STATUS:CANCELLED'))
	assert.match(field(p, 'SUMMARY'), /^SUMMARY:Postponed: /)
	const tbd = ev(game({ timeValid: false }))
	assert.equal(field(tbd, 'DTSTART'), 'DTSTART;VALUE=DATE:20261014')
	assert.equal(field(tbd, 'DTEND'), undefined)
})

test('a game runs three hours from its UTC start, and keeps the same UID across fetches', () => {
	const lines = ev(game())
	assert.equal(field(lines, 'DTSTART'), 'DTSTART:20261015T000800Z')
	assert.equal(field(lines, 'DTEND'), 'DTEND:20261015T030800Z')
	assert.equal(field(lines, 'UID'), 'UID:1@arethebrewersontv.com')
})

test('the description lists TV, streaming and the round, with numbers when there is a provider', () => {
	const d = field(ev(game(), { provider: 'amherst' }), 'DESCRIPTION')
	assert.match(d, /NLCS - Game 3\\nTV: FS1 49\\nStreaming: MLB.TV/)
	assert.match(d, /Channel numbers for Amherst Communications/)
})

test('spring training is left out of the calendar', () => {
	const ics = buildCalendar([game({ id: 'spring', t: 'pre' }), game({ id: 'real', t: 'regular' })], L, new Map(), { origin: ORIGIN, now: NOW })
	assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1)
	assert.match(ics, /UID:real@/)
})

test('text is escaped and long lines are folded at 75 octets with CRLF', () => {
	assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne')
	const folded = foldLine(`DESCRIPTION:${'é'.repeat(60)}`)
	const parts = folded.split('\r\n')
	assert.ok(parts.length > 1)
	for (const p of parts) assert.ok(Buffer.byteLength(p) <= 75, p)
	assert.ok(parts.slice(1).every((p) => p.startsWith(' ')))
	assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), `DESCRIPTION:${'é'.repeat(60)}`)
	const ics = buildCalendar([game()], L, new Map(), { origin: ORIGIN, now: NOW })
	assert.ok(ics.endsWith('\r\n'))
	assert.ok(!/[^\r]\n/.test(ics), 'every line ends CRLF')
})

test('the calendar is named for the provider', () => {
	assert.match(buildCalendar([], L, new Map(), { provider: 'amherst', origin: ORIGIN, now: NOW }), /X-WR-CALNAME:Brewers on TV · Amherst Communications/)
})
