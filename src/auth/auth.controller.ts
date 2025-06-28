import { Controller, Post, Body } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Post('register')
  register(@Body() body: any) {
    // Handle user registration logic here
    return {
      message: 'User registered successfully',
      user: body,
    };
  }
}
