export interface ParsedReasoningContent {
  answerText: string;
  reasoningText: string;
}

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

export function parseReasoningContent(content: string): ParsedReasoningContent {
  if (!content.includes(THINK_OPEN_TAG)) {
    return {
      answerText: content.trim(),
      reasoningText: "",
    };
  }

  const answerSegments: string[] = [];
  const reasoningSegments: string[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const start = content.indexOf(THINK_OPEN_TAG, cursor);
    if (start === -1) {
      answerSegments.push(content.slice(cursor));
      break;
    }

    answerSegments.push(content.slice(cursor, start));

    const reasoningStart = start + THINK_OPEN_TAG.length;
    const end = content.indexOf(THINK_CLOSE_TAG, reasoningStart);
    if (end === -1) {
      reasoningSegments.push(content.slice(reasoningStart));
      break;
    }

    reasoningSegments.push(content.slice(reasoningStart, end));
    cursor = end + THINK_CLOSE_TAG.length;
  }

  return {
    answerText: answerSegments.join("").replace(/\n{3,}/gu, "\n\n").trim(),
    reasoningText: reasoningSegments
      .join("\n\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim(),
  };
}
