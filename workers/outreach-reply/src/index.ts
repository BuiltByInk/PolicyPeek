// privacy@getpolicypeek.com Email Routing Worker. No fetch route that does
// anything, no send binding, no cron. NOT DEPLOYED; routing rule not created.
import { handleEmail, type ReplyEnv } from "./reply";

export default {
  async fetch(): Promise<Response> {
    return new Response("Not found", { status: 404 });
  },
  async email(message: ForwardableEmailMessage, env: ReplyEnv): Promise<void> {
    await handleEmail(message, env);
  },
} satisfies ExportedHandler<ReplyEnv>;
