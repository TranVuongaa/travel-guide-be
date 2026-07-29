import { canonicalizePublicUrl } from './url-safety.util';

describe('canonicalizePublicUrl', () => {
  it('should remove fragments and tracking parameters', () => {
    expect(
      canonicalizePublicUrl(
        'https://Example.com/travel/?utm_source=news&b=2&a=1#section',
      ),
    ).toBe('https://example.com/travel?a=1&b=2');
  });

  it.each([
    'file:///etc/passwd',
    'http://localhost/admin',
    'http://127.0.0.1/private',
    'http://10.0.0.1/private',
    'http://100.64.0.1/private',
    'http://[::1]/private',
    'http://[::ffff:127.0.0.1]/private',
  ])('should reject unsafe URL %s', (url) => {
    expect(() => canonicalizePublicUrl(url)).toThrow();
  });
});
