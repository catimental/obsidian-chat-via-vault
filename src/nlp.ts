import { Notice, App, TFile, TAbstractFile } from 'obsidian';
import { encode } from 'gpt-tokenizer';

// 캐시 파일 경로 지정
const CACHE_FILE_PATH = 'bm25-tfidf-cache.json';

interface CachedDocument {
  title: string
  content: string
  terms: string[];
  titleTerms: string[];
  tfIdfScore: number;
  bm25Score: number;
}

// 캐시 저장소
let cachedDocuments: Record<string, CachedDocument> = {};

// 토크나이즈 함수
export async function tokenize(inputText: string): Promise<string[]> {
  if (typeof inputText !== 'string') {
    throw new Error('올바른 문자열을 입력해주세요.');
  }
  return encode(inputText).map(token => token.toString());
}

function termFrequency(terms: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  terms.forEach(term => {
    tf[term] = (tf[term] || 0) + 1;
  });
  return tf;
}

function computeIDF(df: number, totalDocs: number): number {
  return Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
}

export function tfIdfScore(
  queryTerms: string[],
  docTerms: string[],
  df: Record<string, number>,
  totalDocs: number
): number {
  const tf = termFrequency(docTerms);
  let score = 0;

  for (const term of queryTerms) {
    if (tf[term]) {
      const idf = computeIDF(df[term] || 0, totalDocs);
      score += tf[term] * idf; // TF-IDF 계산
    }
  }

  return score;
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
  const tf = termFrequency(docTerms);
  const titleTF = termFrequency(titleTerms);
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

// 캐시를 파일로 저장
async function saveCache(app: App) {
  const cacheFile = app.vault.getAbstractFileByPath(CACHE_FILE_PATH);
  if (cacheFile && cacheFile instanceof TFile) {
    await app.vault.modify(cacheFile, JSON.stringify(cachedDocuments));
  } else {
    await app.vault.create(CACHE_FILE_PATH, JSON.stringify(cachedDocuments));
  }
}

// 캐시를 파일에서 불러오기
async function loadCache(app: App): Promise<void> {
  try {
    const cacheFile = app.vault.getAbstractFileByPath(CACHE_FILE_PATH);
    if (cacheFile && cacheFile instanceof TFile) {
      const cacheContent = await app.vault.read(cacheFile);
      cachedDocuments = JSON.parse(cacheContent);
      new Notice('캐시 파일이 성공적으로 로드되었습니다.');
    }
  } catch (error) {
    new Notice('캐시 파일을 로드할 수 없습니다.');
    console.error('Error loading cache:', error);
  }
}

export async function processDocument(file: TFile, app: App, df: Record<string, number>, totalDocs: number, avgDocLength: number): Promise<void> {
  const content = await app.vault.cachedRead(file);
  const title = file.basename;
  const titleTerms = await tokenize(title);
  const contentTerms = await tokenize(content);

  const tfIdf = tfIdfScore(titleTerms, contentTerms, df, totalDocs);
  const bm25 = bm25Score(titleTerms, contentTerms, titleTerms, df, totalDocs, avgDocLength);

  cachedDocuments[file.path] = {
    title: title,
    content: content,
    terms: [...titleTerms, ...contentTerms],
    titleTerms,
    tfIdfScore: tfIdf,
    bm25Score: bm25
  };

  await saveCache(app); // 파일 수정 후 캐시를 저장
}

export async function initialize(app: App): Promise<void> {
  await loadCache(app); // 캐시 파일 로드

  const files = app.vault.getMarkdownFiles();
  const df: Record<string, number> = {};
  let totalDocLength = 0;

  // 새 파일이 추가된 경우에만 DF를 다시 계산
  for (const file of files) {
    if (!cachedDocuments[file.path]) {
      const content = await app.vault.cachedRead(file);
      const terms = await tokenize(content);
      totalDocLength += terms.length;

      const uniqueTerms = new Set(terms);
      uniqueTerms.forEach(term => {
        df[term] = (df[term] || 0) + 1;
      });
    }
  }

  const totalDocs = files.length;
  const avgDocLength = totalDocLength / totalDocs;

  // 새 파일에 대해 BM25 및 TF-IDF 계산 후 캐시에 저장
  for (const file of files) {
    if (!cachedDocuments[file.path]) {
      await processDocument(file, app, df, totalDocs, avgDocLength);
    }
  }

  // 파일이 변경되었을 때 해당 파일만 재처리
  app.vault.on('modify', async (abstractFile: TAbstractFile) => {
    // abstractFile이 TFile 타입인지 확인
    if (abstractFile instanceof TFile && abstractFile.extension === 'md') {
      await processDocument(abstractFile, app, df, totalDocs, avgDocLength);
    }
  });
}

// 검색 시 캐시된 결과 사용
export async function getRelevantDocuments(
  query: string,
  app: App, 
  documentNum: number,
  lastOpenedFile: TFile | null,
  algorithm: string  // 알고리즘 옵션을 인자로 받습니다.
): Promise<string> {
  try {
    const queryTerms = await tokenize(query);
    const similarities=Object.entries(cachedDocuments)
      .map(([path, doc]) => {
        const score =
          algorithm === 'BM25'
            ? bm25Score(queryTerms, doc.terms, doc.titleTerms, {}, 0, 0)
            : tfIdfScore(queryTerms, doc.terms, {}, 0);
        return { path, ...doc, score };
      })
      similarities.sort((a, b) => b.score - a.score);
      const topDocuments = similarities.slice(0, documentNum).filter((doc) => doc.score > 0);

      let currentDocumentContent = '';
      if (lastOpenedFile) {
        const lastOpenedContent = await app.vault.cachedRead(lastOpenedFile);
        currentDocumentContent = `::: Current Opened Document Path :::\n${lastOpenedFile.path}\n\n::: Current Opened Document Content :::\n${lastOpenedContent}\n`;
      }

      const matchingContents = [
        ...topDocuments.map(doc => `::: Document Path :::\n${doc.path}\n\n::: Document Content :::\n${doc.content}\n`)
      ];

      matchingContents.unshift(currentDocumentContent);
      const context = matchingContents.join('\n\n---\n\n');
      return context;
    } catch (error) {
      console.error('Error in getRelevantDocuments:', error);
      new Notice('문서를 검색하는 중 오류가 발생했습니다.');
      return '';
    }
  }



export function truncateContext(context: string, maxLength: number): string {
  if (context.length <= maxLength) {
    return context;
  }
  return context.substring(0, maxLength);
}










// ============================================================================================================












// 마크다운 문서를 청크로 분할하는 함수
export function parseMarkdownIntoChunks(content: string): { title: string; chunk: string[] }[] {
  const chunks: { title: string; chunk: string[] }[] = [];
  const lines = content.split('\n');
  let currentChunk: string[] = [];
  let currentTitle = '';

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentChunk.length > 0) {
        chunks.push({ title: currentTitle, chunk: currentChunk });
        currentChunk = [];
      }
      currentTitle = line;
    }
    currentChunk.push(line);
  }

  if (currentChunk.length > 0) {
    chunks.push({ title: currentTitle, chunk: currentChunk });
  }

  return chunks;
}

