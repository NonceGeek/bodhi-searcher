interface CantoneseCorpusRow {
  id: number;
  key: string;
  key_others: string;
  pinyin: string[];
  word: string[];
  chinese_pinyin: string[];
  meaning: string[];
  phrases: string[];
  sentences: string[];
  created_at: string;
  updated_at: string;
}

interface TransformedEntry {
  context: {
    pron: string;
    english: string;
  };
  contributor: string;
}

export function transformCantoneseCorpus(row: CantoneseCorpusRow): TransformedEntry[] {
  // Parse the pinyin array from string representation
  const pinyins = JSON.parse(row.pinyin as unknown as string);
  const meanings = JSON.parse(row.meaning as unknown as string);

  return pinyins.map((pron: string, index: number) => ({
    context: {
      pron,
      english: meanings[index] || meanings[0] // Use corresponding meaning or fallback to first
    },
    contributor: "0x03"
  }));
}

// Example usage:
// const row = {
//   id: 1,
//   key: "行",
//   key_others: "",
//   pinyin: '["hang4", "haang4"]',
//   word: '["衡", "坑4"]',
//   chinese_pinyin: '["xing2"]',
//   meaning: '["走", "流通；传递", "能干"]',
//   phrases: '["步~|~路", ";发~", "他真~"]',
//   sentences: "",
//   created_at: "2025-05-03 13:51:05.525139+00",
//   updated_at: "2025-05-03 13:51:05.525139"
// };
// const transformed = transformCantoneseCorpus(row);
// console.log(JSON.stringify(transformed, null, 2)); 