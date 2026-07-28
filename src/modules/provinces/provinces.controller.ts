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
import { CreateProvinceDto } from './dto/create-province.dto';
import {
  PaginatedProvincesSuccessResponseDto,
  ProvinceSuccessResponseDto,
} from './dto/province-response.dto';
import { QueryProvinceDto } from './dto/query-province.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';
import { ProvincesService } from './provinces.service';

@ApiTags('provinces')
@Controller({ path: 'provinces', version: '1' })
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List provinces with search and pagination' })
  @ApiOkResponse({ type: PaginatedProvincesSuccessResponseDto })
  findAll(@Query() query: QueryProvinceDto) {
    return this.provincesService.findAll(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a province by ID' })
  @ApiOkResponse({ type: ProvinceSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Province not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.provincesService.findOneOrFail(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a province' })
  @ApiCreatedResponse({ type: ProvinceSuccessResponseDto })
  @ApiConflictResponse({ description: 'Province name or slug already exists' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  create(@Body() dto: CreateProvinceDto) {
    return this.provincesService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a province' })
  @ApiOkResponse({ type: ProvinceSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Province not found' })
  @ApiConflictResponse({ description: 'Province name or slug already exists' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProvinceDto,
  ) {
    return this.provincesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an unused province' })
  @ApiOkResponse({ type: ProvinceSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Province not found' })
  @ApiConflictResponse({ description: 'Province is referenced by a place' })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.provincesService.remove(id);
  }
}
