import { Request, Response } from "express";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse";
import { GeminiService } from "../services/gemini.service.js";
import axios from "axios";
import { envs } from "../../config/envs.js";



export class WhatsController {
  constructor() { }

  public TwilioMessaging = async (req: Request, res: Response) => {
    const twiml = new MessagingResponse();
    console.log(req)
    const incomingMsg = req.body.Body;
    const sender = req.body.From;

    if (req.body.MessageType === 'audio') {


      const audioResponse = await axios.get(req.body.MediaUrl0, {
        responseType: 'arraybuffer',
        auth: {
          username: envs.TWILIO_ACCOUNT_SID,
          password: envs.TWILIO_AUTH_TOKEN,
        },
      });
      const audioBuffer = Buffer.from(audioResponse.data, "binary");
      const mimeType = req.body.MediaContentType0 || "audio/mp3";
      const base64Audio = audioBuffer.toString("base64");
      const respuesta = await GeminiService.describeAudioFromUrl(base64Audio, mimeType, 'gemini-1.5-flash');
      // // Descargar el audio de la URL usando axios

      console.log(audioResponse.data);
      // Aquí puedes procesar el audioBuffer según lo que necesites

      twiml.message(respuesta);
    }
    else if (req.body.MessageType === 'image') {
      const audioResponse = await axios.get(req.body.MediaUrl0, {
        responseType: 'arraybuffer',
        auth: {
          username: envs.TWILIO_ACCOUNT_SID,
          password: envs.TWILIO_AUTH_TOKEN,
        },
      });
      const imageBuffer = Buffer.from(audioResponse.data, "binary");
      const mimeType = req.body.MediaContentType0 || "audio/mp3";
      const base64Image = imageBuffer.toString("base64");
      const respuesta = await GeminiService.describeImageFromUrl(base64Image, mimeType, incomingMsg, 'gemini-1.5-flash');
      twiml.message(respuesta);

    }
    else {

      const response = await GeminiService.ask(incomingMsg, "gemini-2.0-flash")
      twiml.message(response);
    }
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  }
}
