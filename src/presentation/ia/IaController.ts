import { Request, Response } from "express";
import { CustomError } from "../../domain/CustomError.js";
import { GeminiService } from "../services/gemini.service.js";

export class IaController {
  constructor() { }

  public Preguntar = async (req: Request, res: Response) => {
    if (!req.body) {
      res
        .status(400)
        .json({
          message:
            "Datos incompletos, la peticion debe tener un cuerpo : {promp, modelo}",
        });
      return;
    }

    const { prompt } = req.body;
    const modelo = req.params.modelo.trim();

    console.log("modelo", modelo);
    if (!modelo) {
      res.status(400).json({ message: "Modelo no especificado" });
      return;
    }

    if (!prompt) {
      res.status(400).json({ message: "Prompt no especificado" });
      return;
    }

    try {
      const respuesta = await GeminiService.ask(prompt, req.params.model);
      res.status(200).json(respuesta);
      return;
    } catch (error: CustomError | any) {
      res
        .status(error.statusCode || 500)
        .json({
          message: error.message || "Error al procesar la solicitud a Gemini",
        });
    }
  };

  public Chat = async (req: Request, res: Response) => {
    if (!req.body) {
      res
        .status(400)
        .json({
          message:
            "Datos incompletos, la peticion debe tener un cuerpo : {promp, modelo}",
        });
      return;
    }

    const { prompt } = req.body;
    const modelo = req.params.modelo.trim();

    console.log("modelo", modelo);
    if (!modelo) {
      res.status(400).json({ message: "Modelo no especificado" });
      return;
    }

    if (!prompt) {
      res.status(400).json({ message: "Prompt no especificado" });
      return;
    }

    try {
      const respuesta = await GeminiService.chat(prompt, modelo);
      res.status(200).json({ respuesta });
      return;
    } catch (error: CustomError | any) {
      res
        .status(error.statusCode || 500)
        .json({
          message: error.message || "Error al procesar la solicitud a Gemini",
        });
    }
  };
}
