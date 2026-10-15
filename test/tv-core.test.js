import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
	parseTvLookup, resolveChannel, tvStatus, primaryBroadcast, providerChannel, channelNumberFor,
	formatChannelNum, parseSimulcasts, broadcastsWithSimulcasts, EMPTY_LOOKUP,
} from '../tv-core.js'

const CHANNELS = [
	'key,alias,display_name,type,description,website_url,directv,amherst',
	'FOX,,FOX,broadcast,,,,11 (WZAW) | 1 (WLUK) | 1 (WMSN)',
	'FS1,,FS1,cable,,,219,49',
	'Brewers.TV,BTV,Brewers.TV,regional,,,,16',
	'MLB.TV,,MLB.TV,streaming,,,,',
	'Simulcast,,Simulcast,broadcast,,,,7 (WSAW) or 11 (WZAW) | 6 (WGBA) | 4 (WISC)',
].join('\n')
const PROVIDERS = [
	'provider,display_name,alternate_name,website_url,channel_lineup,service_areas,logo_url,logo_bg,display_logo',
	'directv,DirecTV,,,,,,,',
	'amherst,Amherst Communications,"Union Telephone Company,Amherst Telephone Company",,,"Portage | Waushara | Marquette",,,n',
].join('\n')
const L = parseTvLookup(CHANNELS, PROVIDERS)
const tv = (name, type = 'TV') => ({ media: { shortName: name }, type: { shortName: type } })

test('channels resolve by key, alias or display name, in any case', () => {
	assert.equal(resolveChannel(L, 'Fox').key, 'FOX')
	assert.equal(resolveChannel(L, 'btv').key, 'Brewers.TV')
	assert.equal(resolveChannel(L, 'Nowhere'), null)
})

test('a channel the table types as TV counts as TV whatever ESPN calls it', () => {
	// ESPN lists Brewers.TV as Streaming; it is carried by cable providers.
	assert.equal(tvStatus(L, [tv('Brewers.TV', 'Streaming')]), 'yes')
	assert.equal(tvStatus(L, [tv('MLB.TV', 'Streaming')]), 'streaming')
	// Unknown to the table: ESPN's label decides.
	assert.equal(tvStatus(L, [tv('Some New Network', 'TV')]), 'yes')
	assert.equal(tvStatus(L, []), 'no')
	assert.equal(tvStatus(EMPTY_LOOKUP, [tv('Brewers.TV', 'Streaming')]), 'streaming')
})

test('the primary broadcast prefers over-the-air, then regional, then cable, over streaming', () => {
	assert.equal(primaryBroadcast(L, [tv('MLB.TV', 'Streaming'), tv('FS1'), tv('FOX')]).media.shortName, 'FOX')
})

test('a provider with service areas gets the number for the chosen area', () => {
	assert.equal(providerChannel(L, 'amherst', 'FOX', 0), '11 (WZAW)')
	assert.equal(providerChannel(L, 'amherst', 'FOX', 1), '1 (WLUK)')
	assert.equal(providerChannel(L, 'amherst', 'FOX', 9), '11 (WZAW)')
	assert.equal(providerChannel(L, 'amherst', 'FS1', 2), '49')
	assert.equal(providerChannel(L, 'directv', 'FOX'), null)
})

test('channel numbers are for linear TV only, spelled out for display', () => {
	assert.equal(channelNumberFor(L, 'amherst', tv('Fox'), 0), '11 (WZAW)')
	assert.equal(channelNumberFor(L, 'amherst', tv('MLB.TV', 'Streaming')), null)
	assert.equal(channelNumberFor(L, 'amherst', tv('Simulcast'), 0), '7 (WSAW) or 11 (WZAW)')
	assert.deepEqual(formatChannelNum('652 / 1652'), { text: '652 (SD) / 1652 (HD)', ambiguous: false })
	assert.equal(formatChannelNum('7 or 11').ambiguous, true)
})

test('providers are found by their other names too', () => {
	assert.equal(L.providerAliasIndex.get('union telephone company'), 'amherst')
})

test('a simulcast day adds a TV broadcast on the game\'s Central-time date', () => {
	const sims = parseSimulcasts('date,channels,note\n2026-04-28,Simulcast,vs Arizona')
	// 00:40 UTC on the 29th is 7:40 pm on the 28th in Milwaukee.
	const game = { date: '2026-04-29T00:40Z', competitions: [{ broadcasts: [tv('Brewers.TV', 'Streaming')] }] }
	const all = broadcastsWithSimulcasts(game, sims)
	assert.deepEqual(all.map((b) => b.media.shortName), ['Brewers.TV', 'Simulcast'])
	assert.equal(all[1]._simulcast, true)
})

// The real tables, so a renamed column or a broken row fails here rather
// than on the page.
test('the committed channel and provider tables parse, and every provider has a lineup', () => {
	const real = parseTvLookup(
		readFileSync(new URL('../data/channel_lookup.csv', import.meta.url), 'utf8'),
		readFileSync(new URL('../data/provider_lookup.csv', import.meta.url), 'utf8'),
	)
	assert.ok(Object.keys(real.providers).length >= 10)
	for (const p of Object.values(real.providers)) assert.ok(Object.keys(p.channels).length > 0, `${p.key} has no channels`)
	assert.equal(resolveChannel(real, 'FS1')?.type, 'cable')
})
