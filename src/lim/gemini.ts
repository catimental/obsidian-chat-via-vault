import {BaseLLMService} from "./base";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {ChatMessage, Context} from "./types";

export class GeminiChatHistory implements ChatMessage {
	role: GeminiRole;
	// @ts-ignore
	parts: Object[];

	constructor(role: GeminiRole, parts: Object[]) {
		this.role = role;
		this.parts = parts;
	}
}

export type GeminiRole = "user" | "model";

export class GeminiService extends BaseLLMService {
	private genAI: GoogleGenerativeAI;

	constructor(apiKey: string) {
		super(apiKey);
		this.genAI = new GoogleGenerativeAI(apiKey);
	}

	protected prepareMessages(context: Context, chatHistory: ChatMessage[]): any {
		const messages = [
			// ...chatHistory,
		] as GeminiChatHistory[];

		//rules
		messages.push({ role: "user", parts: [{ text: this.rule }] });

		// context.document는 model에서 user로 변경 후 테스트 진행
		if(context.document) {
			messages.push({ role: "user", parts: [{ text: context.document }] });
		}

		if(context.selectedPrompt) {
			messages.push({ role: "user", parts: [{ text: `prompt: ${context.selectedPrompt}` }] });
		}

		//add history messages
		chatHistory.forEach((message) => {
			messages.push({ role: message.role as GeminiRole, parts: message.parts });
		});

		return messages;
	}

	async generateContent(
		query: string,
		context: Context,
		chatHistory: ChatMessage[],
		model: string
	): Promise<string> {
		try {
			const selectedModel = this.genAI.getGenerativeModel({ model });
			const messages = this.prepareMessages(context, chatHistory);

			const chat = selectedModel.startChat({
				history: messages
			});

			console.debug(`sendMessage requested [query: ${query}]`);
			const result = await chat.sendMessage(query);
			const response = await result.response;
			return response.text();
		} catch (e) {
			console.error(e);
			throw new Error("Error occurred while call Gemini API");
		}
	}

	async generateContentStream(
		query: string,
		context: Context,
		chatHistory: ChatMessage[],
		model: string,
		onChunk: (chunkText: string) => void
	): Promise<void> {

		throw new Error("Method not implemented.");
	}

}
