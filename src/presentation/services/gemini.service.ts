import { envs } from "../../config/envs.js";
import { CustomError } from "../../domain/CustomError.js";
import { GoogleGenAI, Type } from "@google/genai";

const consultarExistenciaProductoFunctionDeclaration = {
  name: "ConsultarExistenciaProducto",
  description: "Consulta la existencia/disponibilidad de un producto de primera necesidad. Devuelve si hay stock y la cantidad disponible.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      nombreProducto: {
        type: Type.STRING,
        description: "Nombre del producto de primera necesidad. Ej: 'arroz', 'frijoles', 'azúcar', 'aceite', 'leche', 'huevos'."
      },
      cantidadSolicitada: {
        type: Type.NUMBER,
        description: "Cantidad solicitada del producto. Opcional."
      },
      unidad: {
        type: Type.STRING,
        description: "Unidad de medida para la cantidad solicitada. Ej: 'kg', 'unidades', 'lts'. Opcional."
      },
      ubicacion: {
        type: Type.STRING,
        description: "Ubicación o tienda a consultar. Opcional."
      }
    },
    required: ["nombreProducto"]
  }
};

type InventarioItem = {
  nombre: string;
  stock: number;
  unidad: string;
};

const INVENTARIO_BASE: InventarioItem[] = [
  { nombre: "arroz", stock: 120, unidad: "kg" },
  { nombre: "frijoles", stock: 80, unidad: "kg" },
  { nombre: "azúcar", stock: 60, unidad: "kg" },
  { nombre: "sal", stock: 90, unidad: "kg" },
  { nombre: "aceite", stock: 40, unidad: "lts" },
  { nombre: "leche", stock: 200, unidad: "unidades" },
  { nombre: "huevos", stock: 300, unidad: "unidades" },
  { nombre: "harina", stock: 70, unidad: "kg" },
  { nombre: "pan", stock: 150, unidad: "unidades" },
];

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function buscarProducto(nombre: string): InventarioItem | null {
  const q = normalize(nombre);
  let found = INVENTARIO_BASE.find(p => normalize(p.nombre) === q);
  if (found) return found;
  found = INVENTARIO_BASE.find(p => normalize(p.nombre).includes(q) || q.includes(normalize(p.nombre)));
  return found ?? null;
}

export class GeminiService {
  static modelosSoportados = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-pro-preview-05-20"];

  static chatObj: any = null;

  static ask = async (prompt: string, modelo: string = this.modelosSoportados[0]): Promise<string> => {
    modelo = modelo.trim();

    if (!this.modelosSoportados.includes(modelo)) {
      throw new CustomError(
        "Modelo no soportado, los modelos soportados son: " + this.modelosSoportados.toString(),
        400
      );
    }

    try {
      const response = await this.generateContent(prompt, modelo);

      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        console.log(`Function to call: ${functionCall.name}`);
        console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);

        if (functionCall.name === "ConsultarExistenciaProducto") {
          const result = await this.procesarConsultaExistenciaProducto(functionCall.args);
          return typeof result === "string" ? result : JSON.stringify(result);
        }
      }

