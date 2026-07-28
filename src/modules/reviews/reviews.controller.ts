import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { QueryMyReviewDto } from './dto/query-review.dto';
import {
  PaginatedReviewsSuccessResponseDto,
  ReviewSuccessResponseDto,
} from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the current user's reviews" })
  @ApiOkResponse({ type: PaginatedReviewsSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  findMine(@CurrentUser() user: AuthUser, @Query() query: QueryMyReviewDto) {
    return this.reviewsService.findMine(user.id, query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a published review' })
  @ApiOkResponse({ type: ReviewSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Review not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.reviewsService.findOneOrFail(id);
  }

  @Patch(':id')
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the current author's review" })
  @ApiOkResponse({ type: ReviewSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Review not found' })
  @ApiForbiddenResponse({ description: 'Only the author may edit a review' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a review' })
  @ApiOkResponse({ type: ReviewSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Review not found' })
  @ApiForbiddenResponse({
    description: 'Only the author or an administrator may remove a review',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reviewsService.remove(user, id);
  }
}
