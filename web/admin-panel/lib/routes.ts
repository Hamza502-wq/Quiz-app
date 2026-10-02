/** Detail pages take the id as a query parameter so the panel can be exported as static files. */
export const vendorHref = (id: string) => `/vendors/view?id=${encodeURIComponent(id)}`;
export const orderHref = (id: string) => `/orders/view?id=${encodeURIComponent(id)}`;
export const riderHref = (id: string) => `/riders/view?id=${encodeURIComponent(id)}`;
