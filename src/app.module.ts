import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/env.validation';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { GlobalRolesGuard } from './auth/guards/global-roles.guard';
import { ChatModule } from './chat/chat.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkspaceContentModule } from './workspace-content/workspace-content.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    WorkspaceContentModule,
    ChatModule,
    OnboardingModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: GlobalRolesGuard,
    },
  ],
})
export class AppModule {}
