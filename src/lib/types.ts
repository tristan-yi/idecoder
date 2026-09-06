export type Difficulty = "Easy" | "Medium" | "Hard";

export type LanguageId =
  | "javascript"
  | "typescript"
  | "python"
  | "java"
  | "cpp";

export type Example = {
  input: string;
  output: string;
  explanation?: string;
};

export type TestCase = {
  args: unknown[];
  expected: unknown;
};

export type Problem = {
  title: string;
  difficulty: Difficulty;
  topics: string[];
  description: string;
  examples: Example[];
  constraints: string[];
  followUps?: string[];
  functionName: string;
  starterCode: Partial<Record<LanguageId, string>>;
  exampleTests: TestCase[];
  hiddenTests: TestCase[];
};

export type Session = {
  id: string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  problem: Problem;
  language: LanguageId;
  codeByLanguage: Partial<Record<LanguageId, string>>;
  notes?: string;
};

export type ProviderId = "openai" | "anthropic" | "openrouter";

export type Settings = {
  provider: ProviderId;
  apiKey: string;
  model: string;
};

export type TestResult = {
  index: number;
  pass: boolean;
  actual: unknown;
  expected: unknown;
  error: string | null;
};

export type RunOutcome = {
  ok: boolean;
  stdout: string;
  stderr: string;
  results: TestResult[] | null;
  timedOut?: boolean;
};
