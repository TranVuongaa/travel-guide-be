import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { QueryTravelContentIngestionDto } from './dto/query-travel-content-ingestion.dto';
import {
  PaginatedTravelContentIngestionsSuccessResponseDto,
  TravelContentIngestionAcceptedResponseDto,
  TravelContentIngestionSuccessResponseDto,
} from './dto/travel-content-ingestion-response.dto';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

@ApiTags('admin travel content ingestions')
@ApiBearerAuth()
@Controller({ path: 'admin/travel-content-ingestions', version: '1' })
export class TravelContentIngestionsController {
  constructor(private readonly service: TravelContentIngestionsService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List travel content ingestion run history' })
  @ApiOkResponse({
    type: PaginatedTravelContentIngestionsSuccessResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  findAll(@Query() query: QueryTravelContentIngestionDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Poll one travel content ingestion run' })
  @ApiOkResponse({ type: TravelContentIngestionSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  @ApiNotFoundResponse({ description: 'Ingestion run not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.ADMIN)
  @Throttle({ travelIngestion: {} })
  @ApiOperation({
    summary: 'Start published travel article and destination ingestion',
  })
  @ApiAcceptedResponse({ type: TravelContentIngestionAcceptedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  @ApiConflictResponse({ description: 'An ingestion run is already active' })
  create(@CurrentUser() user: AuthUser) {
    return this.service.createRun(user.id);
  }
}
