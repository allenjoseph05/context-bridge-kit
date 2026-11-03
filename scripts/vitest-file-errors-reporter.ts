// T09b: names the source of every error that is not a failed test, so a run that ends with
// "Test Files 1 failed" but no failed test identifies itself even when the output is filtered.
// Covers: file-level errors (import/collection, beforeAll/afterAll) and unhandled errors or
// rejections (attributed to a test file when vitest knows it). It only reports; it never changes
// the exit code or hides an error (vitest's default reporter still prints the full stack).
import type { Reporter, SerializedError, TestModule } from "vitest/node";

const TAG = "[file-errors]";

function firstLine(e: SerializedError): string {
  const name = typeof e.name === "string" ? e.name : "Error";
  const msg = typeof e.message === "string" ? e.message.split("\n")[0] : String(e);
  return `${name}: ${msg}`;
}

function origin(e: SerializedError): string {
  const rec = e as Record<string, unknown>;
  const path = typeof rec.VITEST_TEST_PATH === "string" ? rec.VITEST_TEST_PATH : "unknown file";
  const test = typeof rec.VITEST_TEST_NAME === "string" ? ` > ${rec.VITEST_TEST_NAME}` : "";
  const late = rec.VITEST_AFTER_ENV_TEARDOWN === true ? " (after environment teardown)" : "";
  return `${path}${test}${late}`;
}

export default class FileErrorsReporter implements Reporter {
  private lines: string[] = [];

  // Vitest calls every reporter's onTestRunEnd, then every reporter's onFinished; the default
  // reporter prints its errors and summary in onFinished. Collect here and print in onFinished
  // (this reporter is listed after "default"), so these lines come after the summary.
  onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
  ): void {
    const lines: string[] = [];
    for (const m of testModules) {
      if (m.state() !== "failed") continue;
      const errors = m.errors();
      let failedTests = 0;
      let tests = 0;
      for (const t of m.children.allTests()) {
        tests++;
        if (t.result().state === "failed") failedTests++;
      }
      if (errors.length === 0 && failedTests > 0) continue; // ordinary assertion failure
      lines.push(
        `${TAG} FILE FAILED without a failing test: [${m.project.name}] ${m.moduleId} ` +
          `(${tests} tests collected, ${failedTests} failed)`,
      );
      for (const e of errors) lines.push(`${TAG}   ${firstLine(e)}`);
    }
    for (const e of unhandledErrors) {
      lines.push(`${TAG} UNHANDLED ${firstLine(e)} — from ${origin(e)}`);
    }
    this.lines = lines;
  }

  onFinished(): void {
    if (this.lines.length > 0) process.stdout.write(`\n${this.lines.join("\n")}\n`);
    this.lines = [];
  }
}
