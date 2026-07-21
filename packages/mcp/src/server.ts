#!/usr/bin/env node
/**
 * BlockGuard MCP Server
 *
 * Exposes the @blockguard/core engine as MCP tools for conversational use.
 * Tools:
 *   - index_site_blocks
 *   - find_block_usage
 *   - analyze_code_change
 *   - select_regression_pages
 *   - run_block_regression
 *   - get_regression_report
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { toolDefinitions } from './tools/index.js';
import { handleToolCall } from './tools/handler.js';

const server = new Server(
  {
    name: 'blockguard-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

// Dispatch tool calls to handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleToolCall(name, args ?? {});
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start the server on stdio transport
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write('BlockGuard MCP server running on stdio\n');
});
