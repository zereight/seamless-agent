#!/usr/bin/env node
/**
 * Seamless Agent MCP Server - CLI Tool
 *
 * This is a standalone MCP server that communicates with the Seamless Agent
 * VS Code extension via HTTP API. It uses stdio transport to communicate
 * with MCP clients (like Antigravity).
 *
 * Usage: node seamless-agent-mcp.js --port <api-port>
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let port = null;
    let token = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) {
            port = parseInt(args[i + 1], 10);
            i++;
        }
        if (args[i] === '--token' && args[i + 1]) {
            token = String(args[i + 1]);
            i++;
        }
    }

    if (!port || isNaN(port) || !token) {
        console.error('Usage: seamless-agent-mcp --port <api-port> --token <api-token>');
        console.error('  --port  The port where the VS Code extension API is running');
        console.error('  --token Authentication token for the local API service');
        process.exit(1);
    }

    return { port, token };
}

// Make HTTP request to VS Code extension API
async function callExtensionApi(port, token, endpoint, data) {
    const url = `http://localhost:${port}${endpoint}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        // Check if extension API is available
        if (error.cause && error.cause.code === 'ECONNREFUSED') {
            throw new Error(
                `Cannot connect to Seamless Agent extension API at port ${port}. ` +
                `Please ensure the VS Code extension is running and the API service has started.`
            );
        }
        throw error;
    }
}

async function main() {
    const { port, token } = parseArgs();

    // Create MCP server
    const server = new McpServer({
        name: 'seamless-agent',
        version: '1.0.0',
    });

    // Register ask_user tool
    server.tool(
        'ask_user',
        'Ask the user to confirm an action or decision. Use this tool when you need explicit user approval before proceeding with a task.',
        {
            question: z.string().describe('The question or prompt to display to the user for confirmation'),
            title: z.string().optional().describe('Optional custom title for the confirmation dialog'),
            agentName: z.string().optional().describe('Your agent name'),
        },
        async (args) => {
            try {
                const result = await callExtensionApi(port, token, '/ask_user', {
                    question: args.question,
                    title: args.title,
                    agentName: args.agentName,
                });

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                responded: false,
                                response: `Error: ${error.message}`,
                                attachments: [],
                            }),
                        },
                    ],
                    isError: true,
                };
            }
        }
    );

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    // Log to stderr (stdout is used for MCP protocol)
    console.error(`Seamless Agent MCP server started, connecting to API at port ${port}`);
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
