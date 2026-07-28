import {
  ENTITY_IMAGE_SEEDS,
  EntityImageSeedRecord,
} from './entity-image-seed.data';
import { CommonsImageResolver } from './commons-image.resolver';

const seed: EntityImageSeedRecord = ENTITY_IMAGE_SEEDS[0];

function commonsResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      query: {
        pages: [
          {
            title: seed.fileTitle,
            imageinfo: [
              {
                thumburl:
                  'https://upload.wikimedia.org/example/1600px-image.jpg',
                url: 'https://upload.wikimedia.org/example/image.jpg',
                thumbwidth: 1600,
                thumbheight: 900,
                width: 3200,
                height: 1800,
                mime: 'image/jpeg',
                mediatype: 'BITMAP',
                extmetadata: {
                  Artist: {
                    value: '<a href="/wiki/User:Author">Author &amp; Co.</a>',
                  },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: {
                    value: '//creativecommons.org/licenses/by-sa/4.0/',
                  },
                },
              },
            ],
            ...overrides,
          },
        ],
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('CommonsImageResolver', () => {
  it('should resolve and sanitize Commons image metadata', async () => {
    const fetcher = jest.fn().mockResolvedValue(commonsResponse());
    const resolver = new CommonsImageResolver(fetcher, jest.fn());

    await expect(resolver.resolveAll([seed])).resolves.toEqual([
      expect.objectContaining({
        seed,
        url: 'https://upload.wikimedia.org/example/1600px-image.jpg',
        author: 'Author & Co.',
        licenseName: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        width: 1600,
        height: 900,
      }),
    ]);
    const calls = fetcher.mock.calls as unknown[][];
    const requestUrl = calls[0][0] as URL;
    expect(requestUrl.hostname).toBe('commons.wikimedia.org');
    expect(requestUrl.searchParams.get('titles')).toBe(seed.fileTitle);
    expect(requestUrl.searchParams.get('iiurlwidth')).toBe('1600');
  });

  it('should retry a transient response before succeeding', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(commonsResponse());
    const delay = jest.fn().mockResolvedValue(undefined);
    const resolver = new CommonsImageResolver(fetcher, delay);

    await expect(resolver.resolveAll([seed])).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(500);
  });

  it('should reject a missing Commons file', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(commonsResponse({ missing: true, imageinfo: [] }));
    const resolver = new CommonsImageResolver(fetcher, jest.fn());

    await expect(resolver.resolveAll([seed])).rejects.toThrow(
      `Commons file not found: ${seed.fileTitle}`,
    );
  });

  it('should reject malformed or unlicensed image metadata', async () => {
    const response = commonsResponse({
      imageinfo: [
        {
          thumburl: 'http://untrusted.example/image.jpg',
          thumbwidth: 1600,
          thumbheight: 900,
          mime: 'image/jpeg',
          mediatype: 'BITMAP',
          extmetadata: {},
        },
      ],
    });
    const resolver = new CommonsImageResolver(
      jest.fn().mockResolvedValue(response),
      jest.fn(),
    );

    await expect(resolver.resolveAll([seed])).rejects.toThrow(
      `Commons image metadata invalid: ${seed.fileTitle}`,
    );
  });
});
