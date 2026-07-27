import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  imports: [PrismaModule],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
