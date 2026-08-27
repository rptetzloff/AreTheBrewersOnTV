import test from 'node:test'
import assert from 'node:assert/strict'
import { SITE } from '../site.js'
import { RECORD_SLUGS, computeSeasonHistory, computeSuperlatives, historyCopy, recordsCopy } from '../records-core.js'
import { computeHeadToHead, h2hCopy, meetings, slugifyOpponent, streakSentence } from '../h2h-core.js'
import { LONG_AFTER, game, season } from './helpers/rows.js'

// Deliberately parallel to the Packers repo's file of the same name. Swapping
// the manifest has to change the output, or the manifest is decoration — and
// the property would rot silently, because the site looks right either way.

/** A deliberately unlike-baseball manifest. Fictional on purpose: using the
 *  real football one would make a failure here ambiguous between "the wiring
 *  is wrong" and "Green Bay's copy reads oddly in a Milwaukee sentence". */
const OTHER = {
	team: 'Otters',
	fullName: 'Ocean City Otters',
	scoreNoun: 'goals',
	championship: 'Otter Cup',
	leaderNoun: 'skipper',
	leaderPlural: 'skippers',
	losslessSeasonNoun: 'Unbeaten',
	meetingNoun: 'clash',
	meetingPlural: 'clashes',
	streaksSpanSeasons: true,
	perfectSeasonIsPlausible: true,
	records: ['best-starts'],
	copy: {
		noWorldSeries: 'The Otters have never reached the final.',
		noPlayoffs: 'The Otters have never qualified.',
		noLosingStreak: 'The Otters lose in ones.',
		noTies: 'The Otters have never drawn.',
		noNoHitter: 'Not a thing in this sport.',
		noPerfectGame: 'Also not a thing.',
		noTriplePlay: 'Definitely not a thing.',
		worstLossAside: 'It was windy.',
		worstStartAside: 'The season is long.',
	},
}

const supers = computeSuperlatives(
	[...season(2018, 'WWWWL'), ...season(2019, 'LLLW')], { now: LONG_AFTER },
)
const history = computeSeasonHistory(season(2018, 'WWL'), { now: LONG_AFTER })

test('the manifest names this site', () => {
	assert.equal(SITE.team, 'Brewers')
	assert.equal(SITE.fullName, 'Milwaukee Brewers')
	assert.equal(SITE.championship, 'World Series')
})

// The two nouns that differ from the football site and are the reason one repo
// has managers.html and the other coaches.html.
test('the sport vocabulary is baseball', () => {
	assert.equal(SITE.scoreNoun, 'runs')
	assert.equal(SITE.leaderNoun, 'manager')
	assert.equal(SITE.leaderPlural, 'managers')
})

// The one place the two sites' compute functions genuinely disagree, now
// stated as a value rather than as a difference between two implementations.
test('the manifest declares that streaks do not span seasons', () => {
	assert.equal(SITE.streaksSpanSeasons, false)
})

// Documents rather than drives, for now: the streak loop still hardcodes the
// boundary check. When the two cores merge, this value is what the merged one
// reads — and this test is what catches it being read backwards.
test('the declared streak rule matches what the code actually does', () => {
	const rows = [...season(2020, 'WWW'), ...season(2021, 'WWW')]
	const [longest] = computeSuperlatives(rows, { now: LONG_AFTER }).winStreaks
	const spanned = longest.startSeason !== longest.endSeason
	assert.equal(spanned, SITE.streaksSpanSeasons,
		'site.js and computeSuperlatives disagree about season boundaries')
})

test('the manifest lists twenty records, including the baseball-only ones', () => {
	assert.equal(SITE.records.length, 20)
	for (const baseballOnly of ['no-hitters', 'perfect-games', 'cycles', 'triple-plays']) {
		assert.ok(SITE.records.includes(baseballOnly), `${baseballOnly} is missing`)
	}
	// Computed but never published: across 162 games the answer is always an
	// empty list, so there is no card for it.
	assert.ok(!SITE.records.includes('perfect-seasons'))
})

test('RECORD_SLUGS is the manifest list, not a copy of it', () => {
	assert.equal(RECORD_SLUGS, SITE.records, 'should be the same array, not an equal one')
})

