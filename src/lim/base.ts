import {ChatMessage, Context} from "./types";

export abstract class BaseLLMService {
	protected apiKey: string;
	/*protected rule = `
	# rules
	- If you reference a document, be sure to provide the document's wiki link (e.g. [[path/to/document]]).
	# Info
	- "Current Opened Document" refers to the document that is currently open and being viewed by the user.
	- "Selected Text" refers to the text that currently selected by user
	---
	Using the documentation provided, answer the following questions in the appropriate language for questions.`;*/
	protected rule = `
	# Rules
	# 1. Document References:
		- If you reference a document, be sure to provide the document's wiki link (e.g. [[path/to/document]]).
		- Always use wiki-style links (e.g. [[path/to/document]])
		- Verify link validity before referencing
		- Include section reference when applicable (e.g. [[path/to/document]])
		
	# 2. Context Awareness:
		- "Current Opened Document": The active document in users' view
		- "Selected Text": Text currently highlighted by the user
		- "Working Directory": The current document's location
		
	3. Response Guidelines:
	   - Use appropriate language based on user's question
	   - Maintain markdown formatting in responses
	   - Provide context-aware suggestions
	
	Output Format:
		- Responses should be structured and clearly formatted
		- Include relevant wiki-links
		- Preserve markdown syntax where appropriate

	---
	Please process the following query based on these guidelines.
	`
	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	protected abstract prepareMessages(
		context: Context,
		chatHistory: ChatMessage[]
	): any; // 각 서비스에 맞는 메시지 형식 반환

	abstract generateContent(
		query: string,
		context: Context,
		chatHistory: ChatMessage[],
		model: string
	): Promise<string>;

	abstract generateContentStream(
		query: string,
		context: Context,
		chatHistory: ChatMessage[],
		model: string,
		onChunk: (chunkText: string) => void
	): Promise<void>;

}