      const text = response.text;
      return text!;
    } catch (error: Error | any) {
      console.log(error);
      throw new CustomError("Error al procesar la solicitud a Gemini: " + error.message, 500);
    }
  };

  static procesarConsultaExistenciaProducto = async (args: any): Promise<any> => {
    try {
      const { nombreProducto, cantidadSolicitada, unidad, ubicacion } = args as {
        nombreProducto?: string;
        cantidadSolicitada?: number;
        unidad?: string;
        ubicacion?: string;
      };

      if (!nombreProducto) {
        return JSON.stringify({
          success: false,
          type: "validation_error",
          message: "Datos incompletos para consultar la existencia",
          details: {
            missing_fields: ["nombreProducto"],
            user_message: "Se requiere el nombre del producto para realizar la consulta"
          },
          data: null
        });
      }

      const encontrado = buscarProducto(nombreProducto);

      if (!encontrado) {
        return {
          success: true,
          type: "inventory_check",
          message: "Producto no encontrado en el inventario base",
          data: {
            product: {
              nombreProducto,
              disponible: false,
              stock: 0,
              unidad: unidad ?? null,
              ubicacion: ubicacion ?? null,
              lastUpdated: new Date().toISOString()
            },
            can_fulfill_request: false,
            user_message: `No se encontró '${nombreProducto}' en el inventario disponible.`
          }
        };
      }

      const disponible = encontrado.stock > 0;
      const puedeSurtir =
        typeof cantidadSolicitada === "number"
          ? encontrado.stock >= cantidadSolicitada
          : null;

      return {
        success: true,
        type: "inventory_check",
        message: "Consulta de existencia realizada",
        data: {
          product: {
            nombreProducto: encontrado.nombre,
            disponible,
            stock: encontrado.stock,
            unidad: encontrado.unidad,
            ubicacion: ubicacion ?? null,
            lastUpdated: new Date().toISOString()
          },
          requested: typeof cantidadSolicitada === "number"
            ? { cantidadSolicitada, unidad: unidad ?? encontrado.unidad }
            : null,
          can_fulfill_request: puedeSurtir,
          shortage: typeof cantidadSolicitada === "number" && !puedeSurtir
            ? Math.max(0, cantidadSolicitada - encontrado.stock)
            : null,
          user_message:
            typeof cantidadSolicitada === "number"
              ? (puedeSurtir
                ? `Sí, hay suficiente ${encontrado.nombre}. Stock: ${encontrado.stock} ${encontrado.unidad}.`
                : `Hay ${encontrado.stock} ${encontrado.unidad} de ${encontrado.nombre}, no alcanza para ${cantidadSolicitada} ${unidad ?? encontrado.unidad}.`)
              : (disponible
                ? `Hay disponibilidad de ${encontrado.nombre}: ${encontrado.stock} ${encontrado.unidad}.`
                : `No hay disponibilidad de ${encontrado.nombre} en este momento.`)
        }
      };
    } catch (error: any) {
      console.error("Error al procesar consulta de existencia:", error);
      return (
        `❌ Error interno del sistema\n` +
        `🔧 Motivo: No se pudo procesar la consulta de existencia\n` +
        `📞 Acción recomendada: Intenta nuevamente o contacta soporte técnico`
      );
    }
  };

  static generateContent = async (prompt: string, modelo: string = this.modelosSoportados[0]) => {
    const ai = new GoogleGenAI({ apiKey: envs.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: modelo.trim(),
      contents: prompt,
      config: {
        tools: [{ functionDeclarations: [consultarExistenciaProductoFunctionDeclaration] }]
      }
    });

    return response;
  };

  static chat = async (prompt: string, modelo: string = this.modelosSoportados[0]): Promise<string> => {
    modelo = modelo.trim();

    if (!this.modelosSoportados.includes(modelo)) {
      throw new CustomError(
        "Modelo no soportado, los modelos soportados son: " + this.modelosSoportados.toString(),
        400
      );
    }

    try {
      console.log("chatObj:", this.chatObj);
      if (!this.chatObj) {
        await this.generateContentChat(prompt, modelo);
      }

      const response = await this.chatObj.sendMessage({ message: prompt });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        console.log(`Function to call: ${functionCall.name}`);
        console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);

        if (functionCall.name === "GetParadasCercanas") {
          return "Hola, me gutaria ayudarte, pero no tengo acceso directo a tu ubicacion, puedes consultarlas en Ver Cercanas, busca el icono del autobus en la parte inferior derecha de la pantalla, y selecciona la opcion de ver cercanas, y te mostrara las paradas mas cercanas a tu ubicacion actual, si no tienes acceso a esa funcion, por favor contacta a soporte técnico.";
        }
        if (functionCall.name === "GetBusesMasVacios") {
          return "Hola, me gutaria ayudarte, pero no tengo acceso a esa informacion por el momento, por favor contacta a soporte técnico.";
        }
        if (functionCall.name === "GetServicios") {
          return "Hola, los servicios ofrecidos por los buses en Santa Ana, no son muy variados, la mayoria ofrecen aire acondicionado unicamente como servicio extra\nBuses Regulares: No ofrecen servicios adicionales, ademas del transporte\nBuses Especiales: Ofrecen aire acondicionado y television (en algunos casos)\nLas rutas que ofrecen servicios exclusivos mas variados son las interdepartamentales que salen y entran a Santa Ana como 201, SEISABUS o 202";
        }
      }

      const text = await response.text;
      return text!;
    } catch (error: Error | any) {
      console.log(error);
      throw new CustomError("Error al procesar la solicitud a Gemini: " + error.message, 500);
    }
  };

  static generateContentChat = async (prompt: string, modelo: string = this.modelosSoportados[0]) => {
    const promptDefault =
      ',Eres un asistende de IA, sobre la app Busroutes Mobile, que ayuda a los usuarios a encontrar informacion sobre transporte publico salvadoreño, servicios, seguridad en el transporte, tambien puedes ayudar sobre como actuar en ciertas situaciones, toda informacion esta en el contexto de El Salvador,  aparte si algun usuario hace alguna pregunta no relacionada con el tema (transporte, leyes, seguridad vial etc), responde con "Lo siento, no puedo ayudar con cosas no relacionadas al transporte publico",(aunque puedes se flexible si la pregunta se relaciona a transporte en general, leyes de el salvador de transporte, sanciones y otros temas de alguna forma relacionados, incluso situaciones de peligro en transporte publico, tambien puedes ser flexible si la pregunta se relaciona de alguna manera con los mensajes anteriores del chat  ) ademas evita responder a palabras ofensivas o temas como politica o religion, NO MENCIONES COSAS TECNIAS SOBRE LA APP COMO API, NI MENCIONES NADA SOBRE FUNCIONES, API O CODIGO INTERNO DEL SISTEMA NI NADA DE LOS FUNCTION CALLS QUE TIENES como `default_api.GetRutas() etc. UTILIZA LOS MENSAJES ANTERIORES DEL CHAT COMO CONTEXTO TAMBIEN';
    const ai = new GoogleGenAI({ apiKey: envs.GEMINI_API_KEY });

    const chat = await ai.chats.create({
      model: modelo.trim(),
      history: [
        {
          role: "user",
          parts: [{ text: "Hello" }]
        },
        {
          role: "model",
          parts: [{ text: "Great to meet you. What would you like to know?" }]
        }
      ],
      config: {
        tools: [
          {
            // Puedes registrar funciones de chat aquí si en el futuro decides exponer consultas de inventario también en el chat
            // functionDeclarations: [consultarExistenciaProductoFunctionDeclaration],
          }
        ],
        systemInstruction: promptDefault
      }
    });

    console.log("chat creado:", chat);
    this.chatObj = chat;
    console.log("chatObj de clase=====>:", this.chatObj);
  };

  static describeAudioFromUrl = async (
    base64Audio: string,
    mimeType: string,
    modelo: string = this.modelosSoportados[0]
  ): Promise<string> => {
    try {
      const ai = new GoogleGenAI({ apiKey: envs.GEMINI_API_KEY });

      const contents = [
        {
          inlineData: {
            mimeType: mimeType || "audio/mp3",
            data: base64Audio
          }
        }
      ];

      const response = await ai.models.generateContent({
        model: modelo.trim(),
        contents: contents,
        config: {
          tools: [{ functionDeclarations: [consultarExistenciaProductoFunctionDeclaration] }]
        }
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        console.log("Response with function calls:");
        const functionCall = response.functionCalls[0];

        if (functionCall.name === "ConsultarExistenciaProducto") {
          const result = await this.procesarConsultaExistenciaProducto(functionCall.args ?? {});
          return typeof result === "string" ? result : JSON.stringify(result);
        }
      }

      return response.text!;
    } catch (error: Error | any) {
      console.log(error);
      throw new CustomError("Error al procesar la solicitud de descripción de audio: " + error.message, 500);
    }
  };

  static describeImageFromUrl = async (
    base64Image: string,
    mimeType: string,
    prompt: string,
    modelo: string = this.modelosSoportados[0]
  ): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: envs.GEMINI_API_KEY });

    const contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Image
        }
      }
    ];

    const response = await ai.models.generateContent({
      model: modelo.trim(),
      contents: contents,
      config: {
        tools: [{ functionDeclarations: [consultarExistenciaProductoFunctionDeclaration] }]
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      console.log("Response with function calls:");
      const functionCall = response.functionCalls[0];

      if (functionCall.name === "ConsultarExistenciaProducto") {
        const result = await this.procesarConsultaExistenciaProducto(functionCall.args ?? {});
        return typeof result === "string" ? result : JSON.stringify(result);
      }
    }

    console.log(response.text);
    return response.text || "No description available.";
  }
}
