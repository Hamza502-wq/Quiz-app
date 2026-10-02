/**
 * Sample data for the in-browser demo (mirrors backend/prisma/seed.ts).
 * Demo stores are open around the clock so the demo works at any hour.
 */

export const DEMO_SETTINGS = {
  deliveryFeeBaseCents: 150,
  deliveryFeePerKmCents: 50,
  minDeliveryFeeCents: 200,
  parcelSurchargeCents: { SMALL: 0, MEDIUM: 100, LARGE: 250 } as Record<'SMALL' | 'MEDIUM' | 'LARGE', number>,
  maxDeliveryKm: 25,
  zigPerUsd: 26.8,
  riderAvgSpeedKmh: 25,
  maxTipCents: 5000,
};

/** A spot in Avondale, Harare — used as the default demo delivery location. */
export const DEMO_LOCATION = { lat: -17.8052, lng: 31.0445, label: 'Avondale, Harare (sample)' };

export const DEMO_CATEGORIES = [
  { id: 'cat-food', name: 'Food', slug: 'food', icon: 'restaurant', sortOrder: 1 },
  { id: 'cat-groceries', name: 'Groceries', slug: 'groceries', icon: 'local_grocery_store', sortOrder: 2 },
  { id: 'cat-pharmacy', name: 'Pharmacy', slug: 'pharmacy', icon: 'local_pharmacy', sortOrder: 3 },
  { id: 'cat-parcels', name: 'Parcels', slug: 'parcels', icon: 'inventory_2', sortOrder: 4 },
  { id: 'cat-electronics', name: 'Electronics & phones', slug: 'electronics', icon: 'devices', sortOrder: 5 },
  { id: 'cat-fashion', name: 'Clothing & shoes', slug: 'fashion', icon: 'checkroom', sortOrder: 6 },
  { id: 'cat-beauty', name: 'Beauty & personal care', slug: 'beauty', icon: 'spa', sortOrder: 7 },
  { id: 'cat-hardware', name: 'Hardware & tools', slug: 'hardware', icon: 'hardware', sortOrder: 8 },
  { id: 'cat-home', name: 'Home & kitchen', slug: 'home', icon: 'chair', sortOrder: 9 },
  { id: 'cat-books', name: 'Books & stationery', slug: 'books', icon: 'menu_book', sortOrder: 10 },
  { id: 'cat-gifts', name: 'Flowers & gifts', slug: 'gifts', icon: 'local_florist', sortOrder: 11 },
  { id: 'cat-farm', name: 'Farm & garden', slug: 'farm', icon: 'yard', sortOrder: 12 },
  { id: 'cat-other', name: 'Other shops', slug: 'other', icon: 'storefront', sortOrder: 13 },
];

type Item = [name: string, priceCents: number, description: string, stock?: number];

export interface DemoVendorSeed {
  id: string;
  name: string;
  slug: string;
  category: 'food' | 'groceries' | 'pharmacy';
  description: string;
  phone: string;
  lat: number;
  lng: number;
  addressLine: string;
  landmark: string;
  city: string;
  avgPrepMinutes: number;
  minOrderCents: number;
  ratingAvg: number;
  ratingCount: number;
  menu: Array<{ section: string; items: Item[] }>;
  reviews: Array<[customerName: string, score: number, comment: string | null, daysAgo: number]>;
}

