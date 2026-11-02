const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

/**
 * Splits document text into overlapping chunks so embedding search can return
 * the specific passage an answer is grounded in, instead of whole documents.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end).trim());
    if (end === normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchableChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  embedding: number[];
}

export interface RankedChunk {
  documentId: string;
  documentName: string;
  content: string;
  score: number;
}

export function rankChunksByRelevance(
  chunks: SearchableChunk[],
  queryEmbedding: number[],
  topK: number,
): RankedChunk[] {
  return chunks
    .map((chunk) => ({
      documentId: chunk.documentId,
      documentName: chunk.documentName,
      content: chunk.content,
      score: cosineSimilarity(chunk.embedding, queryEmbedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
