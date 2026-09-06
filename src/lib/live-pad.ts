import type { Problem } from "./types";

export const LIVE_PAD_PROBLEM: Problem = {
  title: "Live pair pad",
  difficulty: "Easy",
  topics: ["Pair programming"],
  functionName: "solve",
  description:
    "This is a **shared CoderPad**. Anyone with the link can type in the editor and in Notes at the same time.\n\nSketch an approach in notes, write code together, and run JavaScript, TypeScript, or Python in the browser.",
  examples: [],
  constraints: [],
  followUps: [],
  starterCode: {
    javascript: `// Pair on anything.

function solve() {
    
}
`,
    typescript: `// Pair on anything.

function solve(): void {
    
}
`,
    python: `# Pair on anything.

class Solution:
    def solve(self):
        `,
    java: `class Solution {
    public void solve() {
        
    }
}
`,
    cpp: `class Solution {
public:
    void solve() {
        
    }
};
`,
  },
  exampleTests: [],
  hiddenTests: [],
};
