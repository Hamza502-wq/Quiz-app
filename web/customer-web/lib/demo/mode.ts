/** True for standalone builds (e.g. Netlify) that run on the in-browser demo API. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
