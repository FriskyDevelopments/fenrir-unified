import { describe, expect, it } from 'vitest';
import { cloudflareConfigured, registrableApex } from '../_lib/cloudflare-dns';

describe('registrableApex', () => {
  it('returns the apex for a subdomain lock URL', () => {
    expect(registrableApex('join.customer-domain.com')).toBe('customer-domain.com');
    expect(registrableApex('main.brand.io')).toBe('brand.io');
  });

  it('passes through an apex unchanged', () => {
    expect(registrableApex('brand.dev')).toBe('brand.dev');
  });

  it('handles two-level public suffixes', () => {
    expect(registrableApex('join.brand.co.uk')).toBe('brand.co.uk');
    expect(registrableApex('shop.brand.com.mx')).toBe('brand.com.mx');
  });

  it('normalizes scheme, path and trailing dot', () => {
    expect(registrableApex('https://join.brand.com/main')).toBe('brand.com');
    expect(registrableApex('brand.com.')).toBe('brand.com');
  });
});

describe('cloudflareConfigured', () => {
  it('is false when either secret is missing', () => {
    expect(cloudflareConfigured({})).toBe(false);
    expect(cloudflareConfigured({ CLOUDFLARE_API_TOKEN: 'x' })).toBe(false);
    expect(cloudflareConfigured({ CLOUDFLARE_ACCOUNT_ID: 'a' })).toBe(false);
    expect(cloudflareConfigured({ CLOUDFLARE_API_TOKEN: '  ', CLOUDFLARE_ACCOUNT_ID: 'a' })).toBe(
      false
    );
  });

  it('is true only when both secrets are present', () => {
    expect(cloudflareConfigured({ CLOUDFLARE_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' })).toBe(
      true
    );
  });
});