export const DEMO_VENDORS: DemoVendorSeed[] = [
  {
    id: 'v-sadza',
    name: 'Sadza Republic',
    slug: 'sadza-republic',
    category: 'food',
    description: 'Traditional Zimbabwean plates — sadza, nyama, muriwo and more.',
    phone: '+263772000101',
    lat: -17.8312,
    lng: 31.0456,
    addressLine: '45 Samora Machel Ave, Harare CBD',
    landmark: 'Next to the green pharmacy, opposite the bus stop',
    city: 'Harare',
    avgPrepMinutes: 20,
    minOrderCents: 300,
    ratingAvg: 4.6,
    ratingCount: 24,
    menu: [
      {
        section: 'Sadza plates',
        items: [
          ['Sadza & Beef Stew', 550, 'Hand-stirred sadza with slow-cooked beef and muriwo.'],
          ['Sadza & Road-runner Chicken', 650, 'Free-range chicken stew, sadza and covo.'],
          ['Sadza & Matemba', 450, 'Crispy kapenta with tomato relish.'],
          ['Sadza & Oxtail', 850, 'Rich oxtail stew — weekend favourite.', 25],
        ],
      },
      {
        section: 'Sides & drinks',
        items: [
          ['Muriwo une Dovi', 200, 'Greens in peanut butter sauce.'],
          ['Maheu (500ml)', 150, 'Traditional fermented maize drink.'],
          ['Mazoe Orange (2L)', 350, 'The classic Zimbabwean cordial.'],
        ],
      },
    ],
    reviews: [
      ['Tatenda', 5, 'The oxtail is unbeatable, and it arrived hot.', 2],
      ['Anesu', 4, 'Generous portions. Delivery took a little longer at lunchtime.', 5],
      ['Farai', 5, null, 9],
    ],
  },
  {
    id: 'v-pizza',
    name: 'Borrowdale Pizza Co.',
    slug: 'borrowdale-pizza-co',
    category: 'food',
    description: 'Wood-fired pizzas, burgers and shakes.',
    phone: '+263772000102',
    lat: -17.7584,
    lng: 31.0886,
    addressLine: 'Borrowdale Village, Harare',
    landmark: 'Upstairs, blue door beside the bank',
    city: 'Harare',
    avgPrepMinutes: 25,
    minOrderCents: 500,
    ratingAvg: 4.4,
    ratingCount: 18,
    menu: [
      {
        section: 'Pizzas',
        items: [
          ['Margherita (Large)', 900, 'Tomato, mozzarella and basil.'],
          ['Peri-Peri Chicken (Large)', 1200, 'Grilled chicken, peppers and peri-peri drizzle.'],
          ['Boerewors & Onion (Large)', 1150, 'A local twist on a classic.'],
        ],
      },
      {
        section: 'Burgers',
        items: [
          ['Classic Beef Burger', 750, '180g patty, cheese, tomato and chips.'],
          ['Chicken Burger', 700, 'Crumbed chicken breast with slaw and chips.'],
        ],
      },
      {
        section: 'Drinks',
        items: [
          ['Chocolate Shake', 400, 'Thick and creamy.'],
          ['Coca-Cola (500ml)', 150, 'Ice cold.'],
        ],
      },
    ],
    reviews: [
      ['Kuda', 5, 'Best peri-peri pizza in Harare.', 1],
      ['Rumbi', 4, 'Shake was a bit melted but the burger was great.', 6],
    ],
  },
  {
    id: 'v-freshmart',
    name: 'FreshMart Groceries',
    slug: 'freshmart-groceries',
    category: 'groceries',
    description: 'Fresh produce, pantry staples and household essentials.',
    phone: '+263772000103',
    lat: -17.8052,
    lng: 31.0395,
    addressLine: '12 Second Street Extension, Avondale',
    landmark: 'Behind Avondale shops, white gate with yellow sign',
    city: 'Harare',
    avgPrepMinutes: 15,
    minOrderCents: 1000,
    ratingAvg: 4.7,
    ratingCount: 31,
    menu: [
      {
        section: 'Staples',
        items: [
          ['Roller Meal (10kg)', 850, 'Super-refined white maize meal.', 60],
          ['Rice (2kg)', 350, 'Long-grain white rice.', 80],
          ['Cooking Oil (2L)', 450, 'Sunflower oil.', 50],
          ['Sugar (2kg)', 300, 'Brown sugar.', 70],
        ],
      },
      {
        section: 'Fresh produce',
        items: [
          ['Tomatoes (1kg)', 150, 'Locally grown.', 40],
          ['Onions (1kg)', 120, 'Brown onions.', 40],
          ['Covo / Rape bundle', 50, 'Freshly harvested greens.', 100],
          ['Bananas (1kg)', 180, 'Sweet and ripe.', 30],
        ],
      },
      {
        section: 'Dairy & bakery',
        items: [
          ['Fresh Milk (2L)', 250, 'Full cream.', 45],
          ['Bread (loaf)', 120, 'Baked this morning.', 60],
          ['Eggs (tray of 30)', 550, 'Farm fresh.', 3],
        ],
      },
    ],
    reviews: [
      ['Chipo', 5, 'Everything fresh and the rider called ahead.', 3],
      ['Tendai', 5, 'Saves me a trip every weekend.', 8],
      ['Nyasha', 4, null, 12],
    ],
  },
  {
    id: 'v-greenleaf',
    name: 'Greenleaf Pharmacy',
    slug: 'greenleaf-pharmacy',
    category: 'pharmacy',
    description: 'Over-the-counter medicines, vitamins and personal care.',
    phone: '+263772000104',
    lat: -17.7755,
    lng: 31.0521,
    addressLine: 'Mount Pleasant Shopping Centre',
    landmark: 'Green cross sign, next to the post office',
    city: 'Harare',
    avgPrepMinutes: 10,
    minOrderCents: 0,
    ratingAvg: 4.8,
    ratingCount: 12,
    menu: [
      {
        section: 'Pain & fever',
        items: [
          ['Paracetamol 500mg (20)', 150, 'Pain and fever relief.', 100],
          ['Ibuprofen 200mg (24)', 250, 'Anti-inflammatory pain relief.', 80],
        ],
      },
      {
        section: 'Cold & flu',
        items: [
          ['Cough Syrup (100ml)', 450, 'Soothing cough relief.', 30],
          ['Vitamin C 1000mg (30)', 600, 'Immune support.', 40],
        ],
      },
      {
        section: 'Personal care',
        items: [
          ['Hand Sanitiser (500ml)', 300, '70% alcohol.', 50],
          ['Sunscreen SPF50', 900, 'Broad spectrum protection.', 0],
        ],
      },
    ],
    reviews: [['Blessing', 5, 'Quick and discreet. Thank you!', 4]],
  },
  {
    id: 'v-braai',
    name: 'Bulawayo Braai House',
    slug: 'bulawayo-braai-house',
    category: 'food',
    description: 'Flame-grilled meats and sides from the City of Kings.',
    phone: '+263772000105',
    lat: -20.1497,
    lng: 28.5832,
    addressLine: '88 Jason Moyo Street, Bulawayo',
    landmark: 'Corner with 9th Avenue, red awning',
    city: 'Bulawayo',
    avgPrepMinutes: 30,
    minOrderCents: 400,
    ratingAvg: 4.5,
    ratingCount: 9,
    menu: [
      {
        section: 'From the grill',
        items: [
          ['Boerewors Roll', 400, 'Grilled boerewors in a fresh roll.'],
          ['T-Bone & Pap', 1100, '300g T-bone, pap and chakalaka.'],
          ['Braai Platter for Two', 2200, 'Wors, chops, chicken, pap and salads.'],
        ],
      },
    ],
    reviews: [['Sipho', 5, 'Proper Bulawayo braai.', 7]],
  },
];

