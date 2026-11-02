import { Controller, Get, Query } from '@nestjs/common';
import { GlobalRoles } from '../auth/decorators/global-roles.decorator';
import { AdminService } from './admin.service';
import { ListAdminResourcesDto } from './dto/list-admin-resources.dto';

@GlobalRoles('SUPERADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  listUsers(@Query() query: ListAdminResourcesDto) {
    return this.adminService.listUsers(query);
  }

  @Get('workspaces')
  listWorkspaces(@Query() query: ListAdminResourcesDto) {
    return this.adminService.listWorkspaces(query);
  }
}
