import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  // Honor X-Forwarded-* only from a reverse proxy on this host or the private network,
  // so req.secure (cookie Secure flag) and req.ip (login rate limit) are correct behind nginx
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');
  app.use(cookieParser());
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Mail Service API')
    .setDescription('Servicio centralizado de envío de correos institucionales via Microsoft Graph')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .addApiKey({ type: 'apiKey', name: 'x-admin-api-key', in: 'header' }, 'x-admin-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT', 3002);
  await app.listen(port);
  console.log(`Application running on port ${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
