export type LLMPlatform = 'gemini' | 'calude' | 'openAI';

export interface LLMModel {
	id: string;
	name: string;
}

export interface LLMPlatformInfo {
	id: LLMPlatform;
	name: string;
	apiKeyName: string;
	models: LLMModel[];
}

export const LLM_PLATFORMS: LLMPlatformInfo[] = [
	{
		id: "gemini",
		name: "Google Gemini",
		apiKeyName: "Google APi Key",
		models: [
			{ id: "gemini-1.5-flash-exp-0827", name: "Gemini 1.5 Flash Experimental" },
			{ id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
			{ id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
			{ id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Experimental" },
		]
	},
	{
		id: "openAI",
		name: "OpenAI",
		apiKeyName: "OpenAI API Key",
		models: [
			{id: "test", name: "this is test model not selected this model"}
		]
	}
];


export const getPlatformModels = (platform: LLMPlatform): LLMModel[] => {
	const platformInfo = LLM_PLATFORMS.find(p => p.id === platform);
	return platformInfo ? platformInfo.models : [];
}

export const getPlatformInfo = (id: LLMPlatform): LLMPlatformInfo => {
	return <LLMPlatformInfo>LLM_PLATFORMS.find(p => p.id === id);
}
