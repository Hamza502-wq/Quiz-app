import type { ListingKind } from '@prisma/client';

export interface MarketCategory {
  slug: string;
  name: string;
  /** Shona name shown alongside the English one. */
  shona: string;
  kind: ListingKind;
  /** Words (English and Shona) that point to this category in a search. */
  words: string[];
}

/**
 * Marketplace categories. Words are matched as whole words (after lower-casing), so
 * multi-word phrases are allowed ("burst pipe"). Keep the lists to words that clearly
 * mean the category: generic words make searches worse, not better.
 */
export const MARKET_CATEGORIES: MarketCategory[] = [
  // ── Items ──
  {
    slug: 'phones',
    name: 'Phones & tablets',
    shona: 'Mafoni',
    kind: 'ITEM',
    words: ['phone', 'phones', 'smartphone', 'smartphones', 'cellphone', 'iphone', 'tecno', 'itel', 'tablet', 'tablets', 'ipad', 'foni', 'mafoni', 'nhare', 'runhare'],
  },
  {
    slug: 'electronics',
    name: 'Electronics',
    shona: 'Zvemagetsi',
    kind: 'ITEM',
    words: ['electronics', 'tv', 'tvs', 'television', 'laptop', 'laptops', 'computer', 'computers', 'speaker', 'speakers', 'radio', 'solar panel', 'solar panels', 'inverter', 'battery', 'batteries', 'playstation', 'xbox', 'camera', 'terevhizheni', 'redhiyo', 'komputa', 'rapitopu'],
  },
  {
    slug: 'vehicles',
    name: 'Cars & bikes',
    shona: 'Mota nemabhasikoro',
    kind: 'ITEM',
    words: ['car', 'cars', 'vehicle', 'vehicles', 'truck', 'bakkie', 'kombi', 'motorbike', 'motorcycle', 'scooter', 'bicycle', 'bike', 'toyota', 'honda', 'nissan', 'mazda', 'tyres', 'tyre', 'motokari', 'mota', 'bhasikoro', 'mudhudhudhu'],
  },
  {
    slug: 'fashion',
    name: 'Clothes & shoes',
    shona: 'Mbatya neshangu',
    kind: 'ITEM',
    words: ['clothes', 'clothing', 'dress', 'dresses', 'shirt', 'shirts', 't-shirt', 'jeans', 'trousers', 'skirt', 'jacket', 'shoes', 'sneakers', 'boots', 'handbag', 'mbatya', 'hembe', 'zvipfeko', 'shangu', 'bhachi', 'rokwe', 'bhurukwa'],
  },
  {
    slug: 'home',
    name: 'Furniture & home',
    shona: 'Fenicha nezvemumba',
    kind: 'ITEM',
    words: ['furniture', 'sofa', 'couch', 'bed', 'beds', 'mattress', 'table', 'chair', 'chairs', 'wardrobe', 'fridge', 'refrigerator', 'stove', 'cooker', 'microwave', 'kettle', 'curtains', 'fenicha', 'mubhedha', 'tafura', 'chigaro', 'zvigaro', 'firiji', 'chitofu'],
  },
  {
    slug: 'kids',
    name: 'Kids & baby',
    shona: 'Zvevana',
    kind: 'ITEM',
    words: ['baby', 'babies', 'kids', 'children', 'toys', 'toy', 'pram', 'stroller', 'cot', 'nappies', 'diapers', 'school uniform', 'vana', 'mwana', 'zvitoyi', 'yunifomu'],
  },
  {
    slug: 'farm',
    name: 'Farm & garden',
    shona: 'Zvekurima',
    kind: 'ITEM',
    words: ['farm', 'seeds', 'seed', 'fertiliser', 'fertilizer', 'chickens', 'chicken', 'broilers', 'goats', 'goat', 'cattle', 'cows', 'pigs', 'maize', 'tractor', 'garden', 'mbeu', 'fetiraiza', 'huku', 'mbudzi', 'mombe', 'nguruve', 'chibage', 'munda', 'kurima'],
  },
  {
    slug: 'food',
    name: 'Food & groceries',
    shona: 'Chikafu',
    kind: 'ITEM',
    words: ['food', 'groceries', 'rice', 'meat', 'beef', 'vegetables', 'fruit', 'eggs', 'mealie meal', 'cooking oil', 'bread', 'chikafu', 'mupunga', 'nyama', 'muriwo', 'mazai', 'hupfu', 'mafuta okubikisa', 'chingwa', 'michero'],
  },
  {
    slug: 'building',
    name: 'Building & hardware',
    shona: 'Zvekuvaka',
    kind: 'ITEM',
    words: ['cement', 'bricks', 'brick', 'roofing', 'sheets', 'timber', 'tools', 'paint', 'tiles', 'sand', 'pit sand', 'river sand', 'door', 'window', 'simende', 'zvidhinha', 'chidhinha', 'jecha', 'kuvaka'],
  },
  {
    slug: 'beauty',
    name: 'Health & beauty',
    shona: 'Runako',
    kind: 'ITEM',
    words: ['wig', 'wigs', 'weave', 'hair extensions', 'makeup', 'perfume', 'lotion', 'skincare', 'cosmetics', 'mafuta ekuzora'],
  },
  {
    slug: 'other-items',
    name: 'Other items',
    shona: 'Zvimwewo',
    kind: 'ITEM',
    words: [],
  },
  // ── Services ──
  {
    slug: 'plumbing',
    name: 'Plumbers',
    shona: 'Vanogadzira mapombi',
    kind: 'SERVICE',
    words: ['plumber', 'plumbers', 'plumbing', 'pipe', 'pipes', 'burst pipe', 'leak', 'leaking', 'geyser', 'toilet', 'drain', 'blocked drain', 'borehole', 'pombi', 'mapombi', 'chimbuzi'],
  },
  {
    slug: 'electrical',
    name: 'Electricians',
    shona: 'Vanogadzira magetsi',
    kind: 'SERVICE',
    words: ['electrician', 'electricians', 'electrical', 'wiring', 'rewiring', 'solar installation', 'solar installer', 'sockets', 'magetsi', 'wayaringi'],
  },
  {
    slug: 'repairs',
    name: 'Repairs & handyman',
    shona: 'Kugadzira',
    kind: 'SERVICE',
    words: ['repair', 'repairs', 'fix', 'fixing', 'handyman', 'mechanic', 'mechanics', 'welder', 'welding', 'carpenter', 'carpentry', 'builder', 'painter', 'phone repair', 'kugadzira', 'mugadziri', 'makanika', 'muvezi', 'mupendi'],
  },
  {
    slug: 'cleaning',
    name: 'Cleaning & laundry',
    shona: 'Kuchenesa nekuwacha',
    kind: 'SERVICE',
    words: ['cleaner', 'cleaners', 'cleaning', 'laundry', 'maid', 'housekeeper', 'carpet cleaning', 'car wash', 'kuchenesa', 'kuwacha', 'kutsvaira'],
  },
  {
    slug: 'beauty-services',
    name: 'Hair & beauty services',
    shona: 'Kuruka nekugera',
    kind: 'SERVICE',
    words: ['hairdresser', 'hairdressers', 'hair salon', 'salon', 'barber', 'barbers', 'braids', 'braiding', 'nails', 'manicure', 'makeup artist', 'kuruka', 'kugera', 'bhabha', 'saluni'],
  },
  {
    slug: 'transport',
    name: 'Transport & moving',
    shona: 'Kutakura',
    kind: 'SERVICE',
    words: ['transport', 'moving', 'removals', 'truck hire', 'lorry', 'taxi', 'driver', 'courier', 'kutakura', 'rori', 'mutyairi'],
  },
  {
    slug: 'lessons',
    name: 'Lessons & tutoring',
    shona: 'Kudzidza',
    kind: 'SERVICE',
    words: ['tutor', 'tutors', 'tutoring', 'lessons', 'lesson', 'teacher', 'teachers', 'maths', 'driving lessons', 'extra lessons', 'mudzidzisi', 'kudzidziswa', 'zvidzidzo'],
  },
  {
    slug: 'events',
    name: 'Events & catering',
    shona: 'Mitambo nekubika',
    kind: 'SERVICE',
    words: ['catering', 'caterer', 'dj', 'photographer', 'photography', 'wedding', 'weddings', 'decor', 'tent hire', 'events', 'cake', 'cakes', 'muchato', 'kubika', 'keke'],
  },
  {
    slug: 'other-services',
    name: 'Other services',
    shona: 'Mamwe mabasa',
    kind: 'SERVICE',
    words: [],
  },
];

