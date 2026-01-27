#!/usr/bin/env npx tsx
/**
 * Debug script to examine MCP tools format
 * 
 * Usage:
 *   npx tsx scripts/debug-mcp-tools.ts
 * 
 * Requires:
 *   - TEST_USER_ID in .env.local
 *   - A valid API key for the user
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createMCPClient } from '@ai-sdk/mcp';

dotenv.config({ path: '.env.local' });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function main() {
  console.log('=== MCP Tools Debug Script ===\n');

  // Use provided API key or from environment
  const apiKey = process.argv[2] || process.env.TEST_API_KEY || 'ak_CSRHXK64X99YG9HQ28KJ2Y8ME00XG5H9';
  const serverName = 'default';
  const mcpUrl = `${BASE_URL}/api/mcp/${apiKey}/${serverName}`;
  
  console.log('Configuration:');
  console.log('  API Key:', apiKey.substring(0, 8) + '...');
  console.log('  MCP URL:', mcpUrl);
  console.log('');

  // 1. Direct JSON-RPC call to tools/list
  console.log('=== 1. Direct JSON-RPC tools/list ===\n');
  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });
    
    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Tools count:', result.result?.tools?.length || 0);
    
    if (result.result?.tools?.length > 0) {
      console.log('\nFirst 3 tools (raw format):');
      for (const tool of result.result.tools.slice(0, 3)) {
        console.log('\n  Tool:', tool.name);
        console.log('    description:', tool.description?.substring(0, 80) + '...');
        console.log('    inputSchema:', JSON.stringify(tool.inputSchema).substring(0, 100) + '...');
        console.log('    has execute?:', typeof tool.execute);
      }
    }
  } catch (error) {
    console.error('Direct call failed:', error);
  }

  // 2. Using @ai-sdk/mcp createMCPClient
  console.log('\n\n=== 2. @ai-sdk/mcp createMCPClient.tools() ===\n');
  try {
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url: mcpUrl,
      },
    });
    
    console.log('MCP client created successfully');
    
    const tools = await client.tools();
    const toolNames = Object.keys(tools);
    console.log('Tools count:', toolNames.length);
    
    if (toolNames.length > 0) {
      console.log('\nFirst 3 tools (AI SDK format):');
      for (const name of toolNames.slice(0, 3)) {
        const tool = tools[name] as Record<string, unknown>;
        console.log('\n  Tool:', name);
        console.log('    type:', typeof tool);
        console.log('    keys:', Object.keys(tool));
        console.log('    has execute?:', typeof tool.execute);
        console.log('    has description?:', typeof tool.description);
        console.log('    has inputSchema?:', typeof tool.inputSchema);
        
        // Show the tool structure
        console.log('    structure:', JSON.stringify(tool, (key, value) => {
          if (typeof value === 'function') return '[Function]';
          if (typeof value === 'object' && value !== null) {
            return value;
          }
          return value;
        }, 2).substring(0, 300) + '...');
      }
    }
    
    await client.close();
  } catch (error) {
    console.error('@ai-sdk/mcp failed:', error);
  }

  console.log('\n=== Debug Complete ===');
}

main().catch(console.error);

