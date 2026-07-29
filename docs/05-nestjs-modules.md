# NestJS Module Blueprint — Vietnam Travel Guide

This document tells the agent exactly how to generate a standard NestJS module, using the
`Places` module as the reference example, to be applied the same way to `Posts`, `Reviews`,
`Comments`, `Reactions`, `Media`, `Notifications`, `Moderation`.

## 1. Module List & Responsibilities

| Module | Main Responsibility | Depends on |
|---|---|---|
| `AuthModule` | Register/login, JWT, refresh token, guards | `UsersModule` |
| `UsersModule` | User management, profile | — |
| `PlacesModule` | Place CRUD, category/province linkage | `CategoriesModule` |
| `CategoriesModule` | Category CRUD | — |
| `PostsModule` | Post CRUD (system/user), content moderation | `PlacesModule`, `MediaModule` |
| `ReviewsModule` | Review CRUD, directly maintains Place rating | `PlacesModule` |
| `CommentsModule` | Nested comments for Post/Review | `PostsModule`, `ReviewsModule` |
| `ReactionsModule` | Reactions on Post/Review/Comment | any module that can be reacted to |
| `MediaModule` | Presigned URL, upload confirmation | S3 SDK |
| `TravelContentIngestionsModule` | Durable Oxylabs ingestion runner | PostgreSQL |
| `NotificationsModule` | Create & fetch notifications (planned) | backend TBD |
| `ModerationModule` | Abuse reports, report handling | all content modules |

## 2. Detailed Structure of a Module (example: `PlacesModule`)

```
modules/places/
├── places.module.ts
├── places.controller.ts
├── places.service.ts
├── dto/
│   ├── create-place.dto.ts
│   ├── update-place.dto.ts
│   └── query-place.dto.ts
├── interfaces/
│   └── place-with-relations.interface.ts
└── places.service.spec.ts
```

### 2.1 `places.module.ts`
```ts
@Module({
  imports: [PrismaModule, CategoriesModule],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
```

### 2.2 `dto/create-place.dto.ts`
```ts
export class CreatePlaceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ description: 'Complete destination body as sanitized HTML' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiProperty()
  @IsUUID()
  provinceId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
```

### 2.3 `dto/query-place.dto.ts` (extends the shared PaginationDto)
```ts
export class QueryPlaceDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  provinceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
```

### 2.4 `places.controller.ts`
```ts
@ApiTags('places')
@Controller({ path: 'places', version: '1' })
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List places with filter & pagination' })
  findAll(@Query() query: QueryPlaceDto) {
    return this.placesService.findAll(query);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.placesService.findOneOrFail(id);
  }

  @Post()
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiBearerAuth()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePlaceDto) {
    return this.placesService.create(user.id, dto);
  }

  @Patch(':id')
  @Roles(Role.EDITOR, Role.ADMIN)
  @ApiBearerAuth()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlaceDto) {
    return this.placesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.placesService.remove(id);
  }
}
```

### 2.5 `places.service.ts`
```ts
@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryPlaceDto) {
    const { page, limit, provinceId, categoryId, search } = query;
    const where: Prisma.PlaceWhereInput = {
      ...(provinceId && { provinceId }),
      ...(categoryId && { categories: { some: { categoryId } } }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
      status: ContentStatus.PUBLISHED,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.place.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { province: true, categories: { include: { category: true } } },
      }),
      this.prisma.place.count({ where }),
    ]);

    return new PaginatedResult(items, total, page, limit);
  }

  async findOneOrFail(id: string) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) throw new PlaceNotFoundException(id);
    return place;
  }

  async create(userId: string, dto: CreatePlaceDto) {
    return this.prisma.place.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        description: dto.description,
        content: sanitizeArticleHtml(dto.content, 'Destination content'),
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        provinceId: dto.provinceId,
        createdById: userId,
        categories: {
          create: dto.categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
    });
  }

  // update(), remove() follow the same pattern — always findOneOrFail before update/remove.
}
```

### 2.6 Domain-specific Exception
```ts
// common/exceptions/place-not-found.exception.ts
export class PlaceNotFoundException extends NotFoundException {
  constructor(id: string) {
    super({ errorCode: ErrorCode.PLACE_NOT_FOUND, message: `Place ${id} not found` });
  }
}
```

## 3. Shared Guards & Decorators (in `common/`)

```ts
// common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// common/decorators/public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

```ts
// common/guards/jwt-auth.guard.ts — registered globally via APP_GUARD, respects @Public()
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

```ts
// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user?.role);
  }
}
```

## 4. Middleware Example
```ts
// common/middlewares/request-id.middleware.ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    req['requestId'] = req.headers['x-request-id'] ?? randomUUID();
    next();
  }
}
```

## 5. Interceptor Example (response normalization)
```ts
@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: { timestamp: new Date().toISOString(), requestId: request['requestId'] },
      })),
    );
  }
}
```

## 6. Rules When Generating a New Module
When implementing a new module from an APPROVED prompt file (see `03-workflow.md`), the agent
MUST:
1. Create all files per the structure in section 2.
2. Apply the existing Guards/Decorators from `common/` — never recreate a guard that already
   exists for the same purpose.
3. Add a domain-specific exception if needed, registering a new `errorCode` in
   `common/constants/error-code.enum.ts`.
4. Write `*.service.spec.ts` for every public service method.
5. Update Swagger decorators fully for every new endpoint.