test('records copy uses the manifest, not a hardcoded name', () => {
	const ours = recordsCopy('best-starts', supers)
	const theirs = recordsCopy('best-starts', supers, OTHER)

	assert.match(ours.title, /Best Brewers Season Starts/)
	assert.match(theirs.title, /Best Otters Season Starts/)
	assert.match(theirs.desc, /Ocean City Otters history/)
	assert.ok(!theirs.title.includes('Brewers'), 'the team name leaked through')
	assert.ok(!theirs.desc.includes('Milwaukee'), 'the city leaked through')
})

test('history copy uses the manifest', () => {
	assert.match(historyCopy(history).title, /^Brewers Season-by-Season History/)
	const theirs = historyCopy(history, OTHER)
	assert.match(theirs.title, /^Otters Season-by-Season History/)
	assert.match(theirs.desc, /Every Ocean City Otters season/)
})

// Baseball has more records a franchise can go its whole life without setting,
// which is why this manifest carries seven "never happened" lines to football's
// one. Each has to be a sentence rather than an assembled phrase.
test('every never-happened line comes from the manifest', () => {
	// A franchise that has done none of these. The teamstats-derived lists are
	// supplied explicitly because computeSuperlatives does not produce them —
	// they come from computeTeamstatsRecords, and recordsCopy reads
	// data.noHitters and data.perfectGames without a guard. (data.triplePlays
	// has a `|| []`; the other two do not, so a caller that forgets to merge
	// the teamstats half crashes on two cards and not the third.)
	const empty = {
		...computeSuperlatives(season(2018, 'WWW'), { now: LONG_AFTER }),
		noHitters: [], perfectGames: [], triplePlays: [],
	}
	const cases = [
		['no-hitters', 'noNoHitter'],
		['perfect-games', 'noPerfectGame'],
		['triple-plays', 'noTriplePlay'],
		['ties', 'noTies'],
		['world-series-appearances', 'noWorldSeries'],
		['playoff-appearances', 'noPlayoffs'],
	]
	for (const [slug, key] of cases) {
		assert.equal(recordsCopy(slug, empty).desc, SITE.copy[key], slug)
		assert.equal(recordsCopy(slug, empty, OTHER).desc, OTHER.copy[key], `${slug} with another manifest`)
	}
})

test('the losing-streak line keeps its joke', () => {
	// 'Sure.' is the whole point of the sentence and would not survive being
	// derived from an empty list.
	//
	// A season with no losses at all, because a single loss is a losing streak
	// of one and the fallback then never fires — which is what the first
	// version of this test got wrong.
	const noStreak = computeSuperlatives(season(2018, 'WWW'), { now: LONG_AFTER })
	assert.match(recordsCopy('losing-streaks', noStreak).desc, /Sure\.$/)
})

test('head-to-head copy uses the manifest', () => {
	const data = computeHeadToHead([game({ opponent: 'Chicago Cubs', franchise: 'CHN', result: 'WIN' })])
	assert.match(h2hCopy('chicago-cubs', data).title, /^Brewers vs Chicago Cubs/)
	const theirs = h2hCopy('chicago-cubs', data, OTHER)
	assert.match(theirs.title, /^Otters vs Chicago Cubs/)
	assert.ok(!theirs.desc.includes('Brewers'))
})

test('the word for a game against an opponent is configurable, plural included', () => {
	assert.equal(meetings(1), '1 meeting')
	assert.equal(meetings(2), '2 meetings')
	assert.equal(meetings(1, OTHER), '1 clash')
	assert.equal(meetings(2, OTHER), '2 clashes')
})

test('the streak sentence uses the manifest', () => {
	const rows = [
		game({ opponent: 'Chicago Cubs', franchise: 'CHN', date: '2019-06-10', result: 'WIN' }),
		game({ opponent: 'Chicago Cubs', franchise: 'CHN', date: '2020-06-10', result: 'WIN' }),
	]
	const o = computeHeadToHead(rows).bySlug.get(slugifyOpponent('Chicago Cubs'))
	assert.equal(streakSentence(o), 'The Brewers have won the last 2 meetings.')
	assert.equal(streakSentence(o, OTHER), 'The Otters have won the last 2 clashes.')
})

test('every copy function works with no manifest passed', () => {
	assert.ok(recordsCopy('overview', supers).title.includes('Brewers'))
	assert.ok(historyCopy(history).title.includes('Brewers'))
	const data = computeHeadToHead([game({ opponent: 'Chicago Cubs', franchise: 'CHN' })])
	assert.ok(h2hCopy('overview', data).title.includes('Brewers'))
})
