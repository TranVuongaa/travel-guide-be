# Code Standards — Vietnam Travel Guide Backend

This document is a **mandatory ruleset** for the AI agent when generating code. Any code that
doesn't comply is considered incomplete and must be fixed before merging.

## 1. Language & Style
- TypeScript **strict mode** (`strict: true` in `tsconfig.json`), no `any` unless justified with a
  comment explaining why it's unavoidable.
- ESLint (Airbnb or `@nestjs/eslint-config`) + Prettier. Don't disable a rule via comment unless
  truly necessary, and explain why when you do.
- Import order: Node builtins → external libraries → internal aliases (`@common/...`,
  `@modules/...`) → relative imports. Use path aliases instead of `../../../`.

## 2. Naming Conventions
| Object | Convention | Example |
|---|---|---|
| File | kebab-case + type suffix | `create-post.dto.ts`, `posts.service.ts` |
| Class | PascalCase | `PostsService`, `CreatePostDto` |
| Interface/Type | PascalCase, no `I` prefix | `PaginatedResult<T>` |
| Variable/function | camelCase | `findPublishedPosts()` |
| Enum | PascalCase name, UPPER_SNAKE_CASE values | `enum PostStatus { DRAFT, PUBLISHED }` |
| DB table | snake_case, plural | `posts`, `post_reactions` |
| Route path | kebab-case, plural | `/api/v1/posts`, `/api/v1/travel-places` |
| DTO | verb + entity + `Dto` | `CreatePlaceDto`, `UpdatePlaceDto`, `QueryPlaceDto` |

## 3. Mandatory Module Structure (each module)
```
modules/posts/
├── posts.module.ts
├── posts.controller.ts
├── posts.service.ts
├── dto/
│   ├── create-post.dto.ts
│   ├── update-post.dto.ts
│   └── query-post.dto.ts
├── entities/ (if TypeORM) or mappers/ (if Prisma needs transformation)
├── interfaces/
└── posts.controller.spec.ts / posts.service.spec.ts
```

## 4. Controller
- Orchestration only, NO business logic, NO direct DB queries.
- Every endpoint has: `@ApiTags`, `@ApiOperation`, `@ApiResponse` (Swagger).
- Use a custom `@CurrentUser()` decorator to get the user from the request instead of reading
  `req.user` directly.
- Input DTOs validated via `@Body()`, `@Query()` combined with a global `ValidationPipe`
  (whitelist + forbidNonWhitelisted = true).

```ts
@ApiTags('posts')
@Controller({ path: 'posts', version: '1' })
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @Roles(Role.USER, Role.EDITOR, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new post' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.postsService.create(user.id, dto);
  }
}
```

## 5. DTO & Validation
- Every required field has a matching `class-validator` decorator (`@IsString()`, `@IsUUID()`,
  `@IsEnum()`, `@IsOptional()`...).
- Every DTO has `@ApiProperty()` (Swagger) — never skipped, so the API docs stay accurate.
- List-query DTOs extend a shared `PaginationDto` (`page`, `limit`, `sortBy`, `sortOrder`).
- Never reuse an entity directly as a response if it contains sensitive fields (password hash,
  tokens) — always use a Response DTO or `@Exclude()`.

## 6. Service
- Pure business logic, no dependency on Express `Request`/`Response`.
- Transactions: any write operation touching multiple tables must be wrapped in a transaction
  (`prisma.$transaction`).
- Throw standard NestJS exceptions (`NotFoundException`, `ForbiddenException`,
  `BadRequestException`) with a domain-specific error code (see section 8).
- Never throw a raw string — always throw an Error/Exception object.

## 7. Guard / Middleware / Interceptor
- **Guard**: decides pass/reject only (auth, role, ownership check).
- **Middleware**: side effects that don't need to know the route handler (attach requestId, raw
  request logging).
- **Interceptor**: transforms request/response, measures processing time, caching.
- Global application order in `main.ts`: Middleware → Guard (`APP_GUARD`) → Interceptor
  (`APP_INTERCEPTOR`) → Pipe (`APP_PIPE`) → Filter (`APP_FILTER`).

## 8. Error Handling & Error Codes
- Define a centralized `ErrorCode` enum in `common/constants/error-code.enum.ts`, e.g.
  `PLACE_NOT_FOUND`, `POST_ALREADY_REACTED`, `REVIEW_DUPLICATE`.
- Every business exception uses a custom class extending `HttpException`, carrying an
  `errorCode`.
- `AllExceptionsFilter` catches everything and reformats it per the standard in
  `01-architecture.md` section 4.3, hiding the stack trace in production.

## 9. Testing
- Unit tests are mandatory for Services (business logic), mocking Prisma/Repository.
- e2e tests (Supertest) are mandatory for core flows: auth, Post CRUD, creating a Review, creating
  a Comment, Reaction.
- Suggested minimum coverage: 70% for `modules/**/*.service.ts`.
- Test naming: `should <expected behavior> when <condition>`.

## 10. Git & Commits
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Every PR is tied to a corresponding prompt file in `/prompts` (see `03-workflow.md`), branch
  name: `feature/<prompt-slug>`.

## 11. Security
- Never log passwords, tokens, or sensitive PII.
- Sanitize input even when using an ORM (especially raw queries, if any).
- Rate limit auth endpoints, reporting, and content creation.
- CORS whitelist specific domains in production, never use `*`.
- Helmet enabled by default (`app.use(helmet())`).

## 12. API Documentation
- Swagger auto-generated at `/api/docs`. Decorators must be kept up to date whenever an endpoint
  is added or changed — never let the docs drift from the actual code.
