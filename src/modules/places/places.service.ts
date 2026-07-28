import { Injectable } from '@nestjs/common';
import { ContentStatus, Prisma } from '@prisma/client';

import { CategoryNotFoundException } from '../../common/exceptions/category-not-found.exception';
import { PlaceCategoryDuplicateException } from '../../common/exceptions/place-category-duplicate.exception';
import { PlaceNotFoundException } from '../../common/exceptions/place-not-found.exception';
import { PlaceSlugConflictException } from '../../common/exceptions/place-slug-conflict.exception';
import { ProvinceNotFoundException } from '../../common/exceptions/province-not-found.exception';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { normalizeSearchText } from '../../common/utils/search-text.util';
import { toSlug } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { PlaceResponseDto } from './dto/place-response.dto';
import { QueryPlaceDto } from './dto/query-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import {
  placeWithRelationsInclude,
  PlaceWithRelations,
} from './interfaces/place-with-relations.interface';

const MAX_SLUG_ATTEMPTS = 100;

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QueryPlaceDto,
  ): Promise<PaginatedResult<PlaceResponseDto>> {
    const where = this.buildPublicWhere(query);
    const orderBy: Prisma.PlaceOrderByWithRelationInput[] = [
      {
        [query.sortBy]: query.sortOrder,
      },
      { id: Prisma.SortOrder.asc },
    ];
    const [places, totalItems] = await this.prisma.$transaction([
      this.prisma.place.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        include: placeWithRelationsInclude,
      }),
      this.prisma.place.count({ where }),
    ]);

    return {
      items: places.map((place) => this.toResponse(place)),
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    };
  }

  async findOneOrFail(id: string): Promise<PlaceResponseDto> {
    const place = await this.prisma.place.findFirst({
      where: {
        id,
        status: ContentStatus.PUBLISHED,
      },
      include: placeWithRelationsInclude,
    });

    if (!place) {
      throw new PlaceNotFoundException(id);
    }

    return this.toResponse(place);
  }

  async create(userId: string, dto: CreatePlaceDto): Promise<PlaceResponseDto> {
    this.assertUniqueCategoryIds(dto.categoryIds);

    const place = await this.prisma.$transaction(async (transaction) => {
      await this.ensureProvinceExists(transaction, dto.provinceId);
      await this.ensureCategoriesExist(transaction, dto.categoryIds);
      const slug = await this.createUniqueSlug(transaction, dto.name);

      return transaction.place.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          createdBy: {
            connect: { id: userId },
          },
          province: {
            connect: { id: dto.provinceId },
          },
          categories: {
            create: dto.categoryIds.map((categoryId) => ({ categoryId })),
          },
        },
        include: placeWithRelationsInclude,
      });
    });

    return this.toResponse(place);
  }

  async update(id: string, dto: UpdatePlaceDto): Promise<PlaceResponseDto> {
    if (dto.categoryIds) {
      this.assertUniqueCategoryIds(dto.categoryIds);
    }

    const place = await this.prisma.$transaction(async (transaction) => {
      const currentPlace = await this.findEditableOrFail(transaction, id);

      if (dto.provinceId) {
        await this.ensureProvinceExists(transaction, dto.provinceId);
      }
      if (dto.categoryIds) {
        await this.ensureCategoriesExist(transaction, dto.categoryIds);
      }

      const data: Prisma.PlaceUpdateInput = {};
      if (dto.name !== undefined) {
        data.name = dto.name;
        if (dto.name !== currentPlace.name) {
          data.slug = await this.createUniqueSlug(
            transaction,
            dto.name,
            currentPlace.id,
          );
        }
      }
      if (dto.description !== undefined) {
        data.description = dto.description;
      }
      if (dto.address !== undefined) {
        data.address = dto.address;
      }
      if (dto.latitude !== undefined) {
        data.latitude = dto.latitude;
      }
      if (dto.longitude !== undefined) {
        data.longitude = dto.longitude;
      }
      if (dto.provinceId !== undefined) {
        data.province = { connect: { id: dto.provinceId } };
      }
      if (dto.categoryIds !== undefined) {
        data.categories = {
          deleteMany: {},
          create: dto.categoryIds.map((categoryId) => ({ categoryId })),
        };
      }

      return transaction.place.update({
        where: { id },
        data,
        include: placeWithRelationsInclude,
      });
    });

    return this.toResponse(place);
  }

  async remove(id: string): Promise<PlaceResponseDto> {
    const place = await this.prisma.$transaction(async (transaction) => {
      await this.findEditableOrFail(transaction, id);

      return transaction.place.update({
        where: { id },
        data: { status: ContentStatus.HIDDEN },
        include: placeWithRelationsInclude,
      });
    });

    return this.toResponse(place);
  }

  private buildPublicWhere(query: QueryPlaceDto): Prisma.PlaceWhereInput {
    const searchText = query.search ? normalizeSearchText(query.search) : '';

    return {
      status: ContentStatus.PUBLISHED,
      ...(query.provinceId ? { provinceId: query.provinceId } : {}),
      ...(query.categoryId
        ? {
            categories: {
              some: { categoryId: query.categoryId },
            },
          }
        : {}),
      ...(searchText
        ? {
            searchText: {
              contains: searchText,
            },
          }
        : {}),
    };
  }

  private async findEditableOrFail(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<PlaceWithRelations> {
    const place = await transaction.place.findFirst({
      where: {
        id,
        status: { not: ContentStatus.HIDDEN },
      },
      include: placeWithRelationsInclude,
    });

    if (!place) {
      throw new PlaceNotFoundException(id);
    }

    return place;
  }

  private async ensureProvinceExists(
    transaction: Prisma.TransactionClient,
    provinceId: string,
  ): Promise<void> {
    const province = await transaction.province.findUnique({
      where: { id: provinceId },
      select: { id: true },
    });

    if (!province) {
      throw new ProvinceNotFoundException(provinceId);
    }
  }

  private async ensureCategoriesExist(
    transaction: Prisma.TransactionClient,
    categoryIds: string[],
  ): Promise<void> {
    const categories = await transaction.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });
    const existingIds = new Set(categories.map((category) => category.id));
    const missingId = categoryIds.find(
      (categoryId) => !existingIds.has(categoryId),
    );

    if (missingId) {
      throw new CategoryNotFoundException(missingId);
    }
  }

  private assertUniqueCategoryIds(categoryIds: string[]): void {
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new PlaceCategoryDuplicateException();
    }
  }

  private async createUniqueSlug(
    transaction: Prisma.TransactionClient,
    name: string,
    currentPlaceId?: string,
  ): Promise<string> {
    const baseSlug = toSlug(name, 'destination');

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
      const existing = await transaction.place.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === currentPlaceId) {
        return candidate;
      }
    }

    throw new PlaceSlugConflictException(name);
  }

  private toResponse(place: PlaceWithRelations): PlaceResponseDto {
    return {
      id: place.id,
      name: place.name,
      slug: place.slug,
      description: place.description,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      provinceId: place.provinceId,
      avgRating: place.avgRating,
      reviewCount: place.reviewCount,
      status: place.status,
      createdById: place.createdById,
      createdAt: place.createdAt,
      updatedAt: place.updatedAt,
      province: place.province,
      categories: place.categories.map(({ category }) => category),
      images: place.images,
    };
  }
}
