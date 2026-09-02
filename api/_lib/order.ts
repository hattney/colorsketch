/**
 * Order state machine (PHASE2_GUIDE.md §2, §(A), §(B)).
 *
 * The transition table and the record helpers are pure — they take a record and return a new
 * one, and never touch Redis — so the webhook's idempotency and the checkout guard can be
 * tested without a store. Only `loadOrder` / `saveOrder` / `createOrder` talk to `redis.ts`.
 *
 *   created ──(preview succeeded)──▶ previewed ──(checkout started)──▶ checkout_pending
 *   checkout_pending ──(order_created webhook, signature ok)──▶ paid
 *   paid ──(upscale + upload ok)──▶ delivered
 *   paid ──(3 failed attempts)──▶ failed        → admin alert + refund mail
 *   any state ──(refund webhook)──▶ refunded
 *
 * `previewed → previewed` and `checkout_pending → previewed` exist because a visitor can
 * regenerate or abandon checkout and come back; the paid side of the graph never loops back
 * to an unpaid state.
 */
import type { StyleVariant, SubjectModule } from '../../src/utils/prompt';
import { redisGetJSON, redisSetJSON } from './redis';
import { newOrderId } from './ids';

export type OrderStatus =
  | 'created'
  | 'previewed'
  | 'checkout_pending'
  | 'paid'
  | 'delivered'
  | 'failed'
  | 'refunded';

export interface VariantAsset {
  /** Watermark-free, at the model's own resolution. Saved at preview time; the paid flow issues from this. */
  originalUrl: string;
  /** Watermark-free, upscaled to A4 300 DPI. Saved at delivery. */
  hiResUrl?: string;
}

export interface OrderRecord {
  orderId: string;
  status: OrderStatus;
  /** SHA-256 of the uploaded bytes — also the cache key stem. */
  imageHash: string;
  module: SubjectModule;
  otherWord?: string;
  /**
   * True only when the previews came back from the model. A locally-traced fallback preview
   * has no HD to sell, so `/api/checkout` refuses an order with this false.
   */
  fromModel: boolean;
  variants: Partial<Record<StyleVariant, VariantAsset>>;
  /** Lemon Squeezy order id, from the webhook. */
  lsOrderId?: string;
  /** Buyer email, from the webhook — the stand-in for an account (§(B) 2). */
  email?: string;
  createdAt: string;
  updatedAt: string;
  /** Delivery attempts after `paid`. Capped at 3 (§(A)). */
  attempts: number;
  /** Webhook event ids already applied, for idempotency (§(B)). */
  processedWebhookIds: string[];
}

export const ORDER_TTL_SECONDS = 7 * 24 * 60 * 60;

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  created: ['previewed', 'failed'],
  // `previewed → paid` is allowed too: the paid webhook is authoritative even if our
  // `/api/checkout` write of `checkout_pending` never landed.
  previewed: ['previewed', 'checkout_pending', 'paid'],
  checkout_pending: ['checkout_pending', 'previewed', 'paid'],
  paid: ['paid', 'delivered', 'failed'],
  delivered: ['delivered'],
  failed: ['paid', 'delivered', 'failed'],
  refunded: [],
};

export class OrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Illegal order transition ${from} → ${to}`);
    this.name = 'OrderTransitionError';
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'refunded') return from !== 'refunded';
  return NEXT[from].includes(to);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Returns a new record in state `to`, or throws if the move is not allowed. Pure. */
export function applyTransition(rec: OrderRecord, to: OrderStatus): OrderRecord {
  if (!canTransition(rec.status, to)) throw new OrderTransitionError(rec.status, to);
  return { ...rec, status: to, updatedAt: nowIso() };
}

export function isWebhookProcessed(rec: OrderRecord, eventId: string): boolean {
  return rec.processedWebhookIds.includes(eventId);
}

/** Pure: records that `eventId` has been applied. Keeps the last 50 ids so the list cannot grow without bound. */
export function markWebhookProcessed(rec: OrderRecord, eventId: string): OrderRecord {
  if (rec.processedWebhookIds.includes(eventId)) return rec;
  const ids = [...rec.processedWebhookIds, eventId].slice(-50);
  return { ...rec, processedWebhookIds: ids, updatedAt: nowIso() };
}

const KEY = (orderId: string) => `order:${orderId}`;

export async function loadOrder(orderId: string): Promise<OrderRecord | null> {
  if (!orderId) return null;
  return redisGetJSON<OrderRecord>(KEY(orderId));
}

/** Writes the record, refreshing its 7-day TTL and `updatedAt`. Returns what was stored. */
export async function saveOrder(rec: OrderRecord): Promise<OrderRecord> {
  const stored: OrderRecord = { ...rec, updatedAt: nowIso() };
  await redisSetJSON(KEY(stored.orderId), stored, ORDER_TTL_SECONDS);
  return stored;
}

export interface CreateOrderInput {
  imageHash: string;
  module: SubjectModule;
  otherWord?: string;
  fromModel: boolean;
  variants: Partial<Record<StyleVariant, VariantAsset>>;
  /** Pre-generated id, when the originals were uploaded to `orders/{id}/…` before the record existed. */
  orderId?: string;
  /** The record is only created after a success, so callers pass `previewed` directly. */
  status?: OrderStatus;
}

export async function createOrder(input: CreateOrderInput): Promise<OrderRecord> {
  const ts = nowIso();
  const rec: OrderRecord = {
    orderId: input.orderId ?? newOrderId(),
    status: input.status ?? 'created',
    imageHash: input.imageHash,
    module: input.module,
    otherWord: input.otherWord,
    fromModel: input.fromModel,
    variants: input.variants,
    createdAt: ts,
    updatedAt: ts,
    attempts: 0,
    processedWebhookIds: [],
  };
  return saveOrder(rec);
}
