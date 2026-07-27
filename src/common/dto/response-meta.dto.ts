import { ApiProperty } from '@nestjs/swagger';

export class ResponseMetaDto {
  @ApiProperty({ format: 'date-time' })
  timestamp: string;

  @ApiProperty({ format: 'uuid' })
  requestId: string;
}
