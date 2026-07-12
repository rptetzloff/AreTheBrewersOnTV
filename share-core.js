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
