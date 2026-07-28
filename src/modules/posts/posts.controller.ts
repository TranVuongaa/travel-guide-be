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
import { CreatePostDto } from './dto/create-post.dto';
import {
  PaginatedPostsSuccessResponseDto,
  PostSuccessResponseDto,
} from './dto/post-response.dto';
import { QueryMyPostDto, QueryPostDto } from './dto/query-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@Controller({ path: 'posts', version: '1' })
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List published posts' })
  @ApiOkResponse({ type: PaginatedPostsSuccessResponseDto })
  findAll(@Query() query: QueryPostDto) {
    return this.postsService.findAll(query);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the current user's posts" })
  @ApiOkResponse({ type: PaginatedPostsSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  findMine(@CurrentUser() user: AuthUser, @Query() query: QueryMyPostDto) {
    return this.postsService.findMine(user.id, query);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a published post' })
  @ApiOkResponse({ type: PostSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Post not found' })
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.postsService.findOneOrFail(id);
  }

  @Post()
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or submit a post' })
  @ApiCreatedResponse({ type: PostSuccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.postsService.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update the current author's post" })
  @ApiOkResponse({ type: PostSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiForbiddenResponse({ description: 'Only the author may edit a post' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @Throttle({ content: {} })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a post' })
  @ApiOkResponse({ type: PostSuccessResponseDto })
  @ApiNotFoundResponse({ description: 'Post not found' })
  @ApiForbiddenResponse({
    description: 'Only the author or an administrator may remove a post',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.postsService.remove(user, id);
  }
}
