import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CreateReviewDto } from './dto/create-review.dto';
import { QueryReviewDto } from './dto/query-review.dto';
import {
  PaginatedReviewsSuccessResponseDto,
  ReviewSuccessResponseDto,
} from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller({ path: 'places/:placeId/reviews', version: '1' })
export class PlaceReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List published reviews for a place' })
  @ApiOkResponse({ type: PaginatedReviewsSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Place not found' })
  findAll(
    @Param('placeId', new ParseUUIDPipe({ version: '4' })) placeId: string,
    @Query() query: QueryReviewDto,
  ) {
    return this.reviewsService.findAllForPlace(placeId, query);
  }

  @Post()
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create the current user review for a place' })
  @ApiCreatedResponse({ type: ReviewSuccessResponseDto })
  @ApiConflictResponse({ description: 'A review already exists' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('placeId', new ParseUUIDPipe({ version: '4' })) placeId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user, placeId, dto);
  }
}
