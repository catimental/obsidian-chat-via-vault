import { GoogleGenerativeAI } from "@google/generative-ai";
import { Notice } from 'obsidian';


export async function generateAIContent(
  query: string,
  context: string,
  apiKey: string,
  model: string,
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>,
  selectedPrompt: string,
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const selectedModel = genAI.getGenerativeModel({ model });
  const rule = `# rules\n- If you reference a document, be sure to provide the document's wiki link (e.g. [[path/to/document]]).\n# Info\n- \"Current Opened Document\" refers to the document that is currently open and being viewed by the user.\n- \"Selected Text\" refers to the text that currently selected by user\n---\nUsing the documentation provided, answer the following questions in the appropriate language for questions.`;

  chatHistory.push({
    role: "user",
    parts: [{ text: rule }],
  });

  chatHistory.push({
    role: "model",
    parts: [{ text: context }],
  });
  console.log(context);

  
  
  chatHistory.push({
    role: "user",
    parts: [{ text: `prompt: ${selectedPrompt}` }],
  });

  const chat = selectedModel.startChat({
    history: chatHistory,
  });

  let result = await chat.sendMessage(query);

  chatHistory = chatHistory.filter((message) => {
    const messageText = message.parts.map(part => part.text).join('');
    return !(
      messageText.includes(context) || // context 제거
      messageText.includes(rule) || // rules 제거
      messageText.includes(`prompt: ${selectedPrompt}`) // prompt 제거
    );
  });


  chatHistory.push({
    role: "model",
    parts: [{ text: result.response.text() }],
  });

  return result.response.text();
}


export async function generateAIContentStream(
  query: string,
  context: string,
  apiKey: string,
  model: string,
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>,
  selectedPrompt: string,
  onChunk: (chunkText: string) => void
): Promise<void> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const selectedModel = genAI.getGenerativeModel({ model });

    chatHistory.push({
      role: "user",
      parts: [{ text: context }],
    });
    console.log(context);
  
    const rule = `# rules\n- If you reference a document, be sure to provide the document's wiki link (e.g. [[path/to/document]]).\n# Info\n- \"Current Opened Document\" refers to the document that is currently open and being viewed by the user.\n- \"Selected Text\" refers to the text that currently selected by user\n---\nUsing the documentation provided, answer the following questions in the appropriate language for questions.`;
    chatHistory.push({
      role: "user",
      parts: [{ text: rule }],
    });
    
    chatHistory.push({
      role: "user",
      parts: [{ text: `prompt: ${selectedPrompt}` }],
    });
  
    const chat = selectedModel.startChat({
      history: chatHistory,
    });

    const result = await chat.sendMessageStream(query);
    

    // Stream the response and use the onChunk callback to update UI
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      onChunk(chunkText);
    }
    chatHistory = chatHistory.filter((message) => {
      const messageText = message.parts.map(part => part.text).join('');
      return !(
        messageText.includes(context) || // context 제거
        messageText.includes(rule) || // rules 제거
        messageText.includes(`prompt: ${selectedPrompt}`) // prompt 제거
      );
    });
    chatHistory.push({
      role: "model",
      parts: [{ text: (await result.response).text() }],
    });

  } catch (error) {
    console.error('Error in getRelevantDocuments:', error);
    new Notice('문서를 검색하는 중 오류가 발생했습니다.');
  }
}