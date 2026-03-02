import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	const baseUrl = 'https://trainaa.com';
	const currentUrl = `${baseUrl}${url.pathname}`;

	return {
		meta: {
			url: currentUrl,
			baseUrl: baseUrl,
			siteName: 'TRAINAA',
			image: `${baseUrl}/og-image.png`,
			favicon: `${baseUrl}/favicon.ico`,
			type: 'website'
		}
	};
};