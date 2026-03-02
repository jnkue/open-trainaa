import { type Handle } from '@sveltejs/kit';

const corsHandle: Handle = async ({ event, resolve }) => {
	// Request verarbeiten
	const response = await resolve(event);

	// CORS-Header für API-Endpunkte hinzufügen (falls später benötigt)
	if (event.url.pathname.startsWith('/api/')) {
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	}

	return response;
};

export const handle: Handle = corsHandle;
