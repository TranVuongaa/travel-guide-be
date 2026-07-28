import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CategorySuccessResponseDto,
  PaginatedCategoriesSuccessResponseDto,
} from './dto/category-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List categories with search and pagination' })
  @ApiOkResponse({ type: PaginatedCategoriesSuccessResponseDto })
  findAll(@Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a category by ID' })
  @ApiOkResponse({ type: CategorySuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoriesService.findOneOrFail(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CategorySuccessResponseDto })
  @ApiConflictResponse({ description: 'Category name or slug already exists' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a category' })
  @ApiOkResponse({ type: CategorySuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Category name or slug already exists' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a category and its place links' })
  @ApiOkResponse({ type: CategorySuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoriesService.remove(id);
  }
}
