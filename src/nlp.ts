import { GoogleGenerativeAI } from "@google/generative-ai";
import { Notice, App, TFile } from 'obsidian';
import { encode } from 'gpt-tokenizer';


export async function tokenize(inputText: string): Promise<string[]> {
    try {
      if (typeof inputText !== 'string') {
        throw new Error('올바른 문자열을 입력해주세요.');
      }
      const tokens = encode(inputText).map(token => token.toString());
      return tokens;
    } catch (error) {
      console.error('토큰화 중 오류가 발생했습니다:', error);
      return [];
    }
  }
  
  function termFrequency(terms: string[]): Record<string, number> {
    const tf: Record<string, number> = {};
    terms.forEach((term) => {
      tf[term] = (tf[term] || 0) + 1;
    });
    return tf;
  }
  
  function computeIDF(df: number, totalDocs: number): number {
    return Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
  }
  
  
export function bm25Score(
    queryTerms: string[],
    docTerms: string[],
    titleTerms: string[],
    df: Record<string, number>,
    totalDocs: number,
    avgDocLength: number,
    k1 = 1.5,
    b = 0.75,
    titleWeight = 1.5
  ): number {
    const tf: Record<string, number> = termFrequency(docTerms);
    const titleTF: Record<string, number> = termFrequency(titleTerms);
    const docLength = docTerms.length;
    let score = 0;
  
    for (const term of queryTerms) {
      if (tf[term]) {
        const idf = computeIDF(df[term] || 0, totalDocs);
        const numerator = tf[term] * (k1 + 1);
        const denominator = tf[term] + k1 * (1 - b + b * (docLength / avgDocLength));
        score += idf * (numerator / denominator);
      }
      
      if (titleTF[term]) {
        const idf = computeIDF(df[term] || 0, totalDocs);
        const numerator = titleTF[term] * (k1 + 1);
        const denominator = titleTF[term] + k1 * (1 - b + b * (docLength / avgDocLength));
        score += titleWeight * idf * (numerator / denominator);
      }
    }
  
    return score;
  }



export function truncateContext(context: string, maxLength: number): string {
  if (context.length <= maxLength) {
    return context;
  }
  return context.substring(0, maxLength);
}




  


// getRelevantDocuments 함수에서 this를 사용하지 않고 필요한 정보를 인자로 받습니다.
export async function getRelevantDocuments(
    query: string,
    app: App, 
    documentNum: number,
    lastOpenedFile: TFile | null
  ): Promise<string> {
    try {
      const files = app.vault.getMarkdownFiles();
      
      if (files.length === 0) {
        new Notice('마크다운 파일을 찾을 수 없습니다.');
        return '';
      }
  
      const documents: { file: TFile; content: string; terms: string[]; titleTerms: string[] }[] = [];
  
      // 링크된 문서들을 포함하기 위한 추가 처리
      const linkedDocuments: { file: TFile; content: string }[] = [];
  
      // 1. query에서 [[wikilink]] 추출
      const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
      let match;
      const linkedPaths: string[] = [];
  
      while ((match = wikilinkPattern.exec(query)) !== null) {
        linkedPaths.push(match[1]);
      }
  
      // 2. 링크된 문서들을 찾아서 context에 추가
      for (const path of linkedPaths) {
        const file = app.metadataCache.getFirstLinkpathDest(path, "");
        if (file) {
          const content = await app.vault.cachedRead(file);
          linkedDocuments.push({ file, content });
        }
      }
  
      // 3. 일반 문서 검색 처리
      for (const file of files) {
        const content = await app.vault.cachedRead(file);
        const title = file.basename;
        const titleTerms = await tokenize(title);
        const contentTerms = await tokenize(content);
        const terms = [...titleTerms, ...contentTerms];
        documents.push({ file, content, terms, titleTerms });
      }
  
      // DF 계산과 유사도 계산
      const df: Record<string, number> = {};
      const totalDocs = documents.length;
      let totalDocLength = 0;
  
      documents.forEach((doc) => {
        totalDocLength += doc.terms.length;
        const uniqueTerms = new Set(doc.terms);
        uniqueTerms.forEach((term) => {
          df[term] = (df[term] || 0) + 1;
        });
      });
  
      const avgDocLength = totalDocLength / totalDocs;
      const queryTerms = await tokenize(query);
  
      // BM25를 이용한 문서 유사도 계산
      const similarities = documents.map((doc) => {
        const score = bm25Score(queryTerms, doc.terms, doc.titleTerms, df, totalDocs, avgDocLength);
        return { file: doc.file, content: doc.content, score };
      }); 
  
      similarities.sort((a, b) => b.score - a.score);
      const topDocuments = similarities.slice(0, documentNum).filter((doc) => doc.score > 0);
      
      // 4. 마지막으로 열었던 문서 추가
      let currentDocumentContent = '';
      if (lastOpenedFile) {
        const lastOpenedContent = await app.vault.cachedRead(lastOpenedFile);
        currentDocumentContent = `::: Current Opened Document Path :::\n${lastOpenedFile.path}\n\n::: Current Opened Document Content :::\n${lastOpenedContent}`;
      }
      console.log(currentDocumentContent);
  
      // 5. 링크된 문서들과 관련 문서들을 모두 context로 합침
      const matchingContents = [
        ...linkedDocuments.map(doc => `::: Document Path :::\n${doc.file.path}\n\n::: Document Content: :::\n${doc.content}`),
        ...topDocuments.map(doc => `::: Document Path :::\n${doc.file.path}\n\n::: Document Content :::\n${doc.content}`)
      ];
  
      // 마지막으로 열었던 문서 내용을 context 맨 앞에 추가
      matchingContents.unshift(currentDocumentContent);  // 맨 앞에 추가
      const context = matchingContents.join('\n\n---\n\n');
      console.log(context);
      return context;
    } catch (error) {
      console.error('Error in getRelevantDocuments:', error);
      new Notice('문서를 검색하는 중 오류가 발생했습니다.');
      return '';
    }
  }



export async function generateAIContent(
    query: string,
    context: string,
    apiKey: string,
    model: string,
    chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>
  ): Promise<string | null> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const selectedModel = genAI.getGenerativeModel({ model });
  
      chatHistory.push({
        role: "user",
        parts: [{ text: context }],
      });
  
      const chat = selectedModel.startChat({
        history: chatHistory,
      });
  
      let result = await chat.sendMessage("# rules\n- If you reference a document, be sure to provide the document's wiki link (e.g. [[path/to/document]]).\n# Info\n- \"Current Opened Document\" refers to the document that is currently open and being viewed by the user.\nUsing the documentation provided, answer the following questions in the appropriate language for questions.:"+query);
  
      chatHistory.push({
        role: "model",
        parts: [{ text: result.response.text() }],
      });
  
      return result.response.text();
    } catch (error) {
      console.error('Gemini API 요청 중 오류가 발생했습니다:', error);
      new Notice('AI 응답을 가져오는 중 오류가 발생했습니다.');
    }
  
    return null;
  }
  
  
  
  