import type { OrderStatus, Prisma } from '@prisma/client';
import { convertFromUsd } from '../../lib/money';

export const orderInclude = {
  items: { orderBy: { id: 'asc' } },
  vendor: {
    select: {
      id: true,
      userId: true,
      name: true,
      phone: true,
      logoUrl: true,
      lat: true,
      lng: true,
      addressLine: true,
      landmark: true,
    },
  },
  rider: {
    select: {
      id: true,
      userId: true,
      vehicleType: true,
      vehicleMake: true,
      vehicleModel: true,
      vehiclePlate: true,
      vehicleColor: true,
      ratingAvg: true,
      lat: true,
      lng: true,
      heading: true,
      locationUpdatedAt: true,
      user: { select: { name: true, phone: true } },
    },
  },
  customer: { select: { id: true, userId: true, user: { select: { name: true, phone: true } } } },
  payments: { orderBy: { createdAt: 'desc' } },
  ratings: { select: { target: true, score: true, comment: true } },
  dispute: {
    select: { id: true, status: true, reason: true, description: true, resolution: true, refundCents: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  ...orderInclude,
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export type OrderViewer = 'customer' | 'vendor' | 'rider' | 'admin';

export const ACTIVE_STATUSES: OrderStatus[] = ['PLACED', 'ACCEPTED', 'READY_FOR_PICKUP', 'PICKED_UP', 'ON_THE_WAY'];
export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'REJECTED', 'CANCELLED'];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'Order placed',
  ACCEPTED: 'Being prepared',
  READY_FOR_PICKUP: 'Ready for pickup',
  PICKED_UP: 'Picked up',
  ON_THE_WAY: 'On the way',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected by store',
  CANCELLED: 'Cancelled',
};

/**
 * Shapes an order for a given audience. Customers see their delivery PIN;
 * riders see the customer's phone number; vendors see neither. Commission and
 * rider pay are only visible to the parties they concern.
 */
export function presentOrder(order: OrderWithRelations | OrderWithDetail, viewer: OrderViewer) {
  const orderPayment = order.payments.find((p) => p.purpose === 'ORDER');
  const showRiderContact = viewer === 'customer' || viewer === 'admin';
  const showCustomerContact = viewer === 'rider' || viewer === 'admin';

  return {
    id: order.id,
    code: order.code,
    type: order.type,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    vendor: order.vendor
      ? {
          id: order.vendor.id,
          name: order.vendor.name,
          phone: order.vendor.phone,
          logoUrl: order.vendor.logoUrl,
          lat: order.vendor.lat,
          lng: order.vendor.lng,
          addressLine: order.vendor.addressLine,
          landmark: order.vendor.landmark,
        }
      : null,
    rider: order.rider
      ? {
          id: order.rider.id,
          name: order.rider.user.name,
          phone: showRiderContact ? order.rider.user.phone : undefined,
          vehicleType: order.rider.vehicleType,
          vehicleDescription: [order.rider.vehicleColor, order.rider.vehicleMake, order.rider.vehicleModel]
            .filter(Boolean)
            .join(' '),
          vehiclePlate: order.rider.vehiclePlate,
          ratingAvg: Math.round(order.rider.ratingAvg * 10) / 10,
          location:
            viewer !== 'vendor' && order.rider.lat !== null && order.rider.lng !== null
              ? {
                  lat: order.rider.lat,
                  lng: order.rider.lng,
                  heading: order.rider.heading,
                  updatedAt: order.rider.locationUpdatedAt,
                }
              : null,
        }
      : null,
    customer:
      viewer === 'customer'
        ? undefined
        : {
            name: order.customer.user.name ?? 'Customer',
            phone: showCustomerContact ? order.customer.user.phone : undefined,
          },
    pickup: {
      lat: order.pickupLat,
      lng: order.pickupLng,
      address: order.pickupAddress,
      landmark: order.pickupLandmark,
      contactName: order.pickupContactName,
      contactPhone: viewer === 'vendor' ? undefined : order.pickupContactPhone,
    },
    dropoff: {
      lat: order.dropoffLat,
      lng: order.dropoffLng,
      address: order.dropoffAddress,
      landmark: order.dropoffLandmark,
      recipientName: order.recipientName,
      recipientPhone: viewer === 'vendor' ? undefined : order.recipientPhone,
    },
    parcel: order.type === 'PARCEL' ? { description: order.parcelDescription, size: order.parcelSize } : null,
    distanceKm: order.distanceKm,
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      name: i.name,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
      notes: i.notes,
    })),
    amounts: {
      subtotalCents: order.subtotalCents,
      deliveryFeeCents: order.deliveryFeeCents,
      tipCents: order.tipCents,
      totalCents: order.totalCents,
      currency: order.currency,
      exchangeRate: order.exchangeRate,
      totalLocalCents: convertFromUsd(order.totalCents, order.currency, order.exchangeRate),
      ...(viewer === 'vendor' || viewer === 'admin'
        ? {
            commissionRateBps: order.commissionRateBps,
            commissionCents: order.commissionCents,
            vendorEarningCents: order.vendorEarningCents,
          }
        : {}),
      ...(viewer === 'rider' || viewer === 'admin' ? { riderEarningCents: order.riderEarningCents } : {}),
    },
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    payment:
      orderPayment && viewer !== 'vendor'
        ? {
            id: orderPayment.id,
            method: orderPayment.method,
            status: orderPayment.status,
            currency: orderPayment.currency,
            amountCents: orderPayment.amountCents,
            redirectUrl: viewer === 'customer' ? orderPayment.redirectUrl : undefined,
            instructions: viewer === 'customer' ? orderPayment.instructions : undefined,
            paynowReference: viewer === 'admin' ? orderPayment.paynowReference : undefined,
          }
        : null,
    deliveryPin: viewer === 'customer' ? order.deliveryPin : undefined,
    proof:
      order.proofType && viewer !== 'vendor' ? { type: order.proofType, photoUrl: order.proofPhotoUrl } : null,
    notes: order.notes,
    prepMinutes: order.prepMinutes,
    estimatedReadyAt: order.estimatedReadyAt,
    cancelReason: order.cancelReason,
    rejectReason: order.rejectReason,
    ratings: viewer === 'customer' || viewer === 'admin' ? order.ratings : undefined,
    canRate:
      viewer === 'customer' && order.status === 'DELIVERED' && order.ratings.length < (order.type === 'PARCEL' ? 1 : 2),
    dispute: viewer === 'customer' || viewer === 'admin' ? order.dispute : undefined,
    timestamps: {
      createdAt: order.createdAt,
      placedAt: order.placedAt,
      acceptedAt: order.acceptedAt,
      readyAt: order.readyAt,
      assignedAt: order.assignedAt,
      pickedUpAt: order.pickedUpAt,
      onTheWayAt: order.onTheWayAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
    },
    events:
      'events' in order
        ? order.events.map((e) => ({ id: e.id, type: e.type, status: e.status, message: e.message, createdAt: e.createdAt }))
        : undefined,
  };
}

export type PresentedOrder = ReturnType<typeof presentOrder>;
