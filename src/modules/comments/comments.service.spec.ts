import { ConfigService } from '@nestjs/config';
import { CommentTargetType, ContentStatus, Role } from '@prisma/client';

import {
  CommentMaxDepthException,
  CommentParentTargetMismatchException,
} from '../../common/exceptions/content.exceptions';
import { ForbiddenDomainException } from '../../common/exceptions/identity.exceptions';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ContentEngagementService } from '../../common/services/content-engagement.service';
import { ContentTargetsService } from '../../common/services/content-targets.service';
import { PrismaService } from '../../database/prisma.service';
import { CommentsService } from './comments.service';
import { QueryCommentDto } from './dto/query-comment.dto';
import { CommentWithAuthor } from './interfaces/comment-with-author.interface';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const COMMENT_ID = '33333333-3333-4333-8333-333333333333';
const POST_ID = '44444444-4444-4444-8444-444444444444';

const user: AuthUser = {
  id: USER_ID,
  email: 'user@example.com',
  displayName: 'Traveler',
  role: Role.USER,
};

const comment: CommentWithAuthor = {
  id: COMMENT_ID,
  authorId: USER_ID,
  targetType: CommentTargetType.POST,
  targetId: POST_ID,
  parentId: null,
  content: 'Helpful post',
  status: ContentStatus.PUBLISHED,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: { id: USER_ID, displayName: 'Traveler', avatarUrl: null },
};

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: {
    comment: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let targets: { ensurePublishedTarget: jest.Mock };
  let engagement: { getCommentEngagement: jest.Mock };

  beforeEach(() => {
    prisma = {
      comment: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((items: Promise<unknown>[]) => Promise.all(items)),
    };
    targets = { ensurePublishedTarget: jest.fn().mockResolvedValue(undefined) };
    engagement = {
      getCommentEngagement: jest.fn().mockResolvedValue(new Map()),
    };
    service = new CommentsService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      targets as unknown as ContentTargetsService,
      engagement as unknown as ContentEngagementService,
    );
  });

  it('should list root comments for a published target', async () => {
    prisma.comment.findMany.mockResolvedValue([comment]);
    prisma.comment.count.mockResolvedValue(1);
    const query = Object.assign(new QueryCommentDto(), {
      targetType: CommentTargetType.POST,
      targetId: POST_ID,
    });

    const result = await service.findAll(query);

    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: COMMENT_ID, isDeleted: false }),
    );
    expect(targets.ensurePublishedTarget).toHaveBeenCalledWith(
      CommentTargetType.POST,
      POST_ID,
    );
  });

  it('should return a published comment detail', async () => {
    prisma.comment.findFirst.mockResolvedValue(comment);

    await expect(service.findOneOrFail(COMMENT_ID)).resolves.toEqual(
      expect.objectContaining({ id: COMMENT_ID }),
    );
  });

  it('should create a pending root comment for a user', async () => {
    prisma.comment.create.mockResolvedValue({
      ...comment,
      status: ContentStatus.PENDING,
    });

    const result = await service.create(user, {
      targetType: CommentTargetType.POST,
      targetId: POST_ID,
      content: 'Helpful post',
    });

    expect(result.status).toBe(ContentStatus.PENDING);
    const createCalls = prisma.comment.create.mock.calls as unknown as [
      [{ data: { authorId: string; status: ContentStatus } }],
    ];
    const createArgs = createCalls[0][0];
    expect(createArgs.data.authorId).toBe(USER_ID);
    expect(createArgs.data.status).toBe(ContentStatus.PENDING);
  });

  it('should reject an update by another user', async () => {
    prisma.comment.findFirst.mockResolvedValue(comment);

    await expect(
      service.update({ ...user, id: OTHER_ID }, COMMENT_ID, {
        content: 'Changed',
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('should reject a parent belonging to another target', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: COMMENT_ID,
      targetType: CommentTargetType.REVIEW,
      targetId: OTHER_ID,
      parentId: null,
    });

    await expect(
      service.create(user, {
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: COMMENT_ID,
        content: 'Reply',
      }),
    ).rejects.toBeInstanceOf(CommentParentTargetMismatchException);
  });

  it('should reject a sixth comment nesting level', async () => {
    prisma.comment.findFirst.mockResolvedValue({
      id: '50000000-0000-4000-8000-000000000005',
      targetType: CommentTargetType.POST,
      targetId: POST_ID,
      parentId: '40000000-0000-4000-8000-000000000004',
    });
    prisma.comment.findUnique
      .mockResolvedValueOnce({
        id: '40000000-0000-4000-8000-000000000004',
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: '30000000-0000-4000-8000-000000000003',
      })
      .mockResolvedValueOnce({
        id: '30000000-0000-4000-8000-000000000003',
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: '20000000-0000-4000-8000-000000000002',
      })
      .mockResolvedValueOnce({
        id: '20000000-0000-4000-8000-000000000002',
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: '10000000-0000-4000-8000-000000000001',
      });

    await expect(
      service.create(user, {
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: '50000000-0000-4000-8000-000000000005',
        content: 'Too deep',
      }),
    ).rejects.toBeInstanceOf(CommentMaxDepthException);
  });

  it('should update an author comment and reapply moderation', async () => {
    prisma.comment.findFirst.mockResolvedValue(comment);
    prisma.comment.update.mockResolvedValue({
      ...comment,
      content: 'Changed',
      status: ContentStatus.PENDING,
    });

    const result = await service.update(user, COMMENT_ID, {
      content: 'Changed',
    });

    expect(result.content).toBe('Changed');
    expect(result.status).toBe(ContentStatus.PENDING);
  });

  it('should return a redacted tombstone after soft deletion', async () => {
    prisma.comment.findFirst.mockResolvedValue(comment);
    prisma.comment.update.mockResolvedValue({
      ...comment,
      deletedAt: new Date(),
    });

    const result = await service.remove(user, COMMENT_ID);

    expect(result.isDeleted).toBe(true);
    expect(result.content).toBeNull();
    expect(result.authorId).toBeNull();
    expect(result.author).toBeNull();
  });
});
