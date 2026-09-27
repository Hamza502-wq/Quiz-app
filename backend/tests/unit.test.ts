import { describe, expect, it } from 'vitest';
import { isOpenAt, isoWeekKey, dayKey, startOfLocalDay, startOfLocalWeek } from '../src/lib/time';
import { haversineKm, pointInPolygon, roadDistanceKm, travelMinutes } from '../src/lib/geo';
import { applyBps, convertFromUsd, convertToUsd } from '../src/lib/money';
import { normalizePhone, toLocalZwMsisdn } from '../src/lib/phone';
import { buildBreakdown, deliveryFeeCents, riderPayCents } from '../src/modules/pricing/pricing.service';
import { settingsSchema } from '../src/modules/settings/settings.service';
import { estimateEtaMinutes } from '../src/modules/orders/tracking.service';
import {
  generateHash,
  mapPaynowStatus,
  parseFields,
  parseStatusMessage,
  verifyHash,
} from '../src/modules/payments/paynow.client';

// Harare is UTC+2: 10:00 Harare on Wednesday 2026-09-30 = 08:00Z
const harare = (iso: string) => new Date(`${iso}+02:00`);

describe('opening hours (Africa/Harare)', () => {
  const weekdays = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: '08:00', closesAt: '17:00' }));

  it('is open inside and closed outside the window', () => {
    expect(isOpenAt(weekdays, harare('2026-09-30T10:00:00'))).toBe(true);
    expect(isOpenAt(weekdays, harare('2026-09-30T07:59:00'))).toBe(false);
    expect(isOpenAt(weekdays, harare('2026-09-30T17:00:00'))).toBe(false);
    expect(isOpenAt(weekdays, harare('2026-09-27T10:00:00'))).toBe(false); // Sunday
  });

  it('handles windows past midnight', () => {
    const late = [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }]; // Friday night
    expect(isOpenAt(late, harare('2026-10-02T23:30:00'))).toBe(true); // Fri
    expect(isOpenAt(late, harare('2026-10-03T01:30:00'))).toBe(true); // Sat early
    expect(isOpenAt(late, harare('2026-10-03T02:30:00'))).toBe(false);
  });

  it('treats equal open/close as 24 hours', () => {
    expect(isOpenAt([{ dayOfWeek: 3, opensAt: '00:00', closesAt: '00:00' }], harare('2026-09-30T03:00:00'))).toBe(true);
  });

  it('computes Harare day/week keys and boundaries', () => {
    expect(dayKey(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01'); // 01:30 Harare
    expect(isoWeekKey(harare('2026-09-27T12:00:00'))).toBe('2026-W39');
    expect(isoWeekKey(harare('2026-09-28T00:30:00'))).toBe('2026-W40');
    expect(startOfLocalDay(harare('2026-09-30T15:00:00')).toISOString()).toBe('2026-09-29T22:00:00.000Z');
    expect(startOfLocalWeek(harare('2026-10-01T15:00:00')).toISOString()).toBe('2026-09-27T22:00:00.000Z');
  });
});

describe('geo', () => {
  it('computes distances', () => {
    const cbd = { lat: -17.8292, lng: 31.0522 };
    const borrowdale = { lat: -17.7584, lng: 31.0886 };
    const km = haversineKm(cbd, borrowdale);
    expect(km).toBeGreaterThan(8.5);
    expect(km).toBeLessThan(9.2);
    expect(roadDistanceKm(cbd, borrowdale)).toBeCloseTo(km * 1.3, 1);
    expect(travelMinutes(10, 25)).toBe(24);
    expect(travelMinutes(0, 25)).toBe(1);
  });

  it('point in polygon', () => {
    const square: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 1.5, lng: 0.5 }, square)).toBe(false);
  });
});

describe('money & phone', () => {
  it('converts currencies and applies basis points', () => {
    expect(convertFromUsd(1000, 'USD', 26.8)).toBe(1000);
    expect(convertFromUsd(1000, 'ZWG', 26.8)).toBe(26800);
    expect(convertToUsd(26800, 'ZWG', 26.8)).toBe(1000);
    expect(applyBps(1234, 1500)).toBe(185);
  });

  it('normalises Zimbabwean numbers', () => {
    expect(normalizePhone('0771 234 567')).toBe('+263771234567');
    expect(normalizePhone('263771234567')).toBe('+263771234567');
    expect(normalizePhone('+263 71 234 5678')).toBe('+263712345678');
    expect(normalizePhone('12345')).toBeNull();
    expect(toLocalZwMsisdn('+263771234567')).toBe('0771234567');
  });
});

