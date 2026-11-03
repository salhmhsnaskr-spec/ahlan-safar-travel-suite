import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['integration/local-schema/security/office-scope.test.ts'], fileParallelism: false, testTimeout: 30000 } });
