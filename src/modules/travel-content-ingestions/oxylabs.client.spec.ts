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
});
