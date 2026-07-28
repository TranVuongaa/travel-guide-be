import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { ProvinceNotFoundException } from '../../common/exceptions/province-not-found.exception';
import {
  ProvinceAlreadyExistsException,
  ProvinceInUseException,
  ReferenceNameRequiredException,
} from '../../common/exceptions/reference-data.exceptions';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { toSlug } from '../../common/utils/slug.util';
import { PrismaService } from '../../database/prisma.service';
import { CreateProvinceDto } from './dto/create-province.dto';
import { ProvinceResponseDto } from './dto/province-response.dto';
import { QueryProvinceDto } from './dto/query-province.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';

@Injectable()
export class ProvincesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QueryProvinceDto,
  ): Promise<PaginatedResult<ProvinceResponseDto>> {
    const where: Prisma.ProvinceWhereInput = query.search
      ? {
          OR: [
            {
              name: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
            {
              slug: {
                contains: query.search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};
    const [provinces, totalItems] = await this.prisma.$transaction([
      this.prisma.province.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ name: query.sortOrder }, { id: SortOrder.ASC }],
      }),
      this.prisma.province.count({ where }),
    ]);

    return {
      items: provinces,
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    };
  }

  async findOneOrFail(id: string): Promise<ProvinceResponseDto> {
    const province = await this.prisma.province.findUnique({ where: { id } });

    if (!province) {
      throw new ProvinceNotFoundException(id, HttpStatus.NOT_FOUND);
    }

    return province;
  }

  async create(dto: CreateProvinceDto): Promise<ProvinceResponseDto> {
    const name = dto.name.trim();
    const slug = toSlug(name, 'province');
    await this.ensureUnique(name, slug);

    try {
      return await this.prisma.province.create({
        data: { name, slug },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ProvinceAlreadyExistsException(name);
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateProvinceDto,
  ): Promise<ProvinceResponseDto> {
    if (dto.name === undefined) {
      throw new ReferenceNameRequiredException('province');
    }

    await this.findOneOrFail(id);
    const name = dto.name.trim();
    const slug = toSlug(name, 'province');
    await this.ensureUnique(name, slug, id);

    try {
      return await this.prisma.province.update({
        where: { id },
        data: { name, slug },
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ProvinceAlreadyExistsException(name);
      }
      if (this.isPrismaError(error, 'P2025')) {
        throw new ProvinceNotFoundException(id, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<ProvinceResponseDto> {
    const province = await this.prisma.province.findUnique({
      where: { id },
      include: {
        _count: {
          select: { places: true },
        },
      },
    });

    if (!province) {
      throw new ProvinceNotFoundException(id, HttpStatus.NOT_FOUND);
    }
    if (province._count.places > 0) {
      throw new ProvinceInUseException(id);
    }

    try {
      return await this.prisma.province.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaError(error, 'P2003')) {
        throw new ProvinceInUseException(id);
      }
      if (this.isPrismaError(error, 'P2025')) {
        throw new ProvinceNotFoundException(id, HttpStatus.NOT_FOUND);
      }
      throw error;
    }
  }

  private async ensureUnique(
    name: string,
    slug: string,
    currentId?: string,
  ): Promise<void> {
    const existing = await this.prisma.province.findFirst({
      where: {
        OR: [{ name }, { slug }],
        ...(currentId ? { id: { not: currentId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ProvinceAlreadyExistsException(name);
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
