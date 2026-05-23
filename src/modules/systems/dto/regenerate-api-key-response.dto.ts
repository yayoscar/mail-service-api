import { ApiProperty } from '@nestjs/swagger';

export class RegenerateApiKeyResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  apiKey: string;

  @ApiProperty()
  systemId: string;
}
