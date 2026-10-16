import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleRowHtml, scheduleListHtml, monthChipsHtml, monthKey, monthName } from '../schedule-core.js'

const row = (o) => ({ key: '1', date: new Date(2026, 9, 14, 19, 7), opp: 'Dodgers', home: false, state: 'win', text: 'W 6-2', tv: [], phase: 'post', ...o })

test('a row: day and date, opponent with @ or vs, the result, and TV for games to come', () => {
	const html = scheduleRowHtml(row({ tv: ['Fox', 'BrewersTV 48'] }))
	assert.match(html, /class="sched-row sched-win"/)
	assert.match(html, /<span class="sched-dow">Wed<\/span> Oct 14/)
	assert.match(html, /@ Dodgers/)
	assert.match(html, /W 6-2/)
	assert.match(html, /Fox · BrewersTV 48/)
	assert.match(scheduleRowHtml(row({ home: true })), /vs Dodgers/)
})

test('a clickable row is a button for the keyboard too; a Retrosheet game keeps its g- anchor', () => {
	const html = scheduleRowHtml(row({ clickable: true, title: 'Line score', anchor: 'g-MIL201110070' }))
	assert.match(html, /sched-click/)
	assert.match(html, /role="button" tabindex="0"/)
	assert.match(html, /id="g-MIL201110070"/)
	assert.doesNotMatch(scheduleRowHtml(row()), /role="button"/)
})

test('ESPN text is escaped', () => {
	assert.match(scheduleRowHtml(row({ opp: '<b>x</b>' })), /&lt;b&gt;x&lt;\/b&gt;/)
})

test('months group the rows under one heading each; a phase change starts its own', () => {
	const rows = [
		row({ key: 'a', date: new Date(2026, 8, 27), phase: 'regular' }),
		row({ key: 'b', date: new Date(2026, 8, 30), phase: 'post' }),
		row({ key: 'c', date: new Date(2026, 9, 3), phase: 'post' }),
		row({ key: 'd', date: new Date(2026, 9, 4), phase: 'post' }),
	]
	const html = scheduleListHtml(rows, { regular: 'Regular Season', post: 'Playoffs' })
	// September under Regular Season, September again under Playoffs, then October.
	assert.deepEqual([...html.matchAll(/class="sched-month">([^<]+)</g)].map((m) => m[1]), ['September 2026', 'September 2026', 'October 2026'])
	assert.deepEqual([...html.matchAll(/class="season-divider">([^<]+)</g)].map((m) => m[1]), ['Regular Season', 'Playoffs'])
	// Every group closes: as many <section> as </section>.
	assert.equal((html.match(/<section /g) || []).length, (html.match(/<\/section>/g) || []).length)
	// Both October games sit inside the October group.
	const oct = html.slice(html.indexOf('data-month="2026-10"'))
	assert.equal((oct.slice(0, oct.indexOf('</section>')).match(/class="sched-row/g) || []).length, 2)
})

test('a chip a month, in order, the active one marked; one month needs none', () => {
	const rows = [row({ date: new Date(2026, 2, 28) }), row({ date: new Date(2026, 3, 1) }), row({ date: new Date(2026, 3, 2) })]
	const html = monthChipsHtml(rows, '2026-04')
	assert.deepEqual([...html.matchAll(/data-month="([^"]+)"/g)].map((m) => m[1]), ['2026-03', '2026-04'])
	assert.match(html, /sched-chip active" data-month="2026-04"/)
	assert.equal(monthChipsHtml(rows.slice(1)), '')
	assert.equal(monthKey(new Date(2026, 0, 31, 23)), '2026-01')
	assert.equal(monthName('2026-10'), 'October 2026')
})
