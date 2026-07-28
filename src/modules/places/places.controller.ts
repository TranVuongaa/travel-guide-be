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
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CreatePlaceDto } from './dto/create-place.dto';
import {
  PaginatedPlacesSuccessResponseDto,
  PlaceSuccessResponseDto,
} from './dto/place-response.dto';
import { QueryPlaceDto } from './dto/query-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { PlacesService } from './places.service';

@ApiTags('places')
@Controller({ path: 'places', version: '1' })
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'List published destinations with search and pagination',
  })
  @ApiOkResponse({ type: PaginatedPlacesSuccessResponseDto })
  findAll(@Query() query: QueryPlaceDto) {
    return this.placesService.findAll(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a published destination by ID' })
  @ApiOkResponse({ type: PlaceSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Destination not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.placesService.findOneOrFail(id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a destination' })
  @ApiCreatedResponse({ type: PlaceSuccessResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Requires the future Auth module and an editor/admin user',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlaceDto) {
    return this.placesService.create(user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a destination' })
  @ApiOkResponse({ type: PlaceSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Destination not found' })
  @ApiUnauthorizedResponse({
    description: 'Requires the future Auth module and an editor/admin user',
  })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.placesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-remove a destination' })
  @ApiOkResponse({ type: PlaceSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Destination not found' })
  @ApiUnauthorizedResponse({
    description: 'Requires the future Auth module and an admin user',
  })
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.placesService.remove(id);
  }
}
