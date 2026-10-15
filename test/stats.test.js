import test from 'node:test'
import assert from 'node:assert/strict'
import { seasonBatting, seasonPitching, seasonFielding, seasonFieldingTotals, regularGidsBySeason, careerLines, leaderboard, buildLeaders, BATTING_BOARDS, PITCHING_BOARDS, playerSeasons, parseBios, bornOn, PLAYER_ID } from '../stats-core.js'
import { game } from './helpers/rows.js'

const MIL = new Set(['MIL'])
const names = new Map([['yount', 'Robin Yount'], ['vuck', 'Pete Vuckovich']])
// One index line, with every field the index carries defaulting to zero.
const bat = (id, team, f = {}) => ({ id, team, pa: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, hbp: 0, sf: 0, sh: 0, gdp: 0, ...f })
const pit = (id, team, f = {}) => ({ id, team, ipouts: 0, bf: 0, h: 0, hr: 0, r: 0, er: 0, bb: 0, k: 0, hbp: 0, wp: 0, bk: 0, gs: false, gf: false, isWp: false, isLp: false, isSave: false, ...f })

test('batting totals sum across games, and rates come from the totals', () => {
	const index = new Map([
		['g1', [bat('yount', 'MIL', { pa: 5, ab: 4, h: 2, d: 1, hr: 1, bb: 1, rbi: 3 }), bat('opp', 'NYA', { ab: 4, h: 4 })]],
		['g2', [bat('yount', 'MIL', { pa: 4, ab: 3, h: 1, t: 1, hbp: 1 })]],
		['g3', [bat('yount', 'MIL', { pa: 4, ab: 4, h: 0, k: 2 })]],
	])
	const [y] = seasonBatting(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.equal(y.name, 'Robin Yount')
	assert.equal(y.g, 3)
	assert.deepEqual([y.ab, y.h, y.d, y.t, y.hr, y.tb], [11, 3, 1, 1, 1, 9])
	assert.equal(y.avg, 3 / 11)
	assert.equal(y.obp, (3 + 1 + 1) / (11 + 1 + 1 + 0)) // (H+BB+HBP)/(AB+BB+HBP+SF)
	assert.equal(y.slg, 9 / 11)
	assert.equal(y.ops, y.obp + y.slg)
})

test('a player with no at-bats has no average, not .000', () => {
	const index = new Map([['g1', [bat('yount', 'MIL', { pa: 1, bb: 1 })]]])
	const [y] = seasonBatting(index, ['g1'], names, MIL)
	assert.equal(y.avg, null)
	assert.equal(y.slg, null)
	assert.equal(y.ops, null)
	assert.equal(y.obp, 1)
})

test('pitching sums innings, decisions and ERA from the lines', () => {
	const index = new Map([
		['g1', [pit('vuck', 'MIL', { ipouts: 27, er: 2, h: 7, bb: 2, k: 6, gs: true, isWp: true })]],
		['g2', [pit('vuck', 'MIL', { ipouts: 20, er: 4, h: 8, bb: 3, k: 3, gs: true, isLp: true })]],
		['g3', [pit('vuck', 'MIL', { ipouts: 3, isSave: true })]],
	])
	const [v] = seasonPitching(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.deepEqual([v.g, v.gs, v.w, v.l, v.sv, v.ip], [3, 2, 1, 1, 1, '16.2'])
	assert.equal(v.era, (27 * 6) / 50)
	assert.equal(v.whip, (3 * (5 + 15)) / 50)
})

test('a pitcher with no outs recorded has no ERA', () => {
	const index = new Map([['g1', [pit('vuck', 'MIL', { er: 3, h: 3 })]]])
	assert.equal(seasonPitching(index, ['g1'], names, MIL)[0].era, null)
})

test('fielding is one line per position, and pinch roles have none', () => {
	const fld = (pos, f = {}) => ({ id: 'yount', team: 'MIL', pos, po: 0, a: 0, e: 0, dp: 0, gs: false, ...f })
	const index = new Map([
		['g1', [fld(6, { po: 2, a: 4, e: 1, gs: true })]],
		['g2', [fld(6, { po: 1, a: 3, dp: 1, gs: true }), fld(8, { po: 2 })]],
		['g3', [fld(11)]],
	])
	const lines = seasonFielding(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.deepEqual(lines.map((l) => [l.pos, l.g, l.gs, l.po, l.a, l.e, l.dp]), [['SS', 2, 2, 3, 7, 1, 1], ['CF', 1, 0, 2, 0, 0, 0]])
	assert.equal(lines[0].fpct, 10 / 11)
})

// MLB counts a tiebreaker in regular-season stats. Without it Christian
// Yelich's 2018 came out .323 with 184 hits, not his official .326 and 187.
test('a tiebreaker game counts toward the season; a playoff game does not', () => {
	const rows = [
		{ ...game({ date: '2018-09-30' }), gid: 'reg' },
		{ ...game({ date: '2018-10-01', regular: false, gametype: 'T' }), gid: 'g163' },
		{ ...game({ date: '2018-10-04', regular: false, gametype: 'D' }), gid: 'nlds' },
	]
	assert.deepEqual(regularGidsBySeason(rows).get(2018), ['reg', 'g163'])
})

// Retrosheet gives every pitcher a batting line, so a DH-era season listed
// the whole staff at 0 PA under the hitters.
test('a player who never came to the plate has no batting line', () => {
	const index = new Map([['g1', [bat('yount', 'MIL', { pa: 4, ab: 4, h: 1 }), bat('vuck', 'MIL')]]])
	assert.deepEqual(seasonBatting(index, ['g1'], names, MIL).map((p) => p.name), ['Robin Yount'])
})

// --- careers and leaderboards ---

/** A season table from hand-made batting lines, through the real function. */
const seasonOf = (season, lines) => ({
	season,
	batting: seasonBatting(new Map(lines.map((l, i) => [`${season}-${i}`, [l]])), lines.map((_, i) => `${season}-${i}`), names, MIL),
	pitching: [],
})

test('a career average is career hits over career at-bats, not the mean of season averages', () => {
	// .500 in 2 at-bats and .200 in 100: the mean of the averages is .350,
	// the career is 21 for 102.
	const seasons = [
		seasonOf(1974, [bat('yount', 'MIL', { pa: 2, ab: 2, h: 1 })]),
		seasonOf(1975, [bat('yount', 'MIL', { pa: 100, ab: 100, h: 20 })]),
	]
	const [y] = careerLines(seasons).batting
	assert.equal(y.h, 21)
	assert.equal(y.avg, 21 / 102)
	assert.deepEqual([y.first, y.last, y.seasons], [1974, 1975, 2])
})

test('a rate board leaves out anyone short of the qualifier, however good their rate', () => {
	const avg = BATTING_BOARDS.find((b) => b.key === 'avg')
	const lines = [
		{ id: 'a', name: 'Cup of Coffee', avg: 1, pa: 3, season: 1980 },
		{ id: 'b', name: 'Everyday Player', avg: 0.3, pa: 600, season: 1980 },
	]
	assert.deepEqual(leaderboard(lines, avg, { qualifies: (l) => l.pa >= 502 }).map((l) => l.name), ['Everyday Player'])
})

test('ERA ranks low to high, and ties keep the earlier season first', () => {
	const era = PITCHING_BOARDS.find((b) => b.key === 'era')
	const lines = [
		{ id: 'x', name: 'Later', era: 2.5, season: 2004 },
		{ id: 'y', name: 'Worse', era: 4.0, season: 1990 },
		{ id: 'z', name: 'Earlier', era: 2.5, season: 1978 },
	]
	assert.deepEqual(leaderboard(lines, era).map((l) => l.name), ['Earlier', 'Later', 'Worse'])
})

test('single-season rate boards use 3.1 plate appearances per team game, so a short season needs fewer', () => {
	// 1981 was 109 games: 3.1 x 109 = 337.9 PA qualifies. A full season
	// needs 502.2, so the same 340 PA does not.
	const seasons = [
		seasonOf(1981, [bat('cooper', 'MIL', { pa: 340, ab: 300, h: 100 })]),
		seasonOf(1982, [bat('yount', 'MIL', { pa: 340, ab: 300, h: 110 })]),
	]
	const L = buildLeaders(seasons, new Map([[1981, 109], [1982, 162]]))
	const avg = L.single.batting.find((b) => b.key === 'avg')
	assert.deepEqual(avg.leaders.map((l) => [l.name, l.season]), [[names.get('cooper') || 'cooper', 1981]])
})

// --- fielding across positions ---

test('a fielding total counts a game once however many positions he played in it, and leaves out DH', () => {
	const fld = (gid, pos, f = {}) => ({ id: 'yount', team: 'MIL', pos, po: 0, a: 0, e: 0, dp: 0, gs: false, ...f })
	const index = new Map([
		// Started in left, moved to center: one game, one start.
		['g1', [fld('g1', 7, { po: 2, gs: true }), fld('g1', 8, { po: 3 })]],
		['g2', [fld('g2', 8, { po: 4, e: 1, gs: true })]],
		// A DH game: no fielding, and not a game in the field.
		['g3', [fld('g3', 10, { gs: true })]],
	])
	const [t] = seasonFieldingTotals(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.deepEqual([t.g, t.gs, t.po, t.e, t.positions, t.posList], [2, 2, 9, 1, 2, 'LF, CF'])
	assert.equal(t.fpct, 9 / 10)
	// The per-position lines add up to three games; the total is two.
	const byPos = seasonFielding(index, ['g1', 'g2', 'g3'], names, MIL).filter((l) => l.pos !== 'DH')
	assert.equal(byPos.reduce((s, l) => s + l.g, 0), 3)
})

test('a player page carries each season\'s fielding total and an all-positions career line', () => {
	const t = (season, g, po, positions) => ({ id: 'yount', name: 'Robin Yount', pos: 'All', positions, g, gs: g, po, a: 0, e: 0, dp: 0, fpct: 1 })
	const seasons = [
		{ season: 1984, batting: [], pitching: [], fielding: [{ id: 'yount', name: 'Robin Yount', pos: 'SS', g: 120 }], fieldingTotals: [t(1984, 120, 197, 1)] },
		{ season: 1985, batting: [], pitching: [], fielding: [{ id: 'yount', name: 'Robin Yount', pos: '1B', g: 2 }, { id: 'yount', name: 'Robin Yount', pos: 'LF', g: 69 }], fieldingTotals: [t(1985, 70, 152, 2)] },
	]
	const p = playerSeasons(seasons, 'yount')
	assert.deepEqual(p.fieldingTotals.map((x) => [x.season, x.g]), [[1984, 120], [1985, 70]])
	assert.deepEqual([p.career.fielding.g, p.career.fielding.po, p.career.fielding.positions], [190, 349, 3])
})

// --- born on this day ---

test('Brewers born on a day: longest Brewers career first, then the earliest born', () => {
	const directory = [
		{ id: 'cupof001', name: 'Cup of Coffee', first: 1999, last: 1999 },
		{ id: 'younr001', name: 'Robin Yount', first: 1974, last: 1993 },
		{ id: 'other001', name: 'Other Day', first: 1980, last: 1990 },
		{ id: 'older001', name: 'Older Coffee', first: 1970, last: 1970 },
	]
	const bios = new Map([
		['cupof001', { born: '1975-09-16' }], ['younr001', { born: '1955-09-16' }],
		['other001', { born: '1955-09-17' }], ['older001', { born: '1940-09-16' }],
	])
	assert.deepEqual(bornOn(directory, bios, '09-16').map((b) => [b.name, b.year]),
		[['Robin Yount', 1955], ['Older Coffee', 1940], ['Cup of Coffee', 1975]])
	assert.deepEqual(bornOn(directory, bios, '01-01'), [])
})

// --- player pages ---

test('a player page gathers his seasons, skips the ones he missed, and totals a career', () => {
	const seasons = [
		{ ...seasonOf(1974, [bat('yount', 'MIL', { pa: 364, ab: 344, h: 86 })]), fielding: [{ id: 'yount', name: 'Robin Yount', pos: 'SS', g: 107 }] },
		{ ...seasonOf(1975, [bat('other', 'MIL', { pa: 10, ab: 10, h: 2 })]), fielding: [] },
		{ ...seasonOf(1976, [bat('yount', 'MIL', { pa: 690, ab: 638, h: 161 })]), fielding: [] },
	]
	const p = playerSeasons(seasons, 'yount')
	assert.equal(p.name, 'Robin Yount')
	assert.deepEqual([p.first, p.last, p.seasons], [1974, 1976, 2])
	assert.deepEqual(p.batting.map((l) => l.season), [1974, 1976])
	assert.equal(p.career.batting.h, 247)
	assert.equal(p.career.pitching, null)
	assert.deepEqual(p.fielding.map((l) => [l.season, l.pos]), [[1974, 'SS']])
	assert.equal(playerSeasons(seasons, 'nobody'), null)
})

test('player ids are checked before they reach anything', () => {
	for (const ok of ['younr001', 'burnc002', 'a-rod001']) assert.ok(PLAYER_ID.test(ok), ok)
	for (const bad of ['', '../etc/pa', 'younr00', 'YOUNR001', 'younr001x', 'you<r001']) assert.ok(!PLAYER_ID.test(bad), bad)
})

test('bios come out of biofile for the ids asked for only, with dates as dates', () => {
	const csv = [
		'id,lastname,usename,fullname,birthdate,birthcity,birthstate,birthcountry,deathdate,debut_p,bats,throws,height,weight,HOF',
		'younr001,Yount,Robin,Robin R. Yount,19550916,Danville,Illinois,USA,,19740405,R,R,72,165,HOF',
		'higut001,Higuera,Teddy,Teodoro Valenzuela Higuera,19581109,Los Mochis,Sinaloa,Mexico,,19850410,B,L,70,178,',
		'ruthb101,Ruth,Babe,"George Herman Ruth, Jr.",18950206,Baltimore,Maryland,USA,19480816,19140711,L,L,74,215,HOF',
	].join('\n')
	const bios = parseBios(csv, new Set(['younr001', 'higut001']))
	assert.deepEqual([...bios.keys()], ['younr001', 'higut001'])
	const y = bios.get('younr001')
	assert.deepEqual([y.born, y.birthplace, y.debut, y.height, y.hof], ['1955-09-16', 'Danville, Illinois', '1974-04-05', 72, true])
	// Outside the US the country is part of the birthplace.
	assert.equal(bios.get('higut001').birthplace, 'Los Mochis, Sinaloa, Mexico')
	// A quoted comma does not shift the columns after it.
	assert.equal(parseBios(csv, new Set(['ruthb101'])).get('ruthb101').died, '1948-08-16')
})
