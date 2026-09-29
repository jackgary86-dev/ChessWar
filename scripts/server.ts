/** Start the online 1v1 server: `npm run server` (PORT env var optional). */
import { startServer } from '../src/server/index.ts';

const port = Number(process.env.PORT ?? '8787');
const server = await startServer(port);
console.log(`Chess War server listening on ws://localhost:${String(server.port)}`);
