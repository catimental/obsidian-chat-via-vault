import {BaseLLMService} from "./base";
import {GeminiService} from "./gemini";
import {LLMPlatform} from "../constants/llm";



export class LLMServiceFactory{
  	static createService(platform: LLMPlatform, apiKey: string): BaseLLMService{
	switch(platform){
	  case 'gemini':
		return new GeminiService(apiKey);
	  default:
		throw new Error(`Error occurred while creating LLM service: [platform: ${platform}]`);
	}
  }
}
