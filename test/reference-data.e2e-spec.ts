import { HttpStatus, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CategoryNotFoundException } from '../src/common/exceptions/category-not-found.exception';
import { ProvinceNotFoundException } from '../src/common/exceptions/province-not-found.exception';
import {
  CategoryAlreadyExistsException,
  ProvinceInUseException,
} from '../src/common/exceptions/reference-data.exceptions';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { CategoriesService } from '../src/modules/categories/categories.service';
import { QueryCategoryDto } from '../src/modules/categories/dto/query-category.dto';
import { QueryProvinceDto } from '../src/modules/provinces/dto/query-province.dto';
import { ProvincesService } from '../src/modules/provinces/provinces.service';
import { UsersService } from '../src/modules/users/users.service';

type SupertestApp = Parameters<typeof request>[0];

interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
  };
}

interface ListResponseBody {
  success: true;
  data: {
    items: Array<{
      id: string;
      name: string;
      slug: string;
      images: Array<{ url: string; sortOrder: number }>;
    }>;
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROVINCE_ID = '33333333-3333-4333-8333-333333333333';
const IN_USE_PROVINCE_ID = '44444444-4444-4444-8444-444444444444';
const MISSING_PROVINCE_ID = '55555555-5555-4555-8555-555555555555';
const CATEGORY_ID = '66666666-6666-4666-8666-666666666666';
const image = {
  id: '77777777-7777-4777-8777-777777777777',
  url: 'https://upload.wikimedia.org/reference.jpg',
  sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Reference.jpg',
  altText: 'Reference image',
  author: 'Author',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  width: 1600,
  height: 900,
  sortOrder: 0,
};

const province = {
  id: PROVINCE_ID,
  name: 'Quảng Ninh',
  slug: 'quang-ninh',
  images: [image],
};
const category = {
  id: CATEGORY_ID,
  name: 'Biển & đảo',
  slug: 'bien-dao',
  images: [image],
};

describe('Province and Category API (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  const provincesService = {
    findAll: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const categoriesService = {
    findAll: jest.fn(),
    findOneOrFail: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const usersService = {
    findAuthUserById: jest.fn((id: string) => {
      if (id === ADMIN_ID) {
        return {
          id,
          email: 'admin@example.com',
          displayName: 'Admin',
          role: Role.ADMIN,
          isActive: true,
        };
      }
      if (id === USER_ID) {
        return {
          id,
          email: 'user@example.com',
          displayName: 'User',
          role: Role.USER,
          isActive: true,
        };
      }
      return null;
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
      .overrideProvider(ProvincesService)
      .useValue(provincesService)
      .overrideProvider(CategoriesService)
      .useValue(categoriesService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { enableSwagger: false });
    await app.init();

    const jwt = new JwtService();
    const signOptions = {
      secret: process.env.JWT_ACCESS_SECRET,
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      expiresIn: 900,
    };
    adminToken = jwt.sign(
      { sub: ADMIN_ID, role: Role.ADMIN, type: 'access' },
      signOptions,
    );
    userToken = jwt.sign(
      { sub: USER_ID, role: Role.USER, type: 'access' },
      signOptions,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    provincesService.findAll.mockImplementation((query: QueryProvinceDto) => ({
      items: query.search ? [province] : [],
      page: query.page,
      limit: query.limit,
      totalItems: query.search ? 1 : 0,
      totalPages: query.search ? 1 : 0,
    }));
    provincesService.findOneOrFail.mockImplementation((id: string) => {
      if (id === PROVINCE_ID) return province;
      throw new ProvinceNotFoundException(id, HttpStatus.NOT_FOUND);
    });
    provincesService.create.mockImplementation((dto: { name: string }) => ({
      ...province,
      name: dto.name,
    }));
    provincesService.update.mockReturnValue({
      ...province,
      name: 'Hạ Long',
      slug: 'ha-long',
    });
    provincesService.remove.mockImplementation((id: string) => {
      if (id === IN_USE_PROVINCE_ID) {
        throw new ProvinceInUseException(id);
      }
      return province;
    });

    categoriesService.findAll.mockImplementation((query: QueryCategoryDto) => ({
      items: query.search ? [category] : [],
      page: query.page,
      limit: query.limit,
      totalItems: query.search ? 1 : 0,
      totalPages: query.search ? 1 : 0,
    }));
    categoriesService.findOneOrFail.mockImplementation((id: string) => {
      if (id === CATEGORY_ID) return category;
      throw new CategoryNotFoundException(id, HttpStatus.NOT_FOUND);
    });
    categoriesService.create.mockImplementation((dto: { name: string }) => {
      if (dto.name === category.name) {
        throw new CategoryAlreadyExistsException(dto.name);
      }
      return { ...category, name: dto.name };
    });
    categoriesService.update.mockReturnValue({
      ...category,
      name: 'Thiên nhiên',
      slug: 'thien-nhien',
    });
    categoriesService.remove.mockReturnValue(category);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should publish all approved reference-data routes in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').addBearerAuth().build(),
    );

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/provinces',
        '/api/v1/provinces/{id}',
        '/api/v1/categories',
        '/api/v1/categories/{id}',
      ]),
    );
    expect(document.paths['/api/v1/provinces']?.post).toBeDefined();
    expect(document.paths['/api/v1/categories/{id}']?.delete).toBeDefined();
  });

  it('should publicly search and paginate provinces and categories', async () => {
    const provinces = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get('/api/v1/provinces?search=%20QUANG%20NINH%20&page=1&limit=10')
      .expect(200);
    const categories = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get('/api/v1/categories?search=%20BIỂN%20ĐẢO%20&page=1&limit=5')
      .expect(200);

    expect((provinces.body as ListResponseBody).data.items).toEqual([province]);
    expect((categories.body as ListResponseBody).data.items).toEqual([
      category,
    ]);
    expect(
      (provinces.body as ListResponseBody).data.items[0].images[0],
    ).toEqual(expect.objectContaining({ url: image.url, sortOrder: 0 }));
    expect(
      (categories.body as ListResponseBody).data.items[0].images[0],
    ).toEqual(expect.objectContaining({ url: image.url, sortOrder: 0 }));
    expect(provincesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'QUANG NINH',
        page: 1,
        limit: 10,
        sortOrder: 'asc',
      }),
    );
    expect(categoriesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'BIỂN ĐẢO',
        page: 1,
        limit: 5,
        sortOrder: 'asc',
      }),
    );
  });

  it('should validate list input and return domain not-found errors', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get('/api/v1/categories?page=0&limit=101')
      .expect(400);
    const missing = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(`/api/v1/provinces/${MISSING_PROVINCE_ID}`)
      .expect(404);

    expect((missing.body as ErrorResponseBody).error.code).toBe(
      'PROVINCE_NOT_FOUND',
    );
  });

  it('should reject every unauthenticated and non-admin reference-data mutation', async () => {
    const server = app.getHttpServer() as unknown as SupertestApp;
    const unauthenticatedRequests = [
      () => request(server).post('/api/v1/provinces'),
      () => request(server).patch(`/api/v1/provinces/${PROVINCE_ID}`),
      () => request(server).delete(`/api/v1/provinces/${PROVINCE_ID}`),
      () => request(server).post('/api/v1/categories'),
      () => request(server).patch(`/api/v1/categories/${CATEGORY_ID}`),
      () => request(server).delete(`/api/v1/categories/${CATEGORY_ID}`),
    ];

    for (const makeRequest of unauthenticatedRequests) {
      await makeRequest().expect(401);
    }

    const nonAdminRequests = [
      () =>
        request(server)
          .post('/api/v1/provinces')
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .patch(`/api/v1/provinces/${PROVINCE_ID}`)
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .delete(`/api/v1/provinces/${PROVINCE_ID}`)
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .post('/api/v1/categories')
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .patch(`/api/v1/categories/${CATEGORY_ID}`)
          .set('authorization', `Bearer ${userToken}`),
      () =>
        request(server)
          .delete(`/api/v1/categories/${CATEGORY_ID}`)
          .set('authorization', `Bearer ${userToken}`),
    ];

    for (const makeRequest of nonAdminRequests) {
      const forbidden = await makeRequest().expect(403);
      expect((forbidden.body as ErrorResponseBody).error.code).toBe(
        'FORBIDDEN',
      );
    }

    expect(provincesService.create).not.toHaveBeenCalled();
    expect(provincesService.update).not.toHaveBeenCalled();
    expect(provincesService.remove).not.toHaveBeenCalled();
    expect(categoriesService.create).not.toHaveBeenCalled();
    expect(categoriesService.update).not.toHaveBeenCalled();
    expect(categoriesService.remove).not.toHaveBeenCalled();
  });

  it('should let an admin perform every reference-data mutation', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/provinces')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ name: '  Lào Cai  ' })
      .expect(201);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .patch(`/api/v1/provinces/${PROVINCE_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ name: 'Hạ Long' })
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .delete(`/api/v1/provinces/${PROVINCE_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/categories')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sinh thái' })
      .expect(201);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .patch(`/api/v1/categories/${CATEGORY_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ name: 'Thiên nhiên' })
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .delete(`/api/v1/categories/${CATEGORY_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(provincesService.create).toHaveBeenCalledWith({ name: 'Lào Cai' });
    expect(provincesService.update).toHaveBeenCalledWith(PROVINCE_ID, {
      name: 'Hạ Long',
    });
    expect(provincesService.remove).toHaveBeenCalledWith(PROVINCE_ID);
    expect(categoriesService.create).toHaveBeenCalledWith({
      name: 'Sinh thái',
    });
    expect(categoriesService.update).toHaveBeenCalledWith(CATEGORY_ID, {
      name: 'Thiên nhiên',
    });
    expect(categoriesService.remove).toHaveBeenCalledWith(CATEGORY_ID);
  });

  it('should expose duplicate and province-in-use domain conflicts', async () => {
    const duplicate = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .post('/api/v1/categories')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ name: 'Biển & đảo' })
      .expect(409);
    const inUse = await request(app.getHttpServer() as unknown as SupertestApp)
      .delete(`/api/v1/provinces/${IN_USE_PROVINCE_ID}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect((duplicate.body as ErrorResponseBody).error.code).toBe(
      'CATEGORY_ALREADY_EXISTS',
    );
    expect((inUse.body as ErrorResponseBody).error.code).toBe(
      'PROVINCE_IN_USE',
    );
  });
});