describe('pricing', () => {
  const settings = settingsSchema.parse({});

  it('uses global rates with a minimum fee and zone overrides', () => {
    expect(deliveryFeeCents(0.5, settings, null)).toBe(settings.minDeliveryFeeCents);
    expect(deliveryFeeCents(10, settings, null)).toBe(150 + 500);
    const zone = { deliveryFeeBaseCents: 300, deliveryFeePerKmCents: null, riderBaseCents: 200, riderPerKmCents: 60 };
    expect(deliveryFeeCents(10, settings, zone)).toBe(300 + 500);
    expect(riderPayCents(10, settings, zone)).toBe(200 + 600);
  });

  it('builds a consistent breakdown', () => {
    const b = buildBreakdown({ subtotalCents: 2000, deliveryFeeCents: 400, tipCents: 100, commissionRateBps: 1500, riderEarningCents: 300 });
    expect(b.totalCents).toBe(2500);
    expect(b.commissionCents).toBe(300);
    expect(b.vendorEarningCents).toBe(1700);
  });
});

describe('ETA', () => {
  const base = {
    type: 'DELIVERY' as const,
    pickupLat: -17.8312,
    pickupLng: 31.0456,
    dropoffLat: -17.7925,
    dropoffLng: 31.0487,
    distanceKm: 5,
    estimatedReadyAt: null,
  };
  it('estimates remaining minutes by status', () => {
    const settings = { riderAvgSpeedKmh: 25 };
    expect(estimateEtaMinutes({ ...base, status: 'ON_THE_WAY' }, null, settings)).toBe(12);
    expect(estimateEtaMinutes({ ...base, status: 'ON_THE_WAY' }, { lat: -17.7925, lng: 31.0487 }, settings)).toBe(1);
    expect(estimateEtaMinutes({ ...base, status: 'DELIVERED' }, null, settings)).toBeNull();
    const now = new Date();
    const prep = estimateEtaMinutes({ ...base, status: 'ACCEPTED', estimatedReadyAt: new Date(now.getTime() + 10 * 60_000) }, null, settings, now);
    expect(prep).toBe(10 + 12);
  });
});

describe('Paynow protocol', () => {
  const key = '3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977'; // matches PAYNOW_USD_INTEGRATION_KEY in vitest config

  it('hashes values in order followed by the integration key (SHA512, uppercase)', () => {
    const fields: Array<[string, string]> = [
      ['id', '1201'],
      ['reference', 'TEST REF'],
      ['amount', '99.99'],
      ['additionalinfo', 'A test ticket transaction'],
      ['returnurl', 'http://www.google.com/search?q=returnurl'],
      ['resulturl', 'http://www.google.com/search?q=resulturl'],
      ['status', 'Message'],
    ];
    const hash = generateHash(fields, key);
    expect(hash).toMatch(/^[0-9A-F]{128}$/);
    // Known vector from the Paynow integration guide.
    expect(hash).toBe(
      '2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689',
    );
    expect(verifyHash([...fields, ['hash', hash]], key)).toBe(true);
    expect(verifyHash([...fields, ['hash', hash.replace(/.$/, '0')]], key)).toBe(false);
  });

  it('maps statuses', () => {
    expect(mapPaynowStatus('Paid')).toBe('PAID');
    expect(mapPaynowStatus('Awaiting Delivery')).toBe('PAID');
    expect(mapPaynowStatus('Cancelled')).toBe('CANCELLED');
    expect(mapPaynowStatus('Failed')).toBe('FAILED');
    expect(mapPaynowStatus('Sent')).toBe('PENDING');
  });

  it('parses and authenticates status messages', () => {
    const fields: Array<[string, string]> = [
      ['reference', 'DSP-1'],
      ['paynowreference', '12345'],
      ['amount', '10.00'],
      ['status', 'Paid'],
      ['pollurl', 'https://www.paynow.co.zw/Interface/CheckPayment/?guid=abc'],
    ];
    const body = new URLSearchParams([...fields, ['hash', generateHash(fields, key)]]).toString();
    expect(parseFields(body)[0]).toEqual(['reference', 'DSP-1']);
    const status = parseStatusMessage(body, 'USD');
    expect(status).toMatchObject({ reference: 'DSP-1', paynowReference: '12345', mapped: 'PAID' });

    const tampered = body.replace('amount=10.00', 'amount=1.00');
    expect(() => parseStatusMessage(tampered, 'USD')).toThrow(/hash mismatch/);
    expect(() => parseStatusMessage(body, 'ZWG')).toThrow(/not configured/);
  });
});
