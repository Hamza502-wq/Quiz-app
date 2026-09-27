/** Types mirroring the DoorStep API responses. Money is in US-dollar cents. */

export type RoleName = 'CUSTOMER' | 'RIDER' | 'VENDOR' | 'ADMIN';
export type Currency = 'USD' | 'ZWG';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';
export type PaymentMethod = 'ECOCASH' | 'ONEMONEY' | 'CARD' | 'CASH';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type PayoutMethod = 'ECOCASH' | 'ONEMONEY' | 'BANK';
export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'REJECTED';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Profile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  roles: RoleName[];
  preferredCurrency: Currency;
  notificationChannel: 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';
  hasPassword: boolean;
  vendor: { id: string; status: ApprovalStatus; name: string; slug: string } | null;
  rider: { id: string; status: ApprovalStatus; isOnline: boolean } | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: Profile;
}

export interface OpeningHour {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export interface VendorProfile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string;
  email: string | null;
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
  status: ApprovalStatus;
  zone: { id: string; name: string } | null;
  commissionRateBps: number | null;
  payoutMethod: PayoutMethod | null;
  payoutAccount: string | null;
  payoutAccountName: string | null;
  payoutBankName: string | null;
  timezone: string;
}

export interface Product {
  id: string;
  vendorId: string;
  sectionId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  thumbUrl: string | null;
  isAvailable: boolean;
  trackStock: boolean;
  stockQty: number | null;
  sortOrder: number;
  rawStockQty?: number;
  rawIsAvailable?: boolean;
}

export interface MenuSection {
  id: string;
  name: string;
  sortOrder: number;
  _count?: { products: number };
}

export interface OrderItem {
  id: string;
  productId: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  notes: string | null;
}

export interface OrderEvent {
  id: string;
  type: string;
  status: OrderStatus | null;
  message: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  code: string;
  type: 'DELIVERY' | 'PARCEL';
  status: OrderStatus;
  statusLabel: string;
  vendor: {
    id: string;
    name: string;
    phone: string;
    logoUrl: string | null;
    lat: number;
    lng: number;
    addressLine: string;
    landmark: string | null;
  } | null;
  rider: {
    id: string;
    name: string | null;
    phone?: string;
    vehicleType: string;
    vehicleDescription: string;
    vehiclePlate: string;
    ratingAvg: number;
    location: { lat: number; lng: number; heading: number | null; updatedAt: string | null } | null;
  } | null;
  customer?: { name: string; phone?: string };
  pickup: { lat: number; lng: number; address: string; landmark: string | null; contactName: string | null; contactPhone?: string | null };
  dropoff: { lat: number; lng: number; address: string; landmark: string; recipientName: string | null; recipientPhone?: string | null };
  parcel: { description: string | null; size: 'SMALL' | 'MEDIUM' | 'LARGE' | null } | null;
  distanceKm: number;
  items: OrderItem[];
  amounts: {
    subtotalCents: number;
    deliveryFeeCents: number;
    tipCents: number;
    totalCents: number;
    currency: Currency;
    exchangeRate: number;
    totalLocalCents: number;
    commissionRateBps?: number;
    commissionCents?: number;
    vendorEarningCents?: number;
    riderEarningCents?: number;
  };
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  payment: {
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    currency: Currency;
    amountCents: number;
    paynowReference?: string | null;
  } | null;
  proof: { type: 'PIN' | 'PHOTO'; photoUrl: string | null } | null;
  notes: string | null;
  prepMinutes: number | null;
  estimatedReadyAt: string | null;
  cancelReason: string | null;
  rejectReason: string | null;
  ratings?: Array<{ target: 'VENDOR' | 'RIDER'; score: number; comment: string | null }>;
  dispute?: { id: string; status: string; reason: string; description: string; resolution: string | null; refundCents: number | null; createdAt: string } | null;
  timestamps: {
    createdAt: string;
    placedAt: string | null;
    acceptedAt: string | null;
    readyAt: string | null;
    assignedAt: string | null;
    pickedUpAt: string | null;
    onTheWayAt: string | null;
    deliveredAt: string | null;
    cancelledAt: string | null;
  };
  events?: OrderEvent[];
}

export interface Payout {
  id: string;
  payeeType: 'RIDER' | 'VENDOR';
  riderId: string | null;
  vendorId: string | null;
  amountCents: number;
  method: PayoutMethod;
  accountNumber: string;
  accountName: string | null;
  bankName: string | null;
  status: PayoutStatus;
  reference: string | null;
  notes: string | null;
  isAutomatic: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface VendorBalance {
  lifetimeEarningsCents: number;
  paidOutCents: number;
  pendingPayoutCents: number;
  balanceCents: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
}
