import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CommentsModule } from './modules/comments/comments.module';
import { PlacesModule } from './modules/places/places.module';
import { PostsModule } from './modules/posts/posts.module';
import { ProvincesModule } from './modules/provinces/provinces.module';
import { ReactionsModule } from './modules/reactions/reactions.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UsersModule } from './modules/users/users.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'default',
          ttl: config.getOrThrow<number>('throttle.ttlMs'),
          limit: config.getOrThrow<number>('throttle.limit'),
        },
        {
          name: 'auth',
          ttl: config.getOrThrow<number>('throttle.authTtlMs'),
          limit: config.getOrThrow<number>('throttle.authLimit'),
        },
        {
          name: 'content',
          ttl: config.getOrThrow<number>('content.throttleTtlMs'),
          limit: config.getOrThrow<number>('content.throttleLimit'),
        },
      ],
    }),
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              connection: {
                host: config.getOrThrow<string>('redis.host'),
                port: config.getOrThrow<number>('redis.port'),
                password: config.get<string>('redis.password'),
              },
            }),
          }),
        ]),
    PrismaModule,
    UsersModule,
    AuthModule,
    ProvincesModule,
    CategoriesModule,
    PlacesModule,
    PostsModule,
    ReviewsModule,
    CommentsModule,
    ReactionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
