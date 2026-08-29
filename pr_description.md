🎯 **What:** Addressed the code health issue of duplicated `if (!activeVideo) return` guard clauses across many functions dealing with video actions.
💡 **Why:** Reduces code duplication, makes the codebase easier to read, maintain and less prone to developer error by standardizing check patterns using a Higher-Order Function (`withActiveVideo(fn)`).
✅ **Verification:** Re-ran the full Jest test suite (all tests passing) and `npm run lint` & `npm run format` (no errors or warnings).
✨ **Result:** Improved maintainability while preserving the exact functionality of `activeVideo` state checking for all video action functions in `content.js`.
