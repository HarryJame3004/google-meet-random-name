import { runAllTests } from '../src/core/test-suite.ts';

console.log('--- STARTING MEET RANDOM PICKER TEST SUITE ---');
const summary = runAllTests();
console.log(`Executed ${summary.total} tests in ${summary.durationMs}ms`);
console.log(`Passed: ${summary.passed} / ${summary.total}`);
console.log(`Failed: ${summary.failed}`);

for (const r of summary.results) {
  const symbol = r.passed ? '✅' : '❌';
  console.log(`${symbol} [${r.id}] ${r.name} (${r.durationMs}ms): ${r.message}`);
  if (r.details) {
    console.log(`    Details: ${r.details}`);
  }
}

if (summary.failed > 0) {
  process.exit(1);
} else {
  console.log('--- ALL 10 TESTS PASSED PERFECTLY ---');
}
