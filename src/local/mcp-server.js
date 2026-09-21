import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LocalAssetBridge } from './asset-bridge.js';

function options(argv) {
  const result = { port: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--assets-dir') result.assetsDir = argv[++index];
    else if (value === '--port') result.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!result.assetsDir)
    throw new Error('Usage: chocodrop-mcp --assets-dir <directory> [--port <port>]');
  if (!Number.isInteger(result.port) || result.port < 0 || result.port > 65535)
    throw new Error('--port must be a valid port number');
  return result;
}

function text(value, isError = false) {
  return { content: [{ type: 'text', text: value }], ...(isError ? { isError: true } : {}) };
}

function validateImport(args) {
  if (!args || typeof args.path !== 'string' || !args.path)
    throw new Error('path must be a non-empty string');
  if (
    args.position !== undefined &&
    (!args.position ||
      typeof args.position !== 'object' ||
      !['x', 'y', 'z'].every((key) => Number.isFinite(args.position[key])))
  )
    throw new Error('position must contain finite x, y, and z numbers');
  return args;
}

export async function runMcpServer(argv = process.argv.slice(2), bridgeOptions = {}) {
  const bridge = await new LocalAssetBridge({ ...options(argv), ...bridgeOptions }).start();
  process.stderr.write(`ChocoDrop local bridge: ${bridge.browserUrl}\n`);
  const server = new Server(
    { name: 'chocodrop-local', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_status',
        description: 'Get the local ChocoDrop scene URL and connection state.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'import_asset',
        description: 'Import one allowed local asset into the connected ChocoDrop browser scene.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', minLength: 1 },
            position: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
              required: ['x', 'y', 'z'],
              additionalProperties: false,
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'get_status') return text(JSON.stringify(bridge.getStatus(), null, 2));
    if (request.params.name !== 'import_asset')
      return text(`Unknown tool: ${request.params.name}`, true);
    try {
      const { path, position } = validateImport(request.params.arguments);
      return text(JSON.stringify(await bridge.importAsset(path, position)));
    } catch (error) {
      return text(error.message, true);
    }
  });
  const transport = new StdioServerTransport();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await bridge.stop();
    await server.close();
  };
  await server.connect(transport);
  server.onclose = () => {
    shutdown().catch((error) => process.stderr.write(`${error.message}\n`));
  };
  process.stdin.once('end', () =>
    shutdown().catch((error) => process.stderr.write(`${error.message}\n`))
  );
  process.once('SIGINT', () =>
    shutdown().catch((error) => process.stderr.write(`${error.message}\n`))
  );
  process.once('SIGTERM', () =>
    shutdown().catch((error) => process.stderr.write(`${error.message}\n`))
  );
  return { bridge, server, shutdown };
}

export { options, validateImport };
