import test from 'node:test'
import assert from 'node:assert/strict'
import { liveSituation, isBetweenInnings, situationHtml } from '../situation-core.js'

// The two shapes are copied from ESPN on 11 October 2026, NLCS Game 1, bottom
// of the 4th: the scoreboard sends booleans, the summary leaves the keys out.

const scoreboard = { balls: 2, strikes: 0, outs: 0, onFirst: false, onSecond: false, onThird: false, lastPlay: { text: 'Turang homered' } }
const summary = { balls: 2, strikes: 0, outs: 0, pitcher: { playerId: 1 }, batter: { playerId: 2 } }

test('the scoreboard shape reads as bases empty, nobody out', () => {
	assert.deepEqual(liveSituation(scoreboard),
		{ outs: 0, balls: 2, strikes: 0, first: false, second: false, third: false })
})

test('the summary shape, with the base keys missing, reads the same', () => {
	assert.deepEqual(liveSituation(summary), liveSituation(scoreboard))
})

test('an athlete object on a base counts as a runner', () => {
	const sit = liveSituation({ ...summary, outs: 2, onSecond: { playerId: 9 }, onThird: { playerId: 7 } })
	assert.equal(sit.first, false)
	assert.equal(sit.second, true)
	assert.equal(sit.third, true)
	assert.equal(sit.outs, 2)
})

test('no situation, or one with nothing to draw, is null', () => {
	assert.equal(liveSituation(undefined), null)
	assert.equal(liveSituation({ lastPlay: { text: 'x' } }), null)
})

test('garbage counts do not draw garbage', () => {
	const sit = liveSituation({ outs: 7, balls: -1, strikes: 'two', onFirst: true })
	assert.equal(sit.outs, 3)
	assert.equal(sit.balls, null)
	assert.equal(sit.strikes, null)
})

test('between half-innings is recognised from the status line', () => {
	assert.equal(isBetweenInnings('Middle 4th'), true)
	assert.equal(isBetweenInnings('End 7th'), true)
	assert.equal(isBetweenInnings('Bottom 4th'), false)
	assert.equal(isBetweenInnings('Top 1st'), false)
	assert.equal(isBetweenInnings(undefined), false)
})

test('occupied bases and recorded outs are filled, the rest are not', () => {
	const html = situationHtml({ outs: 2, balls: 3, strikes: 2, first: true, second: false, third: true })
	assert.equal((html.match(/class="base on"/g) || []).length, 2)
	assert.equal((html.match(/class="base"/g) || []).length, 1)
	assert.equal((html.match(/class="out-dot on"/g) || []).length, 2)
	assert.equal((html.match(/class="out-dot"/g) || []).length, 1)
	assert.match(html, />3-2</)
})

test('the label says it in words for a screen reader', () => {
	assert.match(situationHtml(liveSituation(scoreboard)), /aria-label="Bases empty, 0 outs, count 2-0"/)
	assert.match(situationHtml({ outs: 1, balls: null, strikes: null, first: true, second: true, third: false }),
		/aria-label="Runners on 1st, 2nd, 1 out"/)
})

test('nothing to draw is an empty string', () => {
	assert.equal(situationHtml(null), '')
})
