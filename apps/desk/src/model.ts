/** One message in an OpenAI-compatible chat. */
export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: readonly ToolCall[];
    }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };

export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface ToolSpec {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface ChatModel {
  readonly id: string;
  complete(messages: readonly ChatMessage[], tools: readonly ToolSpec[]): Promise<ChatMessage>;
}

/**
 * Any OpenAI-compatible `/chat/completions` endpoint, such as a model served on the desk's own
 * host. The base URL, model and optional key come from the environment.
 */
export class OpenAiCompatibleModel implements ChatModel {
  constructor(
    private readonly baseUrl: string,
    readonly id: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs = 180_000,
  ) {}

  async complete(
    messages: readonly ChatMessage[],
    tools: readonly ToolSpec[],
  ): Promise<ChatMessage> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey === undefined ? {} : { authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model: this.id,
        messages,
        ...(tools.length === 0 ? {} : { tools, tool_choice: 'auto' }),
        temperature: 0,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`model endpoint answered ${response.status.toString()}`);
    }
    const body = (await response.json()) as {
      choices?: readonly { message?: ChatMessage }[];
    };
    const message = body.choices?.[0]?.message;
    if (message === undefined) throw new Error('model endpoint returned no message');
    return message;
  }
}
