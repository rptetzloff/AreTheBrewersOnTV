import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Layout rules that no other test can reach.
//
// The records page shipped as one tall column of cards at every viewport above
// 600px and the whole suite stayed green: the records tests prove the cards exist
// and the superlatives tests prove their contents, and neither has any opinion
// about how wide the thing they render into is. The failure lived
// entirely in a missing declaration in styles.css.
//
// Reading CSS as text is crude, but the alternative is a headless browser and
// this repo has no runtime dependencies on purpose. Parsing declarations
// exactly — rather than searching the block for a substring — is what makes it
// trustworthy: `max-width` contains `width`, so a substring check would pass on
// the very stylesheet that had the bug.

/** Drop comments. The explanation above .records-container mentions `width`
 *  and `auto-fit`, and leaving it in would make every assertion below pass on
 *  the broken stylesheet. Done by hand because a regex here needs escapes, and
 *  an escape that silently degrades is how this file got written twice. */
function stripComments(text) {
	return text
		.split('/*')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('*/') + 2)))
		.join('')
}

const css = stripComments(
	readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8'),
)

/** The declarations of the first top-level rule for `selector`, as a map of
 *  property to value. Flat-brace parsing is enough: every rule asserted on here
 *  is at the top level of the stylesheet, outside any media query. */
function rule(selector) {
	const at = css.indexOf('\n' + selector + ' {')
	assert.notEqual(at, -1, 'no top-level rule for ' + selector)
	const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
	const out = new Map()
	for (const decl of body.split(';')) {
		const colon = decl.indexOf(':')
		if (colon !== -1) out.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim())
	}
	return out
}

test('the records container has a definite width, not only a max-width', () => {
	// body is `display: flex; flex-direction: column; align-items: center`, so
	// a flex item is sized shrink-to-fit on the inline axis unless it says
	// otherwise, and max-width alone leaves that size indefinite. An auto-fit
	// track list resolves to exactly one repetition against an indefinite
	// inline size — hence one column, at any window width.
	assert.ok(
		rule('.records-container').has('width'),
		'.records-container sets only max-width, so its inline size is indefinite ' +
		'and the auto-fit grid inside it collapses to a single column',
	)
})

test('the records container counts its padding inside that width', () => {
	// .container contributes `padding: 2rem`. Under the default content-box,
	// width: 100% then measures 100% + 4rem and overflows the viewport, which
	// is the symptom that makes someone revert the line above.
	assert.equal(
		rule('.records-container').get('box-sizing'),
		'border-box',
		'width: 100% plus .container’s 2rem padding overflows without border-box',
	)
})

test('the records grid still fits its columns to the available width', () => {
	// If the track list ever becomes a fixed column count, the width rule above
	// stops mattering and the two tests above assert nothing. Named so whoever
	// changes this can see why the container rule exists.
	const columns = rule('.records-grid').get('grid-template-columns')
	assert.ok(
		columns.startsWith('repeat(auto-fit') || columns.startsWith('repeat(auto-fill'),
		'the container width rule exists to serve an auto-fit track list, but the ' +
		'columns are now: ' + columns,
	)
})
