// src/index.ts
import './tasks/fetchPools';
import { main } from './app.js';

// 애플리케이션 시작
main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});