export const DEMO_RIDERS = [
  { id: 'r-tawanda', name: 'Tawanda Sibanda', phone: '+263773000201', vehicleType: 'MOTORBIKE', vehicleDescription: 'Red Honda Ace 125', vehiclePlate: 'AEF 1234', ratingAvg: 4.9 },
  { id: 'r-kudzai', name: 'Kudzai Maposa', phone: '+263773000202', vehicleType: 'MOTORBIKE', vehicleDescription: 'Blue Yamaha YBR', vehiclePlate: 'ADK 5521', ratingAvg: 4.7 },
];

/** A ready-made customer so visitors can sign in with 0774 000 301 and see saved addresses. */
export const DEMO_CUSTOMER = {
  phone: '+263774000301',
  name: 'Tatenda Mhlanga',
  addresses: [
    { label: 'Home', lat: -17.7925, lng: 31.0487, street: '7 Lanark Road', suburb: 'Belgravia', city: 'Harare', landmark: 'Blue gate opposite Spar, ring twice' },
    { label: 'Work', lat: -17.8293, lng: 31.0522, street: 'Kopje Plaza, Jason Moyo Ave', suburb: 'CBD', city: 'Harare', landmark: '3rd floor reception, ask for Tatenda' },
  ],
};

/** The one-time code every demo sign-in accepts. */
export const DEMO_OTP = '123456';
