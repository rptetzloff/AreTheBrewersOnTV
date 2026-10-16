import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browserModules, releaseId } from '../lib/browser-modules.js'

function site(files) {
	const root = mkdtempSync(join(tmpdir(), 'modules-'))
	for (const [name, body] of Object.entries(files)) {
		mkdirSync(join(root, name, '..'), { recursive: true })
		writeFileSync(join(root, name), body)
	}
	return root
}

test('local imports go out versioned; bare ones are untouched', () => {
	const load = browserModules(site({
		'page.js': "import { a } from './a.js';\nimport '/side.js';\nexport * from \"./lib/b.js\";\nimport x from 'node:fs';\n",
		'a.js': 'export const a = 1;\n',
		'side.js': 'console.log(1);\n',
		'lib/b.js': "import { a } from '../a.js';\nexport const b = a;\n",
	}))
	const a = load('a.js').version
	const body = load('page.js').body
	assert.match(body, new RegExp(`from './a\\.js\\?v=${a}'`))
	assert.match(body, /import '\/side\.js\?v=[0-9a-f]{8}'/)
	assert.match(body, /from "\.\/lib\/b\.js\?v=[0-9a-f]{8}"/)
	assert.match(body, /from 'node:fs'/)
	// A path relative to a module in a subfolder resolves from that folder.
	assert.match(load('lib/b.js').body, new RegExp(`from '\\.\\./a\\.js\\?v=${a}'`))
})

test('a change below an entry script changes the entry script\'s version', () => {
	const files = { 'page.js': "import './mid.js';\n", 'mid.js': "import './leaf.js';\n", 'leaf.js': 'export const v = 1;\n' }
	const before = browserModules(site(files))('page.js').version
	const after = browserModules(site({ ...files, 'leaf.js': 'export const v = 2;\n' }))('page.js').version
	assert.notEqual(before, after)
	assert.equal(browserModules(site(files))('page.js').version, before)
})

test('a missing import is left as written, and a cycle does not hang', () => {
	const load = browserModules(site({
		'page.js': "import './gone.js';\n",
		'x.js': "import './y.js';\n", 'y.js': "import './x.js';\n",
	}))
	assert.equal(load('page.js').body, "import './gone.js';\n")
	assert.ok(load('x.js').version)
	assert.equal(load('missing.js'), null)
})

test('the release goes into every version: a new release changes every URL, one file changed or not', () => {
	const files = { 'page.js': "import './leaf.js';\n", 'leaf.js': 'export const v = 1;\n' }
	const root = site(files)
	const a = browserModules(root, { release: 'r1' })
	const b = browserModules(root, { release: 'r2' })
	assert.notEqual(a('leaf.js').version, b('leaf.js').version)
	assert.notEqual(a('page.js').version, b('page.js').version)
	assert.ok(b('page.js').body.includes(`./leaf.js?v=${b('leaf.js').version}'`))
	assert.equal(browserModules(root, { release: 'r1' })('page.js').version, a('page.js').version)
})

test('the release id follows the code, not the data', () => {
	const base = { 'server.js': 'a', 'page.html': '<p>', 'styles.css': 'b{}', 'lib/x.js': 'x', 'package.json': '{}', 'data/games.csv': '1' }
	const id = releaseId(site(base))
	assert.match(id, /^[0-9a-f]{8}$/)
	assert.equal(releaseId(site(base)), id)
	assert.notEqual(releaseId(site({ ...base, 'lib/x.js': 'y' })), id)
	assert.notEqual(releaseId(site({ ...base, 'styles.css': 'c{}' })), id)
	assert.equal(releaseId(site({ ...base, 'data/games.csv': '2' })), id)
})
