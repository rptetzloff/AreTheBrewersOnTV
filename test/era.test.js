import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTeamstatsRecords, computePitcherEra, inningsPitched, formatEra } from '../records-core.js'
import { game, season } from './helpers/rows.js'

// ERA is 27 x earned runs / outs: nine innings' worth of earned runs.
const LATER = new Date(2030, 5, 1)

test('innings pitched are written in thirds, the way box scores write them', () => {
	assert.equal(inningsPitched(637), '212.1')
	assert.equal(inningsPitched(27), '9.0')
	assert.equal(formatEra(2.4319), '2.43')
})

test('team ERA is summed over a season\'s regular-season games', () => {
	const rows = [
		...season(2011, 'WW').map((g, i) => ({ ...g, gid: `MIL20110${i}` })),
		game({ date: '2011-10-02', regular: false, gametype: 'D', gid: 'POST1' }),
		...season(2012, 'WL').map((g, i) => ({ ...g, gid: `MIL20120${i}` })),
	]
	// 2011: 2 ER and 1 ER over two 9-inning games = 1.50. The postseason
	// game's 9 ER must not count. 2012: 4 and 5 over 18 innings = 4.50.
	const ts = ['gid,team,p_h,p_ipouts,p_er',
		'MIL201100,MIL,5,27,2', 'MIL201101,MIL,5,27,1', 'POST1,MIL,9,27,9',
		'MIL201200,MIL,5,27,4', 'MIL201201,MIL,5,27,5'].join('\n')
	const r = computeTeamstatsRecords(rows, ts, { now: LATER })
	assert.deepEqual(r.bestTeamEra.map((s) => [s.season, formatEra(s.era)]), [[2011, '1.50'], [2012, '4.50']])
	assert.deepEqual(r.worstTeamEra.map((s) => s.season), [2012, 2011])
	assert.equal(r.bestTeamEra[0].ip, '18.0')
})

// The pitcher side: the index's shape is gid -> one line per pitcher.
const line = (id, team, ipouts, er, gs = false) => ({ id, team, ipouts, er, gs })
const rowsFor = (gids, { regular = true } = {}) =>
	gids.map((gid) => [gid, { gid, season: '1978', regular_season: regular ? '1' : '0', result: 'WIN' }])

test('a pitcher qualifies with an inning per team game, and only Brewers innings count', () => {
	// Four team games, so 12 outs qualify.
	const rowByGid = new Map(rowsFor(['g1', 'g2', 'g3', 'g4']))
	const pitching = new Map([
		['g1', [line('ace', 'MIL', 27, 1, true), line('opp', 'NYA', 27, 0, true)]],
		['g2', [line('ace', 'MIL', 9, 0), line('mopup', 'MIL', 6, 0)]],
		['g3', [line('bad', 'MIL', 12, 8, true)]],
		['g4', [line('mopup', 'MIL', 3, 0)]],
	])
	const names = new Map([['ace', 'Mike Caldwell'], ['bad', 'Someone Else']])
	const { bestPitcherEra, worstPitcherEra } = computePitcherEra(pitching, rowByGid, names)
	// ace: 1 ER in 36 outs = 0.75; bad: 8 in 12 = 18.00; mopup has 9 outs and
	// does not qualify however clean; the Yankee is not a Brewer.
	assert.deepEqual(bestPitcherEra.map((s) => [s.player, formatEra(s.era), s.ip, s.gs]),
		[['Mike Caldwell', '0.75', '12.0', 1], ['Someone Else', '18.00', '4.0', 1]])
	assert.equal(worstPitcherEra[0].player, 'Someone Else')
})

test('postseason innings do not count toward a pitcher\'s season', () => {
	const rowByGid = new Map([...rowsFor(['r1']), ...rowsFor(['p1'], { regular: false })])
	const pitching = new Map([
		['r1', [line('ace', 'MIL', 27, 0, true)]],
		['p1', [line('ace', 'MIL', 27, 9, true)]],
	])
	const { bestPitcherEra } = computePitcherEra(pitching, rowByGid, new Map())
	assert.equal(formatEra(bestPitcherEra[0].era), '0.00')
	assert.equal(bestPitcherEra[0].ip, '9.0')
})
