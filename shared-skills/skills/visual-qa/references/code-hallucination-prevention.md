# Code & Logic Hallucination Prevention Rules

To prevent models from hallucinating APIs, writing syntactically invalid code, or omitting critical edge cases during implementation tasks, all coding tasks must be verified using compilers, strict linters, type checkers, and runtime tests.

---

## 1-10 Scoring Rubric for Coding/Implementation Tasks

| Score Range | Tier | Criteria |
| :--- | :--- | :--- |
| **8 - 10** | **Premium / Excellent** | - **Strict Compilation & Diagnostics**: Code compiles with zero warnings under strict configurations (e.g., `tsconfig.json` with `noImplicitAny: true`, `go vet`, `cargo clippy`).<br>- **Test-Driven Verification**: 100% of newly added logic and state transitions are covered by meaningful automated tests (unit, integration).<br>- **Exhaustive Edge Cases**: At least 5 boundary conditions (empty, overflow, concurrency, error states) are explicitly tested.<br>- **Zero API Hallucination**: No non-existent methods, parameters, or packages are used. All SDKs are validated against official docs. |
| **5 - 7** | **Moderate / Standard** | - **Basic Execution**: Code compiles and passes happy-path tests.<br>- **Loose Type-Checking**: Basic types are defined, but minor overrides (e.g., `any` casting, `ignore` comments) are present.<br>- **Coarse Edge Testing**: Happy path and standard error cases are covered, but no extreme boundaries or race condition checks.<br>- **Low API Drift**: Minor version differences in SDKs are noted but not programmatically locked. |
| **1 - 4** | **Basic / Low** | - **Broken Syntax**: Code fails to compile, build, or run due to syntax or type errors.<br>- **High Hallucination**: Model calls deprecated, fictitious, or speculative APIs/methods.<br>- **Untested & Unverified**: Code is committed without running compiler checks, linters, or test suites.<br>- **No Error Handling**: The implementation crashes immediately on null/undefined or network failures. |

---

## Technical Verification Checklist

To achieve a score of **8 - 10**, the coding task must implement and verify the following checks:

### 1. Language-Server & Compiler Diagnostics Check
- **Check**: Run the language compiler/type-checker (e.g., `tsc --noEmit` for TypeScript, `go build` / `gofmt` for Go, `cargo check` for Rust).
- **Rule**: Absolutely zero errors, warnings, or format violations are allowed. Code must conform to standard workspace style rules.
- **Action**: Run lint/format commands programmatically and check exit codes.

### 2. API & Dependency Verification
- **Check**: Programmatically verify that every imported library and method is resolved.
- **Rule**: If using external SDKs (AWS, Firebase, OpenAI, Gemini), verify the signatures against official documentation.
- **Action**: Prevent hallucinating options. For example, in Gemini SDK calls, verify that the configuration parameters (e.g. `generationConfig`, `safetySettings`) match the exact SDK version in `package.json`.

### 3. Edge Case & Boundary Verification
- **Check**: Audit the logic for the following conditions:
  - **Null/Undefined/Nil**: Ensure all optional or nullable variables are guarded.
  - **Empty Collection**: Ensure lists, strings, and maps are handled safely when empty.
  - **Integer/Float Limits**: Ensure no overflow, division-by-zero, or precision loss.
  - **Concurrency/Asynchrony**: Validate that async functions are awaited correctly, promises are handled, and race conditions are mitigated.
- **Action**: Add unit tests specifically covering these extreme bounds.

### 4. Automated Test Coverage
- **Check**: Run tests with coverage reporting (e.g., Jest, Vitest, cargo test, go test -cover).
- **Rule**: Newly added files must achieve high test coverage.
- **Action**: Check that tests verify both the expected output (happy paths) and correct error handling (exceptions, error types).
