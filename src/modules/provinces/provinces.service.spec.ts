import { Prisma } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { ProvinceNotFoundException } from '../../common/exceptions/province-not-found.exception';
import {
  ProvinceAlreadyExistsException,
  ProvinceInUseException,
  ReferenceNameRequiredException,
} from '../../common/exceptions/reference-data.exceptions';
import { orderedEntityImages } from '../../common/utils/entity-image-query.util';
import { PrismaService } from '../../database/prisma.service';
import { QueryProvinceDto } from './dto/query-province.dto';
import { ProvincesService } from './provinces.service';

const PROVINCE_ID = '11111111-1111-4111-8111-111111111111';
const province = {
  id: PROVINCE_ID,
  name: 'Quảng Ninh',
  slug: 'quang-ninh',
  images: [],
};

interface PrismaMock {
  province: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database error', {
    code,
    clientVersion: '6.19.3',
  });
}

describe('ProvincesService', () => {
  let service: ProvincesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      province: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    service = new ProvincesService(prisma as unknown as PrismaService);
  });

  it('should return searched and paginated provinces', async () => {
    prisma.province.findMany.mockResolvedValue([province]);
    prisma.province.count.mockResolvedValue(1);
    const query = Object.assign(new QueryProvinceDto(), {
      page: 2,
      limit: 10,
      search: 'QUẢNG NINH',
      sortOrder: SortOrder.DESC,
    });

    await expect(service.findAll(query)).resolves.toEqual({
      items: [province],
      page: 2,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    });
    expect(prisma.province.findMany).toHaveBeenCalledWith({
      where: {
        searchText: { contains: 'quang ninh' },
      },
      skip: 10,
      take: 10,
      orderBy: [{ name: SortOrder.DESC }, { id: SortOrder.ASC }],
      include: { images: orderedEntityImages },
    });
  });

  it('should return a province by id', async () => {
    prisma.province.findUnique.mockResolvedValue(province);

    await expect(service.findOneOrFail(PROVINCE_ID)).resolves.toEqual(province);
  });

  it('should ignore a search term that normalizes to an empty string', async () => {
    prisma.province.findMany.mockResolvedValue([]);
    prisma.province.count.mockResolvedValue(0);

    await service.findAll(
      Object.assign(new QueryProvinceDto(), {
        search: '---',
      }),
    );

    expect(prisma.province.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(prisma.province.count).toHaveBeenCalledWith({ where: {} });
  });

  it('should throw when a province does not exist', async () => {
    prisma.province.findUnique.mockResolvedValue(null);

    await expect(service.findOneOrFail(PROVINCE_ID)).rejects.toBeInstanceOf(
      ProvinceNotFoundException,
    );
  });

  it('should create a province with a normalized slug', async () => {
    prisma.province.findFirst.mockResolvedValue(null);
    prisma.province.create.mockResolvedValue(province);

    await expect(service.create({ name: ' Quảng Ninh ' })).resolves.toEqual(
      province,
    );
    expect(prisma.province.create).toHaveBeenCalledWith({
      data: { name: 'Quảng Ninh', slug: 'quang-ninh' },
      include: { images: orderedEntityImages },
    });
  });

  it('should reject a known province before create', async () => {
    prisma.province.findFirst.mockResolvedValue({ id: PROVINCE_ID });

    await expect(service.create({ name: 'Quảng Ninh' })).rejects.toBeInstanceOf(
      ProvinceAlreadyExistsException,
    );
    expect(prisma.province.create).not.toHaveBeenCalled();
  });

  it('should map a concurrent create conflict', async () => {
    prisma.province.findFirst.mockResolvedValue(null);
    prisma.province.create.mockRejectedValue(prismaError('P2002'));

    await expect(service.create({ name: 'Quảng Ninh' })).rejects.toBeInstanceOf(
      ProvinceAlreadyExistsException,
    );
  });

  it('should update a province and regenerate its slug', async () => {
    prisma.province.findUnique.mockResolvedValue(province);
    prisma.province.findFirst.mockResolvedValue(null);
    const updated = {
      ...province,
      name: 'Hồ Chí Minh',
      slug: 'ho-chi-minh',
    };
    prisma.province.update.mockResolvedValue(updated);

    await expect(
      service.update(PROVINCE_ID, { name: ' Hồ Chí Minh ' }),
    ).resolves.toEqual(updated);
    expect(prisma.province.update).toHaveBeenCalledWith({
      where: { id: PROVINCE_ID },
      data: { name: 'Hồ Chí Minh', slug: 'ho-chi-minh' },
      include: { images: orderedEntityImages },
    });
  });

  it('should reject an update without a name', async () => {
    await expect(service.update(PROVINCE_ID, {})).rejects.toBeInstanceOf(
      ReferenceNameRequiredException,
    );
    expect(prisma.province.findUnique).not.toHaveBeenCalled();
  });

  it('should delete an unused province', async () => {
    prisma.province.findUnique.mockResolvedValue({
      ...province,
      _count: { places: 0 },
    });
    prisma.province.delete.mockResolvedValue(province);

    await expect(service.remove(PROVINCE_ID)).resolves.toEqual(province);
  });

  it('should reject deleting a referenced province', async () => {
    prisma.province.findUnique.mockResolvedValue({
      ...province,
      _count: { places: 1 },
    });

    await expect(service.remove(PROVINCE_ID)).rejects.toBeInstanceOf(
      ProvinceInUseException,
    );
    expect(prisma.province.delete).not.toHaveBeenCalled();
  });

  it('should map a concurrent province foreign-key conflict', async () => {
    prisma.province.findUnique.mockResolvedValue({
      ...province,
      _count: { places: 0 },
    });
    prisma.province.delete.mockRejectedValue(prismaError('P2003'));

    await expect(service.remove(PROVINCE_ID)).rejects.toBeInstanceOf(
      ProvinceInUseException,
    );
  });
});
