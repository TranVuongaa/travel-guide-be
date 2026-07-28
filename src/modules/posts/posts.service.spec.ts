import { ConfigService } from '@nestjs/config';
import { ContentStatus, PostSource, Role } from '@prisma/client';

import { SortOrder } from '../../common/dto/pagination.dto';
import { ForbiddenDomainException } from '../../common/exceptions/identity.exceptions';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ContentEngagementService } from '../../common/services/content-engagement.service';
import { PrismaService } from '../../database/prisma.service';
import { PublicationIntent } from './dto/create-post.dto';
import { QueryMyPostDto, QueryPostDto } from './dto/query-post.dto';
import { PostWithRelations } from './interfaces/post-with-relations.interface';
import { PostsService } from './posts.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const PLACE_ID = '44444444-4444-4444-8444-444444444444';

const user: AuthUser = {
  id: USER_ID,
  email: 'user@example.com',
  displayName: 'Traveler',
  role: Role.USER,
};

const post: PostWithRelations = {
  id: POST_ID,
  authorId: USER_ID,
  placeId: PLACE_ID,
  title: 'A trip',
  description: 'A short trip summary.',
  content: '<p>A detailed trip report.</p>',
  source: PostSource.USER,
  status: ContentStatus.PUBLISHED,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  author: {
    id: USER_ID,
    displayName: 'Traveler',
    avatarUrl: null,
  },
  place: {
    id: PLACE_ID,
    name: 'Hue',
    slug: 'hue',
  },
};

