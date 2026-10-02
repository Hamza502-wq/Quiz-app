import type { Currency, OpeningHour, Order, PaymentMethod, PaymentStatus, Product } from '@doorstep/web-shared';

/** Customer-facing API shapes not covered by the shared dashboard types. Money is in US-dollar cents. */

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
}

/** GET /vendors list item. Delivery fields are null when no location was sent. */
export interface VendorSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  lat: number;
  lng: number;
  addressLine: string;
  landmark: string | null;
  city: string;
  category?: { slug: string; name: string };
  isOpen: boolean;
  isAcceptingOrders: boolean;
  avgPrepMinutes: number;
  minOrderCents: number;
  ratingAvg: number;
  ratingCount: number;
  openingHours: OpeningHour[];
  distanceKm: number | null;
  deliveryFeeCents: number | null;
  etaMinutes: number | null;
  deliverable: boolean;
}

export interface DeliveryEstimate {
  distanceKm: number;
  deliveryFeeCents: number;
  etaMinutes: number;
  deliverable: boolean;
}

export interface MenuSectionWithProducts {
  id: string;
  name: string;
  products: Product[];
}

/** GET /vendors/:idOrSlug */
export interface VendorMenu {
  vendor: Omit<VendorSummary, 'distanceKm' | 'deliveryFeeCents' | 'etaMinutes' | 'deliverable'>;
  delivery: DeliveryEstimate | null;
  sections: MenuSectionWithProducts[];
}

export interface Review {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  customerName: string;
}

export interface Address {
  id: string;
  label: string;
  lat: number;
  lng: number;
  street: string | null;
  suburb: string | null;
  city: string;
  landmark: string;
  isDefault: boolean;
}

export interface Quote {
  lines?: Array<{ productId: string; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }>;
  subtotalCents: number;
  deliveryFeeCents: number;
  tipCents: number;
  totalCents: number;
  currency: Currency;
  exchangeRate: number;
  totalLocalCents: number;
  distanceKm: number;
  etaMinutes: number;
}

export interface PaymentInfo {
  id: string;
  orderId: string;
  purpose: string;
  method: PaymentMethod;
  status: PaymentStatus;
  currency: Currency;
  amountCents: number;
  amountUsdCents: number;
  reference: string;
  redirectUrl: string | null;
  instructions: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** Order as the customer sees it (adds the delivery PIN, rating flag and payment links). */
export type CustomerOrder = Omit<Order, 'payment'> & {
  deliveryPin?: string | null;
  canRate?: boolean;
  payment:
    | (NonNullable<Order['payment']> & { redirectUrl?: string | null; instructions?: string | null })
    | null;
};

export interface CheckoutResult {
  order: CustomerOrder;
  payment: PaymentInfo | null;
  paymentError: string | null;
}

export interface ReorderResult {
  vendorId: string;
  vendorName: string | undefined;
  items: Array<{ productId: string; name: string; quantity: number; priceCents: number; priceChanged: boolean }>;
  unavailable: string[];
}

export interface TrackingSnapshot {
  orderId: string;
  status: Order['status'];
  rider: {
    name: string | null;
    photoUrl: string | null;
    vehiclePlate: string | null;
    location: { lat: number; lng: number; heading: number | null; updatedAt: string | null } | null;
  } | null;
  etaMinutes: number | null;
  pickup: { lat: number; lng: number };
  dropoff: { lat: number; lng: number };
  updatedAt: string;
}

export interface RiderLocationEvent {
  orderId: string;
  lat: number;
  lng: number;
  heading: number | null;
  etaMinutes: number | null;
  at: string;
}

export interface ChatMessage {
  id: string;
  orderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
  senderId: string;
}
