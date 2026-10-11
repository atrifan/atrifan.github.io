/**
 * Jobs MCP tool modules, in tools/list order. Each module exports `tools`.
 * Adding a module is one line here, e.g. `export * as reviews from './reviews';`.
 * (./submission.ts has the QA track's tool shape; ./qa.ts adapts it.)
 */
export * as account from './account';
export * as jobs from './jobs';
export * as offers from './offers';
export * as bids from './bids';
export * as contracts from './contracts';
export * as progress from './progress';
export * as steering from './steering';
export * as qa from './qa';
