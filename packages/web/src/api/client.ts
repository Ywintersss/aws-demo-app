export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

let lastServedBy: string | null = null;
let lastAz: string | null = null;

export const getLastResponseMeta = (): {
	servedBy: string | null;
	az: string | null;
} => ({
	servedBy: lastServedBy,
	az: lastAz,
});

const TOKEN_KEY = "aethelgard.token";

export const getStoredToken = (): string | null =>
	localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string | null): void => {
	if (token === null) localStorage.removeItem(TOKEN_KEY);
	else localStorage.setItem(TOKEN_KEY, token);
};

// Fired by apiFetch when any request comes back 401, so the AuthProvider can
// drop the invalid token and bounce the user to /login instead of leaving the
// app in a half-authenticated state where every page silently fails.
export const AUTH_UNAUTHORIZED_EVENT = "aethelgard:unauthorized";

export const apiFetch = async <T>(
	path: string,
	init: RequestInit = {},
): Promise<T> => {
	const token = getStoredToken();
	// Only declare a JSON body when there is one. Fastify rejects an empty
	// body when content-type is application/json (FST_ERR_CTP_EMPTY_JSON_BODY),
	// which broke every bodyless DELETE/POST.
	const hasBody = init.body !== undefined && init.body !== null;
	const response = await fetch(path, {
		...init,
		headers: {
			...(hasBody ? { "content-type": "application/json" } : {}),
			...(token !== null ? { authorization: `Bearer ${token}` } : {}),
			...init.headers,
		},
	});

	lastServedBy = response.headers.get("x-served-by");
	lastAz = response.headers.get("x-az");

	if (response.status === 204) {
		return undefined as T;
	}

	const body = (await response.json().catch(() => null)) as
		| (T & { code?: string; message?: string })
		| null;

	if (!response.ok) {
		if (response.status === 401) {
			setStoredToken(null);
			window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
		}
		throw new ApiError(
			response.status,
			body?.code ?? "UNKNOWN",
			body?.message ?? response.statusText,
		);
	}
	return body as T;
};
