import { Router } from "express";

import { WhatsController } from "./whatsController.js";
import twilio from "twilio";
import { envs } from "../../config/envs.js";

export class WhatsRoutes {
  static get routes() {
    const router = Router();
    const whatsController = new WhatsController();
    router.post('/',

      //!! When using ngwrok or any other forwaring service, you need to set the protocol and host accordingly, if u dont do this, twilio will not be able to validate the request and will throw an error 403
      //!! for production, this step is not necessary, just use twilio.webhook({ validate: true })
      // twilio.webhook({ validate: true, protocol: 'https', host: '43ee0b42c916.ngrok-free.app', authToken: envs.TWILIO_AUTH_TOKEN }),
      whatsController.TwilioMessaging
    )
    return router;
  }
}
