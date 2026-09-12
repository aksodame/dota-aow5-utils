import { Module, type Provider } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { loadConfig } from '../config.ts';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { DiscordEnabledGuard } from './provider-enabled.guard.ts';
import { DiscordStrategy } from './strategies/discord.strategy.ts';
import { LocalStrategy } from './strategies/local.strategy.ts';
import { SteamStrategy } from './strategies/steam.strategy.ts';

/**
 * Passport with no session support, which is the whole shape of the decision.
 *
 * `PassportModule.register({ session: false })` and no `passport.session()` in
 * `main.ts`: this application already stores the SHA-256 of every session
 * cookie in a table, and swapping that for `express-session` plus a
 * serialise/deserialise pair would trade a better mechanism for a more familiar
 * one. Passport is here to authenticate — check a password, complete an OpenID
 * round trip, spend an OAuth2 code — and `AuthService` issues the session.
 *
 * **Discord is registered only when the deploy has keys for it.** A strategy
 * constructed with an empty client id would still be reachable at
 * `/auth/discord` and would fail at Discord's end with something unhelpful; not
 * registering it means the route 404s and, more usefully, `/auth/providers`
 * never offers the button. Steam needs no key to *authenticate* — its Web API
 * key only fetches a display name — so it is always available.
 */
const strategies: Provider[] = [LocalStrategy, SteamStrategy];
if (loadConfig().discord !== null) strategies.push(DiscordStrategy);

@Module({
  imports: [PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [AuthService, DiscordEnabledGuard, ...strategies],
  exports: [AuthService],
})
export class AuthModule {}
