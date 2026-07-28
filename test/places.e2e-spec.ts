import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ContentStatus } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PlaceNotFoundException } from '../src/common/exceptions/place-not-found.exception';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PlaceResponseDto } from '../src/modules/places/dto/place-response.dto';
import { QueryPlaceDto } from '../src/modules/places/dto/query-place.dto';
import { PlacesService } from '../src/modules/places/places.service';

type SupertestApp = Parameters<typeof request>[0];

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
  meta: {
    requestId: string;
  };
}

interface ListResponseBody {
  success: true;
  data: {
    items: Array<{ id: string; name: string }>;
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

interface DetailResponseBody {
  data: {
    id: string;
  };
}

const PLACE_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_PLACE_ID = '99999999-9999-4999-8999-999999999999';
const PROVINCE_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

const place: PlaceResponseDto = {
  id: PLACE_ID,
  name: 'Ha Long Bay',
  slug: 'ha-long-bay',
  description: 'Limestone islands and emerald water.',
  address: 'Quang Ninh',
  latitude: 20.9101,
  longitude: 107.1839,
  provinceId: PROVINCE_ID,
  avgRating: 4.8,
  reviewCount: 25,
  status: ContentStatus.PUBLISHED,
  createdById: '55555555-5555-4555-8555-555555555555',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  province: {
    id: PROVINCE_ID,
    name: 'Quang Ninh',
    slug: 'quang-ninh',
  },
  categories: [
    {
      id: CATEGORY_ID,
      name: 'Nature',
      slug: 'nature',
    },
  ],
};

describe('Places API (e2e)', () => {
  let app: INestApplication;
  const placesService = {
    findAll: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
      })
      .overrideProvider(PlacesService)
      .useValue(placesService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { enableSwagger: false });
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    placesService.findAll.mockImplementation((query: QueryPlaceDto) => ({
      items: query.search?.toLowerCase().includes('ha') ? [place] : [],
      page: query.page,
      limit: query.limit,
      totalItems: 1,
      totalPages: 1,
    }));
    placesService.findOneOrFail.mockImplementation((id: string) => {
      if (id === PLACE_ID) {
        return place;
      }
      throw new PlaceNotFoundException(id);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should search and paginate published destinations', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(
        `/api/v1/places?search=%20Ha%20&page=1&limit=1&provinceId=${PROVINCE_ID}&categoryId=${CATEGORY_ID}&sortBy=name&sortOrder=asc`,
      )
      .expect(200);
    const body = response.body as unknown as ListResponseBody;

    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      items: [expect.objectContaining({ id: PLACE_ID, name: 'Ha Long Bay' })],
      page: 1,
      limit: 1,
      totalItems: 1,
      totalPages: 1,
    });
    expect(typeof body.meta.timestamp).toBe('string');
    expect(typeof body.meta.requestId).toBe('string');
    expect(placesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'Ha',
        page: 1,
        limit: 1,
        provinceId: PROVINCE_ID,
        categoryId: CATEGORY_ID,
        sortBy: 'name',
        sortOrder: 'asc',
      }),
    );
  });

  it('should reject invalid pagination inputs with the standard error shape', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get('/api/v1/places?page=0&limit=101')
      .expect(400);
    const body = response.body as unknown as ErrorResponseBody;

    expect(body.success).toBe(false);
    expect(body.error.code).toBe('HTTP_400');
    expect(body.error.message).toBe('Request validation failed');
    expect(Array.isArray(body.error.details)).toBe(true);
    expect(typeof body.meta.requestId).toBe('string');
  });

  it('should return destination detail and a domain-specific not-found error', async () => {
    const foundResponse = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(`/api/v1/places/${PLACE_ID}`)
      .expect(200);
    const missingResponse = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(`/api/v1/places/${MISSING_PLACE_ID}`)
      .expect(404);
    const foundBody = foundResponse.body as unknown as DetailResponseBody;
    const missingBody = missingResponse.body as unknown as ErrorResponseBody;

    expect(foundBody.data.id).toBe(PLACE_ID);
    expect(missingBody.error.code).toBe('PLACE_NOT_FOUND');
  });

  it('should require a valid access token for write routes', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/places')
      .send({
        name: 'Ha Long Bay',
        description: 'Description',
        provinceId: PROVINCE_ID,
        categoryIds: [CATEGORY_ID],
      })
      .expect(401);
    const body = response.body as unknown as ErrorResponseBody;

    expect(body.error.code).toBe('INVALID_ACCESS_TOKEN');
    expect(placesService.create).not.toHaveBeenCalled();
  });
});