describe('PostsService', () => {
  let service: PostsService;
  let prisma: {
    post: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    place: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let engagement: { getTargetEngagement: jest.Mock };

  beforeEach(() => {
    prisma = {
      post: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      place: { findFirst: jest.fn() },
      $transaction: jest.fn((items: Promise<unknown>[]) => Promise.all(items)),
    };
    engagement = {
      getTargetEngagement: jest.fn().mockResolvedValue(new Map()),
    };
    service = new PostsService(
      prisma as unknown as PrismaService,
      { get: jest.fn().mockReturnValue(true) } as unknown as ConfigService,
      engagement as unknown as ContentEngagementService,
    );
  });

  it('should list paginated published posts', async () => {
    prisma.post.findMany.mockResolvedValue([post]);
    prisma.post.count.mockResolvedValue(1);

    const result = await service.findAll(
      Object.assign(new QueryPostDto(), {
        placeId: PLACE_ID,
        search: 'CỐ ĐÔ HUẾ',
        sortOrder: SortOrder.DESC,
      }),
    );

    expect(result.items[0].id).toBe(POST_ID);
    const findCalls = prisma.post.findMany.mock.calls as unknown as [
      [
        {
          where: {
            placeId: string;
            status: ContentStatus;
            deletedAt: null;
          };
        },
      ],
    ];
    const findArgs = findCalls[0][0];
    expect(findArgs.where).toEqual(
      expect.objectContaining({
        placeId: PLACE_ID,
        searchText: { contains: 'co do hue' },
        status: ContentStatus.PUBLISHED,
        deletedAt: null,
      }),
    );
  });

  it('should list only the current user posts', async () => {
    prisma.post.findMany.mockResolvedValue([post]);
    prisma.post.count.mockResolvedValue(1);

    await service.findMine(USER_ID, new QueryMyPostDto());

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId: USER_ID, deletedAt: null },
      }),
    );
  });

  it('should return a published post by id', async () => {
    prisma.post.findFirst.mockResolvedValue(post);

    await expect(service.findOneOrFail(POST_ID)).resolves.toEqual(
      expect.objectContaining({ id: POST_ID }),
    );
  });

  it('should derive user source and pending status on create', async () => {
    prisma.place.findFirst.mockResolvedValue({ id: PLACE_ID });
    prisma.post.create.mockResolvedValue({
      ...post,
      status: ContentStatus.PENDING,
    });

    await service.create(user, {
      title: post.title,
      description: post.description,
      content: post.content,
      placeId: PLACE_ID,
      publicationIntent: PublicationIntent.SUBMIT,
    });

    const createCalls = prisma.post.create.mock.calls as unknown as [
      [
        {
          data: {
            description: string;
            content: string;
            source: PostSource;
            status: ContentStatus;
          };
        },
      ],
    ];
    const createArgs = createCalls[0][0];
    expect(createArgs.data.description).toBe(post.description);
    expect(createArgs.data.content).toBe(post.content);
    expect(createArgs.data.source).toBe(PostSource.USER);
    expect(createArgs.data.status).toBe(ContentStatus.PENDING);
  });

  it('should sanitize HTML content before creating a post', async () => {
    prisma.post.create.mockResolvedValue(post);

    await service.create(user, {
      title: post.title,
      description: post.description,
      content:
        '<p onclick="alert(1)">Safe article</p><script>alert(1)</script>',
      publicationIntent: PublicationIntent.DRAFT,
    });

    const createCalls = prisma.post.create.mock.calls as unknown as [
      [{ data: { content: string } }],
    ];
    expect(createCalls[0][0].data.content).toBe('<p>Safe article</p>');
  });

  it('should reject a post without meaningful visible content', async () => {
    await expect(
      service.create(user, {
        title: post.title,
        description: post.description,
        content:
          '<script>alert(1)</script><img src="https://example.com/a.jpg">',
        publicationIntent: PublicationIntent.DRAFT,
      }),
    ).rejects.toThrow('Post content must contain meaningful visible text');

    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('should reject an update from a non-author', async () => {
    prisma.post.findFirst.mockResolvedValue(post);

    await expect(
      service.update({ ...user, id: ADMIN_ID }, POST_ID, {
        title: 'Changed',
      }),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });

  it('should send an edited published user post back to moderation', async () => {
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue({
      ...post,
      title: 'Changed',
      status: ContentStatus.PENDING,
    });

    const result = await service.update(user, POST_ID, { title: 'Changed' });

    expect(result.status).toBe(ContentStatus.PENDING);
    const updateCalls = prisma.post.update.mock.calls as unknown as [
      [{ data: { status: ContentStatus } }],
    ];
    expect(updateCalls[0][0].data.status).toBe(ContentStatus.PENDING);
  });

  it('should sanitize an updated article without changing omitted fields', async () => {
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue({
      ...post,
      content: '<h2>Changed</h2><p>Safe text</p>',
      status: ContentStatus.PENDING,
    });

    await service.update(user, POST_ID, {
      content:
        '<h2 style="color:red">Changed</h2><p>Safe text</p><iframe src="https://example.com"></iframe>',
    });

    const updateCalls = prisma.post.update.mock.calls as unknown as [
      [
        {
          data: {
            description?: string;
            content: string;
            status: ContentStatus;
          };
        },
      ],
    ];
    expect(updateCalls[0][0].data).toEqual(
      expect.objectContaining({
        description: undefined,
        content: '<h2>Changed</h2><p>Safe text</p>',
        status: ContentStatus.PENDING,
      }),
    );
  });

  it('should allow an administrator to soft-delete another author post', async () => {
    prisma.post.findFirst.mockResolvedValue(post);
    prisma.post.update.mockResolvedValue({
      ...post,
      deletedAt: new Date(),
    });

    const result = await service.remove(
      { ...user, id: ADMIN_ID, role: Role.ADMIN },
      POST_ID,
    );

    expect(result.deletedAt).toBeInstanceOf(Date);
    const updateCalls = prisma.post.update.mock.calls as unknown as [
      [{ where: { id: string }; data: { deletedAt: Date } }],
    ];
    const updateArgs = updateCalls[0][0];
    expect(updateArgs.where).toEqual({ id: POST_ID });
    expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
  });
});