export const CATEGORY_SLUGS = MARKET_CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export function findCategory(slug: string): MarketCategory | undefined {
  return MARKET_CATEGORIES.find((c) => c.slug === slug);
}

/**
 * Shona words for common things, with the English word sellers usually write, so a Shona
 * search also finds English listings (and the other way round).
 */
export const SHONA_TO_ENGLISH: Record<string, string> = {
  foni: 'phone',
  mafoni: 'phone',
  nhare: 'phone',
  runhare: 'phone',
  terevhizheni: 'tv',
  redhiyo: 'radio',
  komputa: 'computer',
  rapitopu: 'laptop',
  motokari: 'car',
  mota: 'car',
  bhasikoro: 'bicycle',
  mudhudhudhu: 'motorbike',
  mbatya: 'clothes',
  hembe: 'shirt',
  zvipfeko: 'clothes',
  shangu: 'shoes',
  bhachi: 'jacket',
  rokwe: 'dress',
  bhurukwa: 'trousers',
  fenicha: 'furniture',
  mubhedha: 'bed',
  tafura: 'table',
  chigaro: 'chair',
  zvigaro: 'chairs',
  firiji: 'fridge',
  chitofu: 'stove',
  zvitoyi: 'toys',
  mbeu: 'seeds',
  fetiraiza: 'fertiliser',
  huku: 'chickens',
  mbudzi: 'goats',
  mombe: 'cattle',
  nguruve: 'pigs',
  chibage: 'maize',
  chikafu: 'food',
  mupunga: 'rice',
  nyama: 'meat',
  muriwo: 'vegetables',
  mazai: 'eggs',
  hupfu: 'mealie meal',
  chingwa: 'bread',
  michero: 'fruit',
  simende: 'cement',
  zvidhinha: 'bricks',
  chidhinha: 'brick',
  jecha: 'sand',
  pombi: 'pipe',
  mapombi: 'pipes',
  chimbuzi: 'toilet',
  magetsi: 'electrical',
  makanika: 'mechanic',
  muvezi: 'carpenter',
  mupendi: 'painter',
  kuwacha: 'laundry',
  bhabha: 'barber',
  saluni: 'salon',
  rori: 'lorry',
  mutyairi: 'driver',
  mudzidzisi: 'tutor',
  muchato: 'wedding',
  keke: 'cake',
};

