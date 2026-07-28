import { Prisma } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { CategoryNotFoundException } from '../../common/exceptions/category-not-found.exception';
import {
  CategoryAlreadyExistsException,
  ReferenceNameRequiredException,
} from '../../common/exceptions/reference-data.exceptions';
import { PrismaService } from '../../database/prisma.service';
import { CategoriesService } from './categories.service';
import { QueryCategoryDto } from './dto/query-category.dto';

const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const category = {
  id: CATEGORY_ID,
  name: 'Biển & đảo',
  slug: 'bien-dao',
};

interface PrismaMock {
  category: {
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

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      category: {
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
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  it('should return searched and paginated categories', async () => {
    prisma.category.findMany.mockResolvedValue([category]);
    prisma.category.count.mockResolvedValue(1);
    const query = Object.assign(new QueryCategoryDto(), {
      page: 1,
      limit: 5,
      search: 'biển',
      sortOrder: SortOrder.ASC,
    });

    await expect(service.findAll(query)).resolves.toEqual({
      items: [category],
      page: 1,
      limit: 5,
      totalItems: 1,
      totalPages: 1,
    });
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { name: { contains: 'biển', mode: 'insensitive' } },
          { slug: { contains: 'biển', mode: 'insensitive' } },
        ],
      },
      skip: 0,
      take: 5,
      orderBy: [{ name: SortOrder.ASC }, { id: SortOrder.ASC }],
    });
  });

  it('should return a category by id', async () => {
    prisma.category.findUnique.mockResolvedValue(category);

    await expect(service.findOneOrFail(CATEGORY_ID)).resolves.toEqual(category);
  });

  it('should throw when a category does not exist', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    await expect(service.findOneOrFail(CATEGORY_ID)).rejects.toBeInstanceOf(
      CategoryNotFoundException,
    );
  });

  it('should create a category with a normalized slug', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue(category);

    await expect(service.create({ name: ' Biển & đảo ' })).resolves.toEqual(
      category,
    );
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { name: 'Biển & đảo', slug: 'bien-dao' },
    });
  });

  it('should reject a known category before create', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: CATEGORY_ID });

    await expect(service.create({ name: 'Biển & đảo' })).rejects.toBeInstanceOf(
      CategoryAlreadyExistsException,
    );
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('should map a concurrent create conflict', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockRejectedValue(prismaError('P2002'));

    await expect(service.create({ name: 'Biển & đảo' })).rejects.toBeInstanceOf(
      CategoryAlreadyExistsException,
    );
  });

  it('should update a category and regenerate its slug', async () => {
    prisma.category.findUnique.mockResolvedValue(category);
    prisma.category.findFirst.mockResolvedValue(null);
    const updated = {
      ...category,
      name: 'Di tích lịch sử',
      slug: 'di-tich-lich-su',
    };
    prisma.category.update.mockResolvedValue(updated);

    await expect(
      service.update(CATEGORY_ID, { name: ' Di tích lịch sử ' }),
    ).resolves.toEqual(updated);
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID },
      data: { name: 'Di tích lịch sử', slug: 'di-tich-lich-su' },
    });
  });

  it('should reject an update without a name', async () => {
    await expect(service.update(CATEGORY_ID, {})).rejects.toBeInstanceOf(
      ReferenceNameRequiredException,
    );
    expect(prisma.category.findUnique).not.toHaveBeenCalled();
  });

  it('should delete a category and rely on the database link cascade', async () => {
    prisma.category.findUnique.mockResolvedValue(category);
    prisma.category.delete.mockResolvedValue(category);

    await expect(service.remove(CATEGORY_ID)).resolves.toEqual(category);
    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID },
    });
  });

  it('should map a concurrent delete race to not found', async () => {
    prisma.category.findUnique.mockResolvedValue(category);
    prisma.category.delete.mockRejectedValue(prismaError('P2025'));

    await expect(service.remove(CATEGORY_ID)).rejects.toBeInstanceOf(
      CategoryNotFoundException,
    );
  });
});
