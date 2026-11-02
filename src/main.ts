import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const origins = [
    configService.get<string>('CLIENT_ORIGIN', 'http://localhost:3000'),
    configService.get<string>('ADMIN_ORIGIN', 'http://localhost:3002'),
  ];

  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(configService.get<number>('PORT', 3001));
}
void bootstrap();