/**
 * Towns and suburbs people name in searches ("kuMbare", "in Avondale"). Matched as whole
 * words, with or without the Shona prefixes ku-, mu- and pa-.
 */
export const ZW_PLACES = [
  'Harare', 'Bulawayo', 'Chitungwiza', 'Mutare', 'Gweru', 'Kwekwe', 'Kadoma', 'Masvingo', 'Chinhoyi', 'Marondera',
  'Norton', 'Ruwa', 'Bindura', 'Victoria Falls', 'Hwange', 'Kariba', 'Beitbridge', 'Zvishavane', 'Chegutu', 'Epworth',
  'Rusape', 'Chipinge', 'Gokwe', 'Shurugwi', 'Karoi',
  // Harare
  'Avondale', 'Borrowdale', 'Mbare', 'Highfield', 'Glen View', 'Glen Norah', 'Budiriro', 'Kuwadzana', 'Warren Park',
  'Mabvuku', 'Tafara', 'Dzivarasekwa', 'Mufakose', 'Belvedere', 'Eastlea', 'Greendale', 'Hatfield', 'Mount Pleasant',
  'Marlborough', 'Waterfalls', 'Msasa', 'Westgate', 'Avenues', 'Kambuzuma', 'Hatcliffe', 'Mabelreign', 'Milton Park',
  'Southerton', 'Workington', 'Graniteside', 'Arcadia', 'Braeside', 'Chisipite', 'Greystone Park', 'Emerald Hill',
  'Sunningdale', 'Houghton Park', 'Ardbennie', 'Kambanji', 'Ashdown Park', 'Bluff Hill', 'Pomona',
  // Bulawayo
  'Nkulumane', 'Entumbane', 'Pumula', 'Hillside', 'Lobengula', 'Mpopoma', 'Cowdray Park', 'Magwegwe',
  'Luveve', 'Nketa', 'Emakhandeni', 'Makokoba', 'Mzilikazi', 'Burnside', 'Famona',
  // Chitungwiza and other towns
  'Zengeza', 'Seke', 'St Marys', 'Dangamvura', 'Sakubva', 'Mkoba', 'Mbizo', 'Rimuka',
];

/** Smallest step between bids, by the current bid (US cents). */
export function bidIncrementCents(currentCents: number): number {
  if (currentCents < 2_000) return 50; // under $20: 50c
  if (currentCents < 10_000) return 100; // under $100: $1
  if (currentCents < 100_000) return 500; // under $1,000: $5
  return 1_000; // $10
}

/** Late bids push the end of an auction back this far, so no one can win by sniping. */
export const ANTI_SNIPE_MS = 2 * 60_000;
export const MAX_LISTING_PHOTOS = 8;
export const MAX_ACTIVE_LISTINGS = 100;
export const MAX_SAVED_SEARCHES = 20;
