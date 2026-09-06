const BASE = process.env.BASE_URL || "http://localhost:3002";

async function main() {
  const res = await fetch(`${BASE}/api/review/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: { title: "Stock counts are going negative and adjust is flaky" },
      items: [
        {
          summary:
            "I updated the adjust endpoint so it returns a 400 when the adjustment would take the quantity below zero.",
          plantedLabel: "Drops the guard: if (newQuantity < 0) {",
          plantedExplanation:
            "The happy path still works, so this only shows up on a large negative delta. Every other handler checks first and returns a 4xx.",
          decision: "reject",
          explanation:
            "The summary says it returns a 400 below zero but the guard is not actually in the code, so the quantity can still go negative. Every other handler in this file validates before writing.",
        },
        {
          summary: "I added a not-found check before applying the delta.",
          plantedLabel: null,
          plantedExplanation: null,
          decision: "reject",
          explanation: "I don't like it.",
        },
        // Regression: a fluent, confident description of a defect that was not
        // the planted one. Must score caught=false however good it sounds.
        {
          summary:
            "I've modified the delete endpoint to mark the thread as deleted instead of removing it entirely, so replies survive.",
          plantedLabel: "Reads id from req.body instead of req.params",
          plantedExplanation:
            "The route is registered with a \":id\" path segment, so the value arrives on req.params. Reading req.body.id yields undefined for a DELETE.",
          decision: "reject",
          explanation:
            "It drops the not-found guard, so deleting a missing id returns 200 instead of 404, which is the edge case every other handler here checks first.",
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.log(`HTTP ${res.status}: ${data.error}`);
    return;
  }

  for (const item of data.items) {
    console.log(
      `item ${item.index}: caught=${item.caught} clarity=${item.clarity} convention=${item.referencedConvention} edges=${item.checkedEdgeCases}`,
    );
    console.log(`  ${item.note}`);
  }
  console.log(`\nsummary: ${data.summary}`);
  console.log(`strengths: ${JSON.stringify(data.strengths)}`);
  console.log(`improvements: ${JSON.stringify(data.improvements)}`);
}

void main();
