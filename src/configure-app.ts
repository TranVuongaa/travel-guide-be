import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

interface ConfigureAppOptions {
  enableSwagger?: boolean;
}

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (options.enableSwagger ?? true) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Vietnam Travel Guide API')
      .setDescription('Backend API for discovering destinations in Vietnam')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
