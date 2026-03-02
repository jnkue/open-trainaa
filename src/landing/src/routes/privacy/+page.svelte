<script lang="ts">
	import { marked } from 'marked';
	import { locale } from 'svelte-i18n';
	import { derived } from 'svelte/store';

	// Configure marked options for better formatting
	marked.setOptions({
		breaks: true,

	});

	// Create a derived store that loads and parses the appropriate markdown based on locale
	const htmlContent = derived(locale, async ($locale, set) => {
		const currentLocale = $locale || 'de';

		try {
			let markdownContent = '';

			if (currentLocale === 'en') {
				const module = await import('./privacy-en.md?raw');
				markdownContent = module.default;
			} else {
				// Default to German for all other locales
				const module = await import('./privacy-de.md?raw');
				markdownContent = module.default;
			}

			// Parse markdown to HTML
			const html = await marked.parse(markdownContent);
			set(html);
		} catch (error) {
			console.error('Error loading privacy policy:', error);
			// Fallback to German if loading fails
			const module = await import('./privacy-de.md?raw');
			const html = await marked.parse(module.default);
			set(html);
		}
	}, '');
</script>

<main class="flex items-center justify-center p-4 py-12 max-w-screen">
	<div class="max-w-4xl mx-auto w-full">
		
		<article class="prose prose-invert prose-sm ">
			{@html $htmlContent}
</article>
	</div>
</main>
