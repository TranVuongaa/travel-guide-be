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
import { CommentsService } from './comments.service';
import {
  CommentSuccessResponseDto,
  PaginatedCommentsSuccessResponseDto,
} from './dto/comment-response.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { QueryCommentDto } from './dto/query-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('comments')
@Controller({ path: 'comments', version: '1' })
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List root comments or direct replies' })
  @ApiOkResponse({ type: PaginatedCommentsSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Content target not found' })
  findAll(@Query() query: QueryCommentDto) {
    return this.commentsService.findAll(query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a published comment or thread tombstone' })
  @ApiOkResponse({ type: CommentSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Comment not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.commentsService.findOneOrFail(id);
  }

  @Post()
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a comment or reply' })
  @ApiCreatedResponse({ type: CommentSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCommentDto) {
    return this.commentsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the current author's comment" })
  @ApiOkResponse({ type: CommentSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Comment not found' })
  @ApiForbiddenResponse({ description: 'Only the author may edit a comment' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a comment' })
  @ApiOkResponse({ type: CommentSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Comment not found' })
  @ApiForbiddenResponse({
    description: 'Only the author or an administrator may remove a comment',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.commentsService.remove(user, id);
  }
}
