import { SetMetadata } from '@nestjs/common';

export const REQUIRE_API_KEY_KEY = 'requireApiKey';
export const RequireApiKey = () => SetMetadata(REQUIRE_API_KEY_KEY, true);
