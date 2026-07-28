import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import {
  CommentTargetType,
  ContentStatus,
  PostSource,
  ReactionTargetType,
  ReactionType,
  Role,
} from '@prisma/client';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ForbiddenDomainException } from '../src/common/exceptions/identity.exceptions';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { CommentsService } from '../src/modules/comments/comments.service';
import { PostsService } from '../src/modules/posts/posts.service';
import { ReactionMutationOutcome } from '../src/modules/reactions/dto/reaction-response.dto';
import { ReactionsService } from '../src/modules/reactions/reactions.service';
import { ReviewsService } from '../src/modules/reviews/reviews.service';
import { PLACE_RATING_QUEUE } from '../src/modules/reviews/reviews.constants';

type SupertestApp = Parameters<typeof request>[0];

interface ListBody {
  success: true;
  data: { items: Array<{ id: string }> };
  meta: { requestId: string };
}

interface ErrorBody {
  error: { code: string };
}

interface ReactionSummaryBody {
  data: { counts: { LIKE: number } };
}

interface DeletedCommentBody {
  data: {
    content: null;
    author: null;
    isDeleted: boolean;
  };
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const PLACE_ID = '44444444-4444-4444-8444-444444444444';
const REVIEW_ID = '55555555-5555-4555-8555-555555555555';
const COMMENT_ID = '66666666-6666-4666-8666-666666666666';
const REACTION_ID = '77777777-7777-4777-8777-777777777777';
const now = new Date('2026-01-01T00:00:00.000Z');

const reactionCounts = {
  LIKE: 0,
  LOVE: 0,
  WOW: 0,
  SAD: 0,
  ANGRY: 0,
};

const author = {
  id: USER_ID,
  displayName: 'Traveler',
  avatarUrl: null,
};

const post = {
  id: POST_ID,
  authorId: USER_ID,
  placeId: PLACE_ID,
  title: 'Hue guide',
  content: 'A guide to Hue.',
  source: PostSource.USER,
  status: ContentStatus.PUBLISHED,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  author,
  place: { id: PLACE_ID, name: 'Hue', slug: 'hue' },
  commentCount: 0,
  reactionCounts,
};

const review = {
  id: REVIEW_ID,
  placeId: PLACE_ID,
  authorId: USER_ID,
  rating: 5,
  content: 'Excellent',
  status: ContentStatus.PUBLISHED,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  author,
  place: { id: PLACE_ID, name: 'Hue', slug: 'hue' },
  commentCount: 0,
  reactionCounts,
};

const comment = {
  id: COMMENT_ID,
  authorId: USER_ID,
  targetType: CommentTargetType.POST,
  targetId: POST_ID,
  parentId: null,
  content: 'Helpful',
  status: ContentStatus.PUBLISHED,
  isDeleted: false,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  author,
  replyCount: 0,
  reactionCounts,
};

describe('Content and engagement API (e2e)', () => {
  let app: INestApplication;
  let userToken: string;
  let otherToken: string;

  const postsService = {
    findAll: jest.fn().mockResolvedValue({
      items: [post],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    }),
    findMine: jest.fn().mockResolvedValue({
      items: [post],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    }),
    findOneOrFail: jest.fn().mockResolvedValue(post),
    create: jest.fn().mockResolvedValue(post),
    update: jest.fn((user: { id: string }) => {
      if (user.id !== USER_ID) {
        throw new ForbiddenDomainException();
      }
      return post;
    }),
    remove: jest.fn().mockResolvedValue({ ...post, deletedAt: now }),
  };
  const reviewsService = {
    findAllForPlace: jest.fn().mockResolvedValue({
      items: [review],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    }),
    findMine: jest.fn().mockResolvedValue({
      items: [review],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    }),
    findOneOrFail: jest.fn().mockResolvedValue(review),
    create: jest.fn().mockResolvedValue(review),
    update: jest.fn().mockResolvedValue(review),
    remove: jest.fn().mockResolvedValue({ ...review, deletedAt: now }),
  };
  const commentsService = {
    findAll: jest.fn().mockResolvedValue({
      items: [comment],
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    }),
    findOneOrFail: jest.fn().mockResolvedValue(comment),
    create: jest.fn().mockResolvedValue(comment),
    update: jest.fn().mockResolvedValue(comment),
    remove: jest.fn().mockResolvedValue({
      ...comment,
      content: null,
      author: null,
      isDeleted: true,
      deletedAt: now,
    }),
  };
  const reactionsService = {
    getSummary: jest.fn().mockResolvedValue({
      targetType: ReactionTargetType.POST,
      targetId: POST_ID,
      total: 1,
      counts: { ...reactionCounts, LIKE: 1 },
    }),
    upsert: jest.fn().mockResolvedValue({
      outcome: ReactionMutationOutcome.CREATED,
      reaction: {
        id: REACTION_ID,
        userId: USER_ID,
        targetType: ReactionTargetType.POST,
        targetId: POST_ID,
        type: ReactionType.LIKE,
        createdAt: now,
        updatedAt: now,
      },
    }),
    remove: jest.fn().mockResolvedValue({
      id: REACTION_ID,
      userId: USER_ID,
      targetType: ReactionTargetType.POST,
      targetId: POST_ID,
      type: ReactionType.LIKE,
      createdAt: now,
      updatedAt: now,
    }),
  };
  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findUnique: jest.fn((args: { where: { id?: string } }) => {
        const id = args.where.id;
        if (id !== USER_ID && id !== OTHER_ID) {
          return null;
        }
        return {
          id,
          email: `${id}@example.com`,
          displayName: id === USER_ID ? 'Traveler' : 'Other',
          role: Role.USER,
          isActive: true,
        };
      }),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(PostsService)
      .useValue(postsService)
      .overrideProvider(ReviewsService)
      .useValue(reviewsService)
      .overrideProvider(CommentsService)
      .useValue(commentsService)
      .overrideProvider(ReactionsService)
      .useValue(reactionsService)
      .overrideProvider(getQueueToken(PLACE_RATING_QUEUE))
      .useValue({ add: jest.fn(), close: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app, { enableSwagger: false });
    await app.init();

    const jwt = app.get(JwtService);
    const tokenOptions = {
      secret: process.env.JWT_ACCESS_SECRET,
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      expiresIn: 900,
    };
    userToken = await jwt.signAsync(
      { sub: USER_ID, role: Role.USER, type: 'access' },
      tokenOptions,
    );
    otherToken = await jwt.signAsync(
      { sub: OTHER_ID, role: Role.USER, type: 'access' },
      tokenOptions,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should publish every approved content route in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').addBearerAuth().build(),
    );

    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/posts',
        '/api/v1/posts/mine',
        '/api/v1/posts/{id}',
        '/api/v1/places/{placeId}/reviews',
        '/api/v1/reviews/mine',
        '/api/v1/reviews/{id}',
        '/api/v1/comments',
        '/api/v1/comments/{id}',
        '/api/v1/reactions',
        '/api/v1/reactions/summary',
      ]),
    );
  });

  it('should expose paginated public posts with the standard envelope', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(`/api/v1/posts?placeId=${PLACE_ID}&search=%20CO%20DO%20HUE%20`)
      .expect(200);

    const body = response.body as unknown as ListBody;
    expect(body.success).toBe(true);
    expect(body.data.items[0].id).toBe(POST_ID);
    expect(typeof body.meta.requestId).toBe('string');
    expect(postsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: PLACE_ID, search: 'CO DO HUE' }),
    );
  });

  it('should keep account-specific content reads protected', async () => {
    const server = app.getHttpServer() as unknown as SupertestApp;

    await request(server).get('/api/v1/posts/mine').expect(401);
    await request(server).get('/api/v1/reviews/mine').expect(401);

    expect(postsService.findMine).not.toHaveBeenCalled();
    expect(reviewsService.findMine).not.toHaveBeenCalled();
  });

  it('should require authentication for every content mutation', async () => {
    const server = app.getHttpServer() as unknown as SupertestApp;
    const requests = [
      () => request(server).post('/api/v1/posts'),
      () => request(server).patch(`/api/v1/posts/${POST_ID}`),
      () => request(server).delete(`/api/v1/posts/${POST_ID}`),
      () => request(server).post(`/api/v1/places/${PLACE_ID}/reviews`),
      () => request(server).patch(`/api/v1/reviews/${REVIEW_ID}`),
      () => request(server).delete(`/api/v1/reviews/${REVIEW_ID}`),
      () => request(server).post('/api/v1/comments'),
      () => request(server).patch(`/api/v1/comments/${COMMENT_ID}`),
      () => request(server).delete(`/api/v1/comments/${COMMENT_ID}`),
      () => request(server).post('/api/v1/reactions'),
      () => request(server).delete('/api/v1/reactions'),
    ];

    for (const makeRequest of requests) {
      await makeRequest().expect(401);
    }

    expect(postsService.create).not.toHaveBeenCalled();
    expect(postsService.update).not.toHaveBeenCalled();
    expect(postsService.remove).not.toHaveBeenCalled();
    expect(reviewsService.create).not.toHaveBeenCalled();
    expect(reviewsService.update).not.toHaveBeenCalled();
    expect(reviewsService.remove).not.toHaveBeenCalled();
    expect(commentsService.create).not.toHaveBeenCalled();
    expect(commentsService.update).not.toHaveBeenCalled();
    expect(commentsService.remove).not.toHaveBeenCalled();
    expect(reactionsService.upsert).not.toHaveBeenCalled();
    expect(reactionsService.remove).not.toHaveBeenCalled();
  });

  it('should pass the current user to authenticated post creation', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/posts')
      .set('authorization', `Bearer ${userToken}`)
      .send({
        title: ' Hue guide ',
        content: ' A guide to Hue. ',
        placeId: PLACE_ID,
        publicationIntent: 'SUBMIT',
      })
      .expect(201);

    expect(postsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID, role: Role.USER }),
      expect.objectContaining({
        title: 'Hue guide',
        content: 'A guide to Hue.',
        placeId: PLACE_ID,
      }),
    );
  });

  it('should return a domain forbidden response for a non-author update', async () => {
    const response = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .patch(`/api/v1/posts/${POST_ID}`)
      .set('authorization', `Bearer ${otherToken}`)
      .send({ title: 'Changed' })
      .expect(403);

    expect((response.body as unknown as ErrorBody).error.code).toBe(
      'FORBIDDEN',
    );
  });

  it('should route post mine, detail, update, and soft-delete operations', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get('/api/v1/posts/mine?status=PUBLISHED')
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get(`/api/v1/posts/${POST_ID}`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .patch(`/api/v1/posts/${POST_ID}`)
      .set('authorization', `Bearer ${userToken}`)
      .send({ title: 'Changed' })
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .delete(`/api/v1/posts/${POST_ID}`)
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(postsService.findMine).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ status: ContentStatus.PUBLISHED }),
    );
    expect(postsService.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      POST_ID,
    );
  });

  it('should validate review rating before calling the service', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post(`/api/v1/places/${PLACE_ID}/reviews`)
      .set('authorization', `Bearer ${userToken}`)
      .send({ rating: 6 })
      .expect(400);

    expect(reviewsService.create).not.toHaveBeenCalled();

    await request(app.getHttpServer() as unknown as SupertestApp)
      .post(`/api/v1/places/${PLACE_ID}/reviews`)
      .set('authorization', `Bearer ${userToken}`)
      .send({ rating: 5, content: ' Excellent ' })
      .expect(201);

    expect(reviewsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      PLACE_ID,
      { rating: 5, content: 'Excellent' },
    );
  });

  it('should route review lists, detail, update, and soft deletion', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get(`/api/v1/places/${PLACE_ID}/reviews`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get('/api/v1/reviews/mine')
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get(`/api/v1/reviews/${REVIEW_ID}`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .patch(`/api/v1/reviews/${REVIEW_ID}`)
      .set('authorization', `Bearer ${userToken}`)
      .send({ rating: 4 })
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .delete(`/api/v1/reviews/${REVIEW_ID}`)
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(reviewsService.findAllForPlace).toHaveBeenCalled();
    expect(reviewsService.findMine).toHaveBeenCalled();
    expect(reviewsService.update).toHaveBeenCalled();
    expect(reviewsService.remove).toHaveBeenCalled();
  });

  it('should validate and create a nested comment', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/comments')
      .set('authorization', `Bearer ${userToken}`)
      .send({
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: 'not-a-uuid',
        content: 'Helpful',
      })
      .expect(400);

    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/comments')
      .set('authorization', `Bearer ${userToken}`)
      .send({
        targetType: CommentTargetType.POST,
        targetId: POST_ID,
        parentId: COMMENT_ID,
        content: ' Helpful ',
      })
      .expect(201);

    expect(commentsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      expect.objectContaining({
        parentId: COMMENT_ID,
        content: 'Helpful',
      }),
    );
  });

  it('should route comment list, detail, update, and tombstone deletion', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get(
        `/api/v1/comments?targetType=${CommentTargetType.POST}&targetId=${POST_ID}`,
      )
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .get(`/api/v1/comments/${COMMENT_ID}`)
      .expect(200);
    await request(app.getHttpServer() as unknown as SupertestApp)
      .patch(`/api/v1/comments/${COMMENT_ID}`)
      .set('authorization', `Bearer ${userToken}`)
      .send({ content: 'Changed' })
      .expect(200);
    const deleted = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .delete(`/api/v1/comments/${COMMENT_ID}`)
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);

    const body = deleted.body as unknown as DeletedCommentBody;
    expect(body.data.content).toBeNull();
    expect(body.data.author).toBeNull();
    expect(body.data.isDeleted).toBe(true);
  });

  it('should create, summarize, and remove a reaction', async () => {
    await request(app.getHttpServer() as unknown as SupertestApp)
      .post('/api/v1/reactions')
      .set('authorization', `Bearer ${userToken}`)
      .send({
        targetType: ReactionTargetType.POST,
        targetId: POST_ID,
        type: ReactionType.LIKE,
      })
      .expect(201);

    const summary = await request(
      app.getHttpServer() as unknown as SupertestApp,
    )
      .get(
        `/api/v1/reactions/summary?targetType=${ReactionTargetType.POST}&targetId=${POST_ID}`,
      )
      .expect(200);
    expect(
      (summary.body as unknown as ReactionSummaryBody).data.counts.LIKE,
    ).toBe(1);

    await request(app.getHttpServer() as unknown as SupertestApp)
      .delete(
        `/api/v1/reactions?targetType=${ReactionTargetType.POST}&targetId=${POST_ID}`,
      )
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);
  });
});
