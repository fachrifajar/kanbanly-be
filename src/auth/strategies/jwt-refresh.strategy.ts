import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const cookieExtractor = (req: Request): string | null => {
  return typeof req?.cookies?.refresh_token === 'string'
    ? req.cookies.refresh_token
    : null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      // jwtFromRequest: ExtractJwt.fromExtractors([
      //   (req: Request): string | null => {
      //     return typeof req?.cookies?.refresh_token === 'string'
      //       ? req.cookies.refresh_token
      //       : null;
      //   },
      // ]),
      jwtFromRequest: cookieExtractor,
      secretOrKey: configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      passReqToCallback: true,
    } as import('passport-jwt').StrategyOptionsWithRequest);
  }

  validate(
    req: Request & { cookies: { [key: string]: any } },
    payload: { sub: string },
  ) {
    const refreshToken: string | undefined =
      typeof req.cookies?.refresh_token === 'string'
        ? req.cookies.refresh_token
        : undefined;
    if (!refreshToken)
      throw new UnauthorizedException('Refresh token is missing');
    return { id: payload.sub, refreshToken };
  }
}
