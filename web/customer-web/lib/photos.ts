/**
 * Stock photography (Unsplash, free to use under the Unsplash License),
 * loaded from Unsplash's image CDN. Every photo is shown through <Photo>,
 * which falls back to the branded illustration if an image can't load.
 */
const unsplash = (id: string, width: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=70`;

export const PHOTOS = {
  hero: unsplash('1504674900247-0877df9cc836', 900),
  food: unsplash('1565299624946-b28f40a0ae38', 700),
  groceries: unsplash('1542838132-92c53300491e', 700),
  pharmacy: unsplash('1587854692152-cbe660dbde88', 700),
  shopOwner: unsplash('1556740758-90de374c12ad', 800),
  rider: unsplash('1526367790999-0150786686a2', 800),
} as const;

/** A category photo for stores that haven't uploaded a cover yet. */
export function categoryPhoto(slug: string | undefined): string | null {
  switch (slug) {
    case 'food':
      return PHOTOS.food;
    case 'groceries':
      return PHOTOS.groceries;
    case 'pharmacy':
      return PHOTOS.pharmacy;
    default:
      return null;
  }
}
