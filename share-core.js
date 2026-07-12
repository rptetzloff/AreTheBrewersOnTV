// Shared share-button helpers for the browser pages (main.js and records.js):
// share-intent URL builders and copy-to-clipboard with visual flash feedback.

export function intentUrls(message, url) {
	const text = `${message}\n\n${url}`;
	return {
		x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
		bsky: `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`,
		fb: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(message)}`,
		reddit: `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(message)}`,
	};
}

// Icon-only share buttons for a compact per-card share row: native share when
// supported, otherwise the per-platform intent links, plus copy. Pair with
// wireShareRow() after inserting into the DOM.
export function shareButtonsHtml(btnClass) {
	const native = !!navigator.share;
	const alts = native ? '' : `
		<a class="${btnClass}" data-share="x" href="#" target="_blank" rel="noopener noreferrer" aria-label="Post on X"><i class="mdi mdi-twitter"></i></a>
		<a class="${btnClass}" data-share="bsky" href="#" target="_blank" rel="noopener noreferrer" aria-label="Post on Bluesky"><i class="mdi mdi-butterfly"></i></a>
		<a class="${btnClass}" data-share="fb" href="#" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook"><i class="mdi mdi-facebook"></i></a>
		<a class="${btnClass}" data-share="reddit" href="#" target="_blank" rel="noopener noreferrer" aria-label="Post on Reddit"><i class="mdi mdi-reddit"></i></a>`;
	return `${native ? `<button class="${btnClass}" data-share="native" aria-label="Share"><i class="mdi mdi-share-variant"></i></button>` : ''}
		${alts}
		<button class="${btnClass}" data-share="copy" aria-label="Copy link"><i class="mdi mdi-clipboard-outline"></i></button>`;
}

// Wire the [data-share] buttons inside `row` to share `message` + `url`.
export function wireShareRow(row, message, url) {
	const links = intentUrls(message, url);
	row.querySelectorAll('[data-share]').forEach((btn) => {
		switch (btn.dataset.share) {
			case 'x': btn.href = links.x; break;
			case 'bsky': btn.href = links.bsky; break;
			case 'fb': btn.href = links.fb; break;
			case 'reddit': btn.href = links.reddit; break;
			case 'native':
				btn.addEventListener('click', async () => {
					try { await navigator.share({ text: message, url }); } catch { /* user cancelled */ }
				});
				break;
			case 'copy':
				btn.addEventListener('click', () => {
					flashCopied(btn, '<i class="mdi mdi-check"></i>');
					copyText(`${message}\n\n${url}`);
				});
				break;
		}
	});
}

// Flash a button into its "copied" state for 2s, restoring its original
// content afterwards. Safe to call repeatedly (re-clicks reset the timer).
const flashState = new WeakMap(); // btn -> { original, timer }
export function flashCopied(btn, flashHtml) {
	let st = flashState.get(btn);
	if (!st) { st = { original: btn.innerHTML, timer: null }; flashState.set(btn, st); }
	if (st.timer) clearTimeout(st.timer);
	btn.innerHTML = flashHtml;
	btn.classList.add('copy-success');
	st.timer = setTimeout(() => {
		btn.innerHTML = st.original;
		btn.classList.remove('copy-success');
		st.timer = null;
	}, 2000);
}

// Copy text to the clipboard, with a legacy fallback for older/insecure
// contexts. Never throws — callers flash feedback before calling this.
export async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
	} catch (_) {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
		} catch (_) {}
	}
}
