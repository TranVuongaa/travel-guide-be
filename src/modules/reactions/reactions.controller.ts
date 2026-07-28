import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import {
  ReactionMutationSuccessResponseDto,
  ReactionSuccessResponseDto,
  ReactionSummarySuccessResponseDto,
} from './dto/reaction-response.dto';
import { ReactionTargetDto } from './dto/reaction-target.dto';
import { UpsertReactionDto } from './dto/upsert-reaction.dto';
import { ReactionsService } from './reactions.service';

@ApiTags('reactions')
@Controller({ path: 'reactions', version: '1' })
export class ReactionsController {
  constructor(private readonly reactionsService: ReactionsService) {}

  @Get('summary')
  @Public()
  @ApiOperation({ summary: 'Get reaction counts for a published target' })
  @ApiOkResponse({ type: ReactionSummarySuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Content target not found' })
  summary(@Query() query: ReactionTargetDto) {
    return this.reactionsService.getSummary(query);
  }

  @Post()
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create or change the current user's reaction" })
  @ApiCreatedResponse({ type: ReactionMutationSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Content target not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertReactionDto) {
    return this.reactionsService.upsert(user.id, dto);
  }

  @Delete()
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Remove the current user's reaction" })
  @ApiOkResponse({ type: ReactionSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Target or reaction not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  remove(@CurrentUser() user: AuthUser, @Query() query: ReactionTargetDto) {
    return this.reactionsService.remove(user.id, query);
  }
}
