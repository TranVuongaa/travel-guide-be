import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { CategoryNotFoundException } from '../../common/exceptions/category-not-found.exception';
import {
  CategoryAlreadyExistsException,
  ReferenceNameRequiredException,
} from '../../common/exceptions/reference-data.exceptions';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { orderedEntityImages } from '../../common/utils/entity-image-query.util';
import { normalizeSearchText } from '../../common/utils/search-text.util';
import { toSlug } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QueryCategoryDto,
  ): Promise<PaginatedResult<CategoryResponseDto>> {
    const searchText = query.search ? normalizeSearchText(query.search) : '';
    const where: Prisma.CategoryWhereInput = searchText
      ? {
          searchText: {
            contains: searchText,
          },
        }
      : {};
    const [categories, totalItems] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ name: query.sortOrder }, { id: SortOrder.ASC }],
        include: { images: orderedEntityImages },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      items: categories,
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    };
  }

  async findOneOrFail(id: string): Promise<CategoryResponseDto> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { images: orderedEntityImages },
    });

    if (!category) {
      throw new CategoryNotFoundException(id, HttpStatus.NOT_FOUND);
    }

    return category;
  }

  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const name = dto.name.trim();
    const slug = toSlug(name, 'category');
    await this.ensureUnique(name, slug);

    try {
      return await this.prisma.category.create({
        data: { name, slug },
        include: { images: orderedEntityImages },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new CategoryAlreadyExistsException(name);
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    if (dto.name === undefined) {
      throw new ReferenceNameRequiredException('category');
    }

    await this.findOneOrFail(id);
    const name = dto.name.trim();
    const slug = toSlug(name, 'category');
    await this.ensureUnique(name, slug, id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: { name, slug },
        include: { images: orderedEntityImages },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new CategoryAlreadyExistsException(name);
      }
      if (this.isPrismaError(error, 'P2025')) {
        throw new CategoryNotFoundException(id, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<CategoryResponseDto> {
    await this.findOneOrFail(id);

    try {
      return await this.prisma.category.delete({
        where: { id },
        include: { images: orderedEntityImages },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2025')) {
        throw new CategoryNotFoundException(id, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  private async ensureUnique(
    name: string,
    slug: string,
    currentId?: string,
  ): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: {
        OR: [{ name }, { slug }],
        ...(currentId ? { id: { not: currentId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new CategoryAlreadyExistsException(name);
    }
  }

  private isPrismaError(
    error: unknown,
    code: string,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
