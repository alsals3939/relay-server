import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const LOCAL_MLX_BASE_URL = 'http://127.0.0.1:8080/v1';
const LOCAL_MLX_MODEL = 'default_model';

/**
 * Returns an OpenAI-compatible client for either OpenAI or the local MLX server.
 * MLX exposes the same Chat Completions API, so the rest of the application can
 * use one client shape regardless of where inference runs.
 */
export function createAiClient(configService: ConfigService): OpenAI {
  const provider = configService.get<string>('AI_PROVIDER', 'openai');

  if (provider === 'mlx') {
    return new OpenAI({
      apiKey: configService.get<string>('AI_API_KEY', 'local-mlx'),
      baseURL: configService
        .get<string>('AI_BASE_URL', LOCAL_MLX_BASE_URL)
        .replace(/\/$/, ''),
    });
  }

  if (provider !== 'openai') {
    throw new ServiceUnavailableException(
      `지원하지 않는 AI_PROVIDER입니다: ${provider}. openai 또는 mlx를 사용하세요.`,
    );
  }

  const apiKey = configService.get<string>('OPENAI_API_KEY');
  if (!apiKey) {
    throw new ServiceUnavailableException(
      'OPENAI_API_KEY가 설정되지 않았습니다.',
    );
  }
  return new OpenAI({ apiKey });
}

/**
 * Embeddings power the document search behind the onboarding chatbot (RAG).
 * The local MLX server only exposes chat completions, so embedding requests
 * always go straight to OpenAI regardless of AI_PROVIDER.
 */
export async function embedTexts(
  configService: ConfigService,
  texts: string[],
): Promise<number[][]> {
  const apiKey = configService.get<string>('OPENAI_API_KEY');
  if (!apiKey) {
    throw new ServiceUnavailableException(
      'OPENAI_API_KEY가 설정되지 않았습니다.',
    );
  }
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  return response.data.map((item) => item.embedding);
}

/**
 * An MLX server maps the OpenAI request model `default_model` to the model and
 * LoRA adapter supplied when the server starts. An explicit AI_DEFAULT_MODEL
 * always wins so existing database defaults such as `gpt-4o-mini` do not leak
 * into local requests.
 */
export function resolveAiModel(
  configService: ConfigService,
  configuredModel: string | null | undefined,
  fallbackModel = 'gpt-4o-mini',
): string {
  const configuredDefault = configService.get<string>('AI_DEFAULT_MODEL');
  if (configuredDefault) return configuredDefault;

  if (configService.get<string>('AI_PROVIDER', 'openai') === 'mlx') {
    return LOCAL_MLX_MODEL;
  }

  return configuredModel ?? fallbackModel;
}
