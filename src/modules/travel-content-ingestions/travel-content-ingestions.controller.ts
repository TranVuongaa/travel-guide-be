import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { TravelContentIngestionAcceptedResponseDto } from './dto/travel-content-ingestion-response.dto';
import { TravelContentIngestionsService } from './travel-content-ingestions.service';

@ApiTags('admin travel content ingestions')
@ApiBearerAuth()
@Controller({ path: 'admin/travel-content-ingestions', version: '1' })
export class TravelContentIngestionsController {
  constructor(private readonly service: TravelContentIngestionsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(Role.ADMIN)
  @Throttle({ travelIngestion: {} })
  @ApiOperation({ summary: 'Queue a trending travel article ingestion run' })
  @ApiAcceptedResponse({ type: TravelContentIngestionAcceptedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Administrator role is required' })
  @ApiConflictResponse({ description: 'An ingestion run is already active' })
  create(@CurrentUser() user: AuthUser) {
    return this.service.createRun(user.id);
  }
}
