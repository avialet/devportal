import 'express-session';
import type { User } from '@devportal/shared';

declare module 'express-session' {
  interface SessionData {
    user?: User;
    oidcState?: string;
    oidcNonce?: string;
  }
}
