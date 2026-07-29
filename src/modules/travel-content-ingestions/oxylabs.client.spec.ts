import { ConfigService } from '@nestjs/config';

import { OxylabsClient } from './oxylabs.client';

describe('OxylabsClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should construct a localized Google Trends request', async () => {
    let capturedBody: BodyInit | null | undefined;
    const fetchMock = (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedBody = init?.body;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                status_code: 200,
                job_id: 'job-1',
                content: JSON.stringify({ related_queries: [] }),
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    global.fetch = fetchMock;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'travelContentIngestion.oxylabsUsername': 'user',
          'travelContentIngestion.oxylabsPassword': 'password',
          'travelContentIngestion.timeoutMs': 1000,
        };
        return values[key] ?? fallback;
      }),
    };
    const client = new OxylabsClient(config as unknown as ConfigService);

    await client.getTrendKeywords('travel', '2025-01-01', '2026-01-01');

    if (typeof capturedBody !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    const body: unknown = JSON.parse(capturedBody);
    expect(body).toEqual(
      expect.objectContaining({
        source: 'google_trends_explore',
        query: 'travel',
        geo_location: 'VN',
      }),
    );
    expect(body).not.toHaveProperty('parse');
  });

  it('should not retry a non-transient Oxylabs 400 response', async () => {
    let callCount = 0;
    const fetchMock = (): Promise<Response> => {
      callCount += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Bad request' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    global.fetch = fetchMock;
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key.endsWith('oxylabsUsername')) return 'user';
        if (key.endsWith('oxylabsPassword')) return 'password';
        return fallback;
      }),
    };
    const client = new OxylabsClient(config as unknown as ConfigService);

    await expect(client.searchNews('travel')).rejects.toThrow('Bad request');
    expect(callCount).toBe(1);
  });

  it('should combine multi-page Web results with Province provenance', async () => {
    let capturedBody: BodyInit | null | undefined;
    global.fetch = (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedBody = init?.body;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [1, 2].map((page) => ({
              status_code: 200,
              content: {
                results: {
                  organic: [
                    {
                      title: `Destination ${page}`,
                      url: `https://example.com/${page}`,
                    },
                  ],
                },
              },
            })),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key.endsWith('oxylabsUsername')) return 'user';
        if (key.endsWith('oxylabsPassword')) return 'password';
        return fallback;
      }),
    };
    const client = new OxylabsClient(config as unknown as ConfigService);

    const results = await client.searchWeb('Đà Nẵng travel', {
      id: 'province-1',
      name: 'Đà Nẵng',
    });

    expect(results).toHaveLength(2);
    expect(results[0].provinceHint).toEqual({
      id: 'province-1',
      name: 'Đà Nẵng',
    });
    if (typeof capturedBody !== 'string') {
      throw new Error('Expected a JSON request body');
    }
    expect(JSON.parse(capturedBody) as unknown).toEqual(
      expect.objectContaining({ pages: 2, limit: 10, parse: true }),
    );
  });

  it('should retry an insufficient Markdown page with rendering once', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const endpoints: string[] = [];
    global.fetch = (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      endpoints.push(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url,
      );
      if (typeof init?.body === 'string') {
        payloads.push(JSON.parse(init.body) as Record<string, unknown>);
      }
      const content =
        payloads.length === 1
          ? 'short'
          : 'Vietnam travel destination '.repeat(20);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                status_code: 200,
                type: 'markdown',
                url: 'https://example.com/final',
                content,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key.endsWith('oxylabsUsername')) return 'user';
        if (key.endsWith('oxylabsPassword')) return 'password';
        return fallback;
      }),
    };
    const client = new OxylabsClient(config as unknown as ConfigService);

    await expect(
      client.scrapeArticle('https://example.com/article'),
    ).resolves.toMatchObject({
      finalUrl: 'https://example.com/final',
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toMatchObject({ render: 'html', markdown: true });
    expect(endpoints).toEqual([
      expect.stringContaining('?type=raw,markdown'),
      expect.stringContaining('?type=raw,markdown'),
    ]);
  });

  it('should combine raw and Markdown results without relying on order', async () => {
    let callCount = 0;
    global.fetch = (): Promise<Response> => {
      callCount += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [
              {
                status_code: 200,
                type: 'markdown',
                url: 'https://example.com/final',
                content: '# Vietnam travel destination\n\nUseful guide text.',
              },
              {
                status_code: 200,
                type: 'raw',
                url: 'https://example.com/final',
                content: `<article><p>${'Vietnam travel destination guide. '.repeat(
                  40,
                )}</p></article>`,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key.endsWith('oxylabsUsername')) return 'user';
        if (key.endsWith('oxylabsPassword')) return 'password';
        return fallback;
      }),
    };
    const client = new OxylabsClient(config as unknown as ConfigService);

    const scraped = await client.scrapeArticle('https://example.com/article');
    expect(scraped.rawHtml).toContain('<article>');
    expect(scraped.markdown).toContain('# Vietnam');
    expect(scraped.finalUrl).toBe('https://example.com/final');
    expect(callCount).toBe(1);
  });
});
