import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const css = readFileSync(join(root, 'styles.css'), 'utf8')

// The declarations of the first rule whose selector is exactly `selector`.
function block(selector) {
	const at = css.indexOf(`${selector} {`)
	assert.notEqual(at, -1, `no rule for ${selector}`)
	const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
	return body.replace(/\/\*[\s\S]*?\*\//g, '').split(';').map((d) => d.trim()).filter(Boolean)
}
const vars = (decls) => Object.fromEntries(decls.filter((d) => d.startsWith('--')).map((d) => d.split(/:\s*/)))

test('chosen light and System-on-a-light-device declare the same theme', () => {
	assert.deepEqual(block(':root:not([data-theme])'), block(':root[data-theme="light"]'))
})

test('the history chart stays navy in light, the same either way light was reached', () => {
	const island = ':is(.history-spark, .history-chart, .history-tooltip)'
	assert.deepEqual(block(`:root:not([data-theme]) ${island}`), block(`:root[data-theme="light"] ${island}`))
	for (const el of ['.history-spark', '.history-chart', '.history-toggle-btn.history-toggle-active']) {
		assert.deepEqual(block(`:root:not([data-theme]) ${el}`), block(`:root[data-theme="light"] ${el}`))
	}
})

test('dark defines no light tones, so every tone falls back to its color as written', () => {
	const dark = vars(block(':root'))
	assert.deepEqual(Object.keys(dark).filter((k) => k.endsWith('-light')), [])
	const light = vars(block(':root[data-theme="light"]'))
	const used = new Set([...css.matchAll(/var\((--[a-z]+-light),/g)].map((m) => m[1]))
	for (const tone of used) assert.ok(light[tone], `${tone} is used but light never sets it`)
})

test('every theme variable used without a fallback is set in dark and in light', () => {
	const dark = vars(block(':root'))
	const light = vars(block(':root[data-theme="light"]'))
	const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))
	for (const v of used) {
		assert.ok(dark[v], `${v} is not set in dark`)
		assert.ok(light[v], `${v} is not set in light`)
	}
	assert.deepEqual(Object.keys(light).filter((k) => !k.endsWith('-light')).sort(), Object.keys(dark).sort())
})

test('every page applies a saved theme before the stylesheet and loads the switcher', () => {
	const pages = readdirSync(root).filter((f) => f.endsWith('.html'))
	assert.ok(pages.length >= 10)
	for (const page of pages) {
		const html = readFileSync(join(root, page), 'utf8')
		const early = html.indexOf("localStorage.getItem('theme')")
		assert.ok(early > -1, `${page} never reads the saved theme`)
		assert.ok(early < html.indexOf('styles.css'), `${page} reads the theme after the stylesheet`)
		assert.match(html, /<script src="\/theme\.js" defer><\/script>/, `${page} has no switcher`)
	}
})
