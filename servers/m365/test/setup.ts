// Node 18 lacks the Web `File` global that Node 20+ and browsers provide.
// The generated Graph client uses `z.instanceof(File)` for multipart upload
// endpoints, so importing it under Node 18 throws ReferenceError at module load.
// Provide a minimal stand-in so tests that load the real client can run on 18.
if (typeof (globalThis as { File?: unknown }).File === 'undefined') {
  (globalThis as { File?: unknown }).File = class File {};
}

// Read results are spotlight-wrapped by default; the older suites assert the raw JSON, so they run
// with it off. test/spotlight.test.ts turns it on and checks the default behaviour.
process.env.MS365_MCP_SPOTLIGHT = 'false';
