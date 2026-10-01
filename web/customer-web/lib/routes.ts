/**
 * Page links. Stores and orders use query strings rather than dynamic path segments
 * so the site can also be exported as plain static files (e.g. for Netlify).
 */
export const storeHref = (slugOrId: string) => `/store?slug=${encodeURIComponent(slugOrId)}`;
export const orderHref = (id: string) => `/order?id=${encodeURIComponent(id)}`;
