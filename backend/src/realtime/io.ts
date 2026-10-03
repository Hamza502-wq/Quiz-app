import type { Server } from 'socket.io';

/**
 * Holds the Socket.IO server so services can emit without importing the socket
 * bootstrap (avoids circular imports). All emits are no-ops until `setIo` runs.
 */
let io: Server | null = null;

export function setIo(server: Server | null): void {
  io = server;
}

export const rooms = {
  user: (id: string) => `user:${id}`,
  order: (id: string) => `order:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  rider: (id: string) => `rider:${id}`,
  /** Marketplace listing: live auction bids. */
  listing: (id: string) => `listing:${id}`,
  admins: 'admins',
};

export function emitTo(room: string | string[], event: string, payload: unknown): void {
  io?.to(room).emit(event, payload);
}

export const ServerEvents = {
  orderUpdated: 'order:updated',
  riderLocation: 'order:rider_location',
  riderLocationAdmin: 'rider:location',
  dispatchOffer: 'dispatch:offer',
  dispatchOfferCancelled: 'dispatch:offer_cancelled',
  vendorNewOrder: 'vendor:new_order',
  chatMessage: 'chat:message',
  notification: 'notification',
  riderStatus: 'rider:status',
  listingBid: 'listing:bid',
  marketMessage: 'market:message',
  marketOffer: 'market:offer',
} as const;