// 관련 문서 추출 함수
export async function getRelevantDocumentsByTopChunks(
  query: string,
  app: App, 
  documentNum: number,
  lastOpenedFile: TFile | null,
  chunkNum: number,
  algorithm: string  // BM25 또는 TF-IDF를 선택하는 옵션
): Promise<string> {
  try {
    const files = app.vault.getMarkdownFiles();

    if (files.length === 0) {
      new Notice('마크다운 파일을 찾을 수 없습니다.');
      return '';
    }

    const documents: { file: TFile; content: string; chunks: { title: string; chunk: string; score: number }[] }[] = [];
    const df: Record<string, number> = {};
    let totalDocLength = 0;
    let totalDocs = 0;

    // 각 문서의 청크 처리
    for (const file of files) {
      const content = await app.vault.cachedRead(file);
      const chunks = parseMarkdownIntoChunks(content);
      const documentChunks: { title: string; chunk: string; score: number }[] = [];

      for (const { title, chunk } of chunks) {
        const chunkContent = chunk.join('\n');
        const chunkTerms = await tokenize(chunkContent);
        const titleTerms = await tokenize(title);

        totalDocLength += chunkTerms.length;
        totalDocs += 1;

        const uniqueTerms = new Set(chunkTerms);
        uniqueTerms.forEach((term) => {
          df[term] = (df[term] || 0) + 1;
        });

        // 청크에 대한 초기 점수 0으로 설정
        documentChunks.push({
          title,
          chunk: chunkContent,
          score: 0,
        });
      }

      documents.push({ file, content, chunks: documentChunks });
    }

    const avgDocLength = totalDocLength / totalDocs;
    const queryTerms = await tokenize(query);
    

    // 각 문서의 청크에 대해 BM25 또는 TF-IDF 점수 계산
    for (const doc of documents) {
      for (const chunk of doc.chunks) {
        const chunkTerms = await tokenize(chunk.chunk);
        const titleTerms = await tokenize(chunk.title);

        if (algorithm === 'BM25') {
          chunk.score = bm25Score(queryTerms, chunkTerms, titleTerms, df, totalDocs, avgDocLength);
        } else if (algorithm === "TF-IDF") {
          chunk.score = tfIdfScore(queryTerms, chunkTerms, df, totalDocs);
        }
      }

      // 문서 내 청크들을 점수 기준으로 정렬
      doc.chunks.sort((a, b) => b.score - a.score);

      // 상위 5개의 청크의 평균 점수 계산
      const top5Chunks = doc.chunks.slice(0, chunkNum);
      const avgTop5Score = top5Chunks.reduce((acc, chunk) => acc + chunk.score, 0) / top5Chunks.length;

      // 문서의 전체 점수를 상위 5개의 청크 평균 점수로 설정
      doc['averageScore'] = avgTop5Score;
    }

    // 문서들을 상위 5개의 청크 평균 점수 기준으로 정렬
    documents.sort((a, b) => b['averageScore'] - a['averageScore']);

    // 상위 문서들을 반환
    const topDocuments = documents.slice(0, documentNum);
    
    // 결과 출력 형식 정의 - 문서 경로와 전체 내용을 반환
    const result = topDocuments.map(doc => 
      `::: Document Path :::\n${doc.file.path}\n::: Document Content :::\n${doc.content}`
    );


    let currentDocumentContent = '';
    if (lastOpenedFile) {
      const lastOpenedContent = await app.vault.cachedRead(lastOpenedFile);
      currentDocumentContent = `::: Current Opened Document Path :::\n${lastOpenedFile.path}\n\n::: Current Opened Document Content :::\n${lastOpenedContent}\n`;
    }

    result.unshift(currentDocumentContent);

    return result.join('\n\n====================\n\n');
  } catch (error) {
    console.error('Error in getRelevantDocuments:', error);
    new Notice('문서를 검색하는 중 오류가 발생했습니다.');
    return '';
  }
}