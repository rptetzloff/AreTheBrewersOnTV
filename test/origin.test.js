import test from 'node:test'
import assert from 'node:assert/strict'
import { originOf } from '../lib/origin.js'

// The origin decides every canonical and og: URL the server emits, and was
// untested until it got one of them wrong on a live site.

const req = (headers) => ({ headers })

test('an explicit PUBLIC_ORIGIN wins over anything the request claims', () => {
	const r = req({ host: 'container-hostname:3000', 'x-forwarded-proto': 'http' })
	assert.equal(originOf(r, { PUBLIC_ORIGIN: 'https://example.com' }), 'https://example.com')
})

test('a trailing slash on PUBLIC_ORIGIN does not become a double slash', () => {
	// Every URL is built as `${origin}/records`, so this would ship //records.
	assert.equal(originOf(req({}), { PUBLIC_ORIGIN: 'https://example.com/' }), 'https://example.com')
	assert.equal(originOf(req({}), { PUBLIC_ORIGIN: 'https://example.com//' }), 'https://example.com')
})

test('without it, the forwarded scheme and host are used', () => {
	const r = req({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'example.com', host: 'internal:3000' })
	assert.equal(originOf(r, {}), 'https://example.com')
})

test('a forwarded scheme list takes the first entry', () => {
	// Two proxies in front produce "https, http"; the first is what the client
	// actually spoke.
	const r = req({ 'x-forwarded-proto': 'https, http', host: 'example.com' })
	assert.equal(originOf(r, {}), 'https://example.com')
})

test('a missing forwarded scheme falls back to http', () => {
	// This is the Coolify case, and the reason PUBLIC_ORIGIN exists. The
	// behaviour is kept rather than changed: guessing https would be wrong for
	// anyone running this without TLS in front.
	const r = req({ host: 'example.com' })
	assert.equal(originOf(r, {}), 'http://example.com')
})

test('the Host header is used when nothing is forwarded', () => {
	assert.equal(originOf(req({ host: 'localhost:3000' }), {}), 'http://localhost:3000')
})

test('an empty PUBLIC_ORIGIN is ignored rather than producing "://"', () => {
	// An env var set to the empty string is a normal way to unset one.
	const r = req({ 'x-forwarded-proto': 'https', host: 'example.com' })
	assert.equal(originOf(r, { PUBLIC_ORIGIN: '' }), 'https://example.com')
})
