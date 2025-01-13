export interface MessagePart {
	text: string;
}

export interface ChatMessage {
	role: string;
	parts: MessagePart[];
}

export interface Context {
	// context: string;
	// context: ChatMessage;
	document: string;
	selectedPrompt: string;
}
