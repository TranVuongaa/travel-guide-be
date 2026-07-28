import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { ContentStatus, Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PlaceNotFoundException } from '../src/common/exceptions/place-not-found.exception';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PlaceResponseDto } from '../src/modules/places/dto/place-response.dto';
import { QueryPlaceDto } from '../src/modules/places/dto/query-place.dto';
import { PlacesService } from '../src/modules/places/places.service';
import { UsersService } from '../src/modules/users/users.service';

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
    items: Array<{
      id: string;
      name: string;
      images: Array<{ url: string; sortOrder: number }>;
    }>;
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
    images: Array<{ url: string; sourcePageUrl: string; sortOrder: number }>;
  };
}

const PLACE_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_PLACE_ID = '99999999-9999-4999-8999-999999999999';
const PROVINCE_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const EDITOR_ID = '44444444-4444-4444-8444-444444444444';
const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';
const image = {
  id: '77777777-7777-4777-8777-777777777777',
  url: 'https://upload.wikimedia.org/place.jpg',
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Place.jpg',
  altText: 'Place image',
  author: 'Author',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  width: 1600,
  height: 900,
  sortOrder: 0,
};

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
  images: [image],
};

describe('Places API (e2e)', () => {
  let app: INestApplication;
  let editorToken: string;
  let adminToken: string;
  let userToken: string;
  const placesService = {
    findAll: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn().mockResolvedValue(place),
    update: jest.fn().mockResolvedValue(place),
    remove: jest
      .fn()
      .mockResolvedValue({ ...place, status: ContentStatus.HIDDEN }),
  };
  const usersService = {
    findAuthUserById: jest.fn((id: string) => {
      const rolesById: Record<string, Role> = {
        [EDITOR_ID]: Role.EDITOR,
        [ADMIN_ID]: Role.ADMIN,
        [USER_ID]: Role.USER,
      };
      const role = rolesById[id];

      return role
        ? {
            id,
            email: `${role.toLowerCase()}@example.com`,
            displayName: role,
            role,
            isActive: true,
          }
        : null;
    }),
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
      .overrideProvider(UsersService)
      .useValue(usersService)
      .overrideProvider(PlacesService)
      .useValue(placesService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { enableSwagger: false });
    await app.init();

    const jwt = app.get(JwtService);
    const tokenOptions = {
      secret: process.env.JWT_ACCESS_SECRET,
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      expiresIn: 900,
    };
    editorToken = await jwt.signAsync(
      { sub: EDITOR_ID, role: Role.EDITOR, type: 'access' },
      tokenOptions,
    );
    adminToken = await jwt.signAsync(
      { sub: ADMIN_ID, role: Role.ADMIN, type: 'access' },
      tokenOptions,
    );
    userToken = await jwt.signAsync(
      { sub: USER_ID, role: Role.USER, type: 'access' },
      tokenOptions,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    placesService.findAll.mockImplementation((query: QueryPlaceDto) => ({
      items: query.search?.toLowerCase().includes('da') ? [place] : [],
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

  it('should document public reads and protected Place mutations in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').addBearerAuth().build(),
    );
    const collection = document.paths['/api/v1/places'];
    const detail = document.paths['/api/v1/places/{id}'];

    expect(collection?.get?.security).toBeUndefined();
    expect(detail?.get?.security).toBeUndefined();
    expect(collection?.post?.security).toEqual([{ bearer: [] }]);
    expect(collection?.post?.responses['401']).toBeDefined();
    expect(collection?.post?.responses['403']).toBeDefined();
    expect(detail?.patch?.responses['401']).toBeDefined();
    expect(detail?.patch?.responses['403']).toBeDefined();
    expect(detail?.delete?.responses['401']).toBeDefined();
    expect(detail?.delete?.responses['403']).toBeDefined();
  });

  it('should search and paginate published destinations', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(
        `/api/v1/places?search=%20DA%20NANG%20&page=1&limit=1&provinceId=${PROVINCE_ID}&categoryId=${CATEGORY_ID}&sortBy=name&sortOrder=asc`,
      )
      .expect(200);
    const body = response.body as unknown as ListResponseBody;

    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      items: [
        expect.objectContaining({
          id: PLACE_ID,
          name: 'Ha Long Bay',
          images: [expect.objectContaining({ url: image.url, sortOrder: 0 })],
        }),
      ],
      page: 1,
      limit: 1,
      totalItems: 1,
      totalPages: 1,
    });
    expect(typeof body.meta.timestamp).toBe('string');
    expect(typeof body.meta.requestId).toBe('string');
    expect(placesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'DA NANG',
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
    expect(foundBody.data.images[0]).toEqual(
      expect.objectContaining({
        url: image.url,
        sourcePageUrl: image.sourcePageUrl,
        sortOrder: 0,
      }),
    );
    expect(missingBody.error.code).toBe('PLACE_NOT_FOUND');
  });

  it('should require a valid access token for every Place mutation', async () => {
    const server = app.getHttpServer() as unknown as SupertestApp;
    const requests = [
      () => request(server).post('/api/v1/places'),
      () => request(server).patch(`/api/v1/places/${PLACE_ID}`),
      () => request(server).delete(`/api/v1/places/${PLACE_ID}`),
    ];

    for (const makeRequest of requests) {
      const response = await makeRequest().expect(401);
      expect((response.body as ErrorResponseBody).error.code).toBe(
        'INVALID_ACCESS_TOKEN',
      );
    }

    expect(placesService.create).not.toHaveBeenCalled();
    expect(placesService.update).not.toHaveBeenCalled();
    expect(placesService.remove).not.toHaveBeenCalled();
  });

  it('should reject a USER role from every Place mutation', async () => {
    const server = app.getHttpServer() as unknown as SupertestApp;
    const requests = [
      () =>
        request(server)
          .post('/api/v1/places')
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .patch(`/api/v1/places/${PLACE_ID}`)
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .delete(`/api/v1/places/${PLACE_ID}`)
          .set('authorization', `Bearer ${userToken}`),
    ];

    for (const makeRequest of requests) {
      const response = await makeRequest().expect(403);
      expect((response.body as ErrorResponseBody).error.code).toBe('FORBIDDEN');
    }

    expect(placesService.create).not.toHaveBeenCalled();
    expect(placesService.update).not.toHaveBeenCalled();
    expect(placesService.remove).not.toHaveBeenCalled();
  });

  it('should allow EDITOR create/update and reserve Place deletion for ADMIN', async () => {
    const server = app.getHttpServer() as unknown as SupertestApp;
    const createDto = {
      name: 'Ha Long Bay',
      description: 'Description',
      provinceId: PROVINCE_ID,
      categoryIds: [CATEGORY_ID],
    };

    await request(server)
      .post('/api/v1/places')
      .set('authorization', `Bearer ${editorToken}`)
      .send(createDto)
      .expect(201);
    await request(server)
      .patch(`/api/v1/places/${PLACE_ID}`)
      .set('authorization', `Bearer ${editorToken}`)
      .send({ description: 'Editor update' })
      .expect(200);
    await request(server)
      .delete(`/api/v1/places/${PLACE_ID}`)
      .set('authorization', `Bearer ${editorToken}`)
      .expect(403);

    await request(server)
      .post('/api/v1/places')
      .set('authorization', `Bearer ${adminToken}`)
      .send(createDto)
      .expect(201);
    await request(server)
      .patch(`/api/v1/places/${PLACE_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ description: 'Administrator update' })
      .expect(200);
    await request(server)
      .delete(`/api/v1/places/${PLACE_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(placesService.create).toHaveBeenNthCalledWith(
      1,
      EDITOR_ID,
      createDto,
    );
    expect(placesService.create).toHaveBeenNthCalledWith(
      2,
      ADMIN_ID,
      createDto,
    );
    expect(placesService.update).toHaveBeenCalledTimes(2);
    expect(placesService.remove).toHaveBeenCalledWith(PLACE_ID);
  });
});
