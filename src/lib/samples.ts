import type { Problem } from "./types";

export const SAMPLE_PROMPTS = [
  {
    id: "two-sum",
    label: "Two Sum",
    prompt: "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target.",
  },
  {
    id: "valid-parentheses",
    label: "Valid Parentheses",
    prompt: "Given a string s containing just the characters ()[]{}, determine if the input string is valid.",
  },
  {
    id: "buy-sell",
    label: "Best Time to Buy and Sell Stock",
    prompt: "You are given an array prices where prices[i] is the price of a given stock on the ith day. Find the maximum profit from one buy and one sell.",
  },
] as const;

export const SAMPLE_PROBLEMS: Record<string, Problem> = {
  "two-sum": {
    title: "Two Sum",
    difficulty: "Easy",
    topics: ["Array", "Hash Table"],
    functionName: "twoSum",
    description:
      "Given an array of integers `nums` and an integer `target`, return **indices of the two numbers such that they add up to `target`**.\n\nYou may assume that each input would have **exactly one solution**, and you may not use the same element twice.\n\nYou can return the answer in any order.",
    examples: [
      {
        input: "nums = [2,7,11,15], target = 9",
        output: "[0,1]",
        explanation: "Because nums[0] + nums[1] == 9, we return [0, 1].",
      },
      {
        input: "nums = [3,2,4], target = 6",
        output: "[1,2]",
      },
      {
        input: "nums = [3,3], target = 6",
        output: "[0,1]",
      },
    ],
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Only one valid answer exists.",
    ],
    followUps: [
      "What if there were multiple valid pairs — could you return all of them?",
      "Can you solve it in one pass with O(n) time?",
    ],
    starterCode: {
      javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {
    
}`,
      typescript: `function twoSum(nums: number[], target: number): number[] {
    
}`,
      python: `from typing import List

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        `,
      java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        
    }
}`,
      cpp: `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        
    }
};`,
    },
    exampleTests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
      { args: [[3, 3], 6], expected: [0, 1] },
    ],
    hiddenTests: [
      { args: [[1, 5, 3, 7], 8], expected: [1, 2] },
      { args: [[0, 4, 3, 0], 0], expected: [0, 3] },
      { args: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
    ],
  },
  "valid-parentheses": {
    title: "Valid Parentheses",
    difficulty: "Easy",
    topics: ["String", "Stack"],
    functionName: "isValid",
    description:
      "Given a string `s` containing just the characters `'('`, `')'`, `'{'`, `'}'`, `'['` and `']'`, determine if the input string is valid.\n\nAn input string is valid if:\n\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.",
    examples: [
      {
        input: 's = "()"',
        output: "true",
      },
      {
        input: 's = "()[]{}"',
        output: "true",
      },
      {
        input: 's = "(]"',
        output: "false",
      },
      {
        input: 's = "([])"',
        output: "true",
      },
    ],
    constraints: [
      "1 <= s.length <= 10^4",
      "s consists of parentheses only '()[]{}'.",
    ],
    followUps: [
      "How would you handle additional bracket types?",
      "Can you also return the indices of the first mismatch?",
    ],
    starterCode: {
      javascript: `/**
 * @param {string} s
 * @return {boolean}
 */
function isValid(s) {
    
}`,
      typescript: `function isValid(s: string): boolean {
    
}`,
      python: `class Solution:
    def isValid(self, s: str) -> bool:
        `,
      java: `class Solution {
    public boolean isValid(String s) {
        
    }
}`,
      cpp: `class Solution {
public:
    bool isValid(string s) {
        
    }
};`,
    },
    exampleTests: [
      { args: ["()"], expected: true },
      { args: ["()[]{}"], expected: true },
      { args: ["(]"], expected: false },
      { args: ["([])"], expected: true },
    ],
    hiddenTests: [
      { args: ["([)]"], expected: false },
      { args: ["{[]}"], expected: true },
      { args: ["]"], expected: false },
      { args: ["((("], expected: false },
    ],
  },
  "buy-sell": {
    title: "Best Time to Buy and Sell Stock",
    difficulty: "Easy",
    topics: ["Array", "Dynamic Programming"],
    functionName: "maxProfit",
    description:
      "You are given an array `prices` where `prices[i]` is the price of a given stock on the `i`th day.\n\nYou want to maximize your profit by choosing a **single day** to buy one stock and choosing a **different day in the future** to sell that stock.\n\nReturn *the maximum profit you can achieve from this transaction*. If you cannot achieve any profit, return `0`.",
    examples: [
      {
        input: "prices = [7,1,5,3,6,4]",
        output: "5",
        explanation:
          "Buy on day 2 (price = 1) and sell on day 5 (price = 6), profit = 6-1 = 5.",
      },
      {
        input: "prices = [7,6,4,3,1]",
        output: "0",
        explanation:
          "In this case, no transactions are done and the max profit = 0.",
      },
    ],
    constraints: [
      "1 <= prices.length <= 10^5",
      "0 <= prices[i] <= 10^4",
    ],
    followUps: [
      "What if you were allowed to complete as many transactions as you like?",
      "What if you could only hold at most two transactions?",
    ],
    starterCode: {
      javascript: `/**
 * @param {number[]} prices
 * @return {number}
 */
function maxProfit(prices) {
    
}`,
      typescript: `function maxProfit(prices: number[]): number {
    
}`,
      python: `from typing import List

class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        `,
      java: `class Solution {
    public int maxProfit(int[] prices) {
        
    }
}`,
      cpp: `class Solution {
public:
    int maxProfit(vector<int>& prices) {
        
    }
};`,
    },
    exampleTests: [
      { args: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { args: [[7, 6, 4, 3, 1]], expected: 0 },
    ],
    hiddenTests: [
      { args: [[1]], expected: 0 },
      { args: [[2, 4, 1]], expected: 2 },
      { args: [[3, 2, 6, 5, 0, 3]], expected: 4 },
    ],
  },
};
