import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * What a device reports when it checks in.
 *
 * `filtering` is the device's own observation, and it is the only thing that can
 * move a row into `protected`. The server cannot know whether a handset is
 * actually filtering — Android may not have granted VPN consent, another VPN may
 * hold the slot — so a status assumed from "the account is switched on" is a
 * guess, and this product must not guess about that.
 *
 * Omitting it means "no opinion", which is what an older client sends; the
 * heartbeat then behaves as it always did and only clears a derived `offline`.
 */
export class HeartbeatDto {
  @ApiPropertyOptional({
    description:
      'Whether this device is filtering right now. Promotes needs-setup/offline to protected, ' +
      'and demotes protected back to needs-setup when filtering stops. Never overrides paused, ' +
      'which is the user’s own decision.',
  })
  @IsOptional()
  @IsBoolean()
  filtering?: boolean;
}
