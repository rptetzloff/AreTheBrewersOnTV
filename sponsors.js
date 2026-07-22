// Renders a "Site sponsors" strip into every page's footer, listing providers
// flagged sponsor=yes in data/provider_lookup.csv. Sponsors with a logo get
// their logo chip (on its optional background color); others show their name.
import { parseGamesCsv } from './records-core.js';

async function init() {
	const footer = document.querySelector('.site-footer');
	if (!footer) return;

	let providers;
	try {
		const res = await fetch('/data/provider_lookup.csv');
		if (!res.ok) return;
		providers = parseGamesCsv(await res.text());
	} catch {
		return;
	}

	const sponsors = providers.filter(p => /^(yes|true|1)$/i.test((p.sponsor || '').trim()));
	if (!sponsors.length) return;

	const strip = document.createElement('div');
	strip.className = 'footer-sponsors';

	const label = document.createElement('span');
	label.className = 'footer-sponsors-label';
	label.textContent = 'Site sponsors';
	strip.appendChild(label);

	const list = document.createElement('span');
	list.className = 'footer-sponsors-list';
	for (const p of sponsors) {
		const link = document.createElement('a');
		link.className = 'footer-sponsor';
		link.href = (p.website_url || '').trim() || '#';
		link.target = '_blank';
		link.rel = 'sponsored noopener noreferrer';
		link.title = p.display_name;
		const logoUrl = (p.logo_url || '').trim();
		if (logoUrl) {
			const chip = document.createElement('span');
			chip.className = 'provider-logo';
			const bg = (p.logo_bg || '').trim();
			if (bg) chip.style.background = bg;
			const img = document.createElement('img');
			img.src = logoUrl;
			img.alt = `${p.display_name} logo`;
			img.loading = 'lazy';
			img.addEventListener('error', () => {
				chip.remove();
				link.textContent = p.display_name;
			});
			chip.appendChild(img);
			link.appendChild(chip);
		} else {
			link.textContent = p.display_name;
		}
		list.appendChild(link);
	}
	strip.appendChild(list);

	// Sits above the nav row at the top of the footer.
	footer.insertBefore(strip, footer.firstChild);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
