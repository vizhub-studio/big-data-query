// vizhub-mcp-server.mjs
// Timeline Event Emitter for VizHub Studio
//
// This MCP server exposes a set of tools that create Project Timeline Events.
// Each tool:
//   - Creates exactly one timeline event via REST API
//   - Makes authenticated calls to studio.vizhub.com
//   - Is replayable and auditable
//   - Logs calls to console for visibility
//   - Returns human-readable toast notifications with event links
//
// Setup:
//   1. Copy .env.example to .env and fill in VIZHUB_PROJECT_ID
//   2. npm install
//
// Run with:
//   node vizhub-mcp/server.mjs

import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

// Load environment variables from .env file
config();

// Load environment variables
const projectId = process.env.VIZHUB_PROJECT_ID;
const baseUrl = process.env.VIZHUB_BASE_URL || "https://studio.vizhub.com";

// Validate required environment variables
if (!projectId) {
  console.error(
    "ERROR: VIZHUB_PROJECT_ID environment variable is required. Please set it in your .env file."
  );
  process.exit(1);
}

console.log(`[VizHub MCP Server] Project ID: ${projectId}`);
console.log(`[VizHub MCP Server] Base URL: ${baseUrl}`);

// Create MCP server
const mcpServer = new McpServer({
  name: "vizhub_server",
  version: "1.0.0",
});

/**
 * Helper: Make a request to the VizHub Timeline Events API
 * @param {string} endpoint - The endpoint path (e.g., 'add-viz-from-template')
 * @param {object} payload - The request payload
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function callVizhubApi(endpoint, payload) {
  const url = `${baseUrl}/api/timeline-events/${endpoint}`;
  const fullPayload = {
    projectId,
    ...payload,
  };

  console.log(`[API Call] POST ${url}`);
  console.log(`[API Payload]`, JSON.stringify(fullPayload, null, 2));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fullPayload),
    });

    const result = await response.json();

    if (result.success) {
      console.log(`[API Success] Event ID: ${result.data.eventId}`);
      return result;
    } else {
      console.error(
        `[API Error] ${result.error.code}: ${result.error.message}`
      );
      return result;
    }
  } catch (error) {
    console.error(`[Network Error] Failed to reach ${baseUrl}: ${error.message}`);
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: `Failed to reach VizHub backend at ${baseUrl}: ${error.message}`,
      },
    };
  }
}

/**
 * Helper: Generate event link
 * @param {string} eventId - The event ID returned from the API
 * @returns {string} - The full URL to view the event
 */
function getEventLink(eventId) {
  return `${baseUrl}/projects/${projectId}/${eventId}`;
}

// ============================================================================
// CREATION TOOLS
// Create new visualizations or branches
// ============================================================================

/**
 * Create a visualization from a template
 * Event: VIZ_ADDED_FROM_TEMPLATE
 */
mcpServer.registerTool(
  "add_viz_from_template",
  {
    description:
      "Create a new visualization in the project using a known template. This encodes best practices and creates a new timeline event.",
    inputSchema: z.object({
      template: z
        .enum(["scatter-plot", "line-chart", "choropleth", "bar-chart"])
        .describe("Template type to use for new viz"),
      viz_name: z
        .string()
        .optional()
        .describe("Optional human-readable name for the viz (auto-generated if omitted)"),
      target_path: z
        .string()
        .optional()
        .default("visualizations/")
        .describe("Path within project where viz will be created"),
    }),
  },
  async ({ template, viz_name, target_path }) => {
    const displayName = viz_name || `${template}-visualization`;

    const result = await callVizhubApi("add-viz-from-template", {
      template,
      vizName: displayName,
      templateTargetPath: target_path,
      content: `Created visualization '${displayName}' from ${template} template`,
    });

    if (result.success) {
      const eventLink = getEventLink(result.data.eventId);
      return {
        content: [
          {
            type: "text",
            text: `✅ Visualization "${displayName}" created from ${template} template`,
          },
          {
            type: "text",
            text: `🔗 ${eventLink}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${result.error.message}`,
          },
        ],
      };
    }
  }
);

/**
 * Fork an existing visualization within the project
 * Event: VIZ_FORKED
 */
mcpServer.registerTool(
  "fork_viz",
  {
    description:
      "Create a copy of an existing visualization for safe exploration. Generates a new viz ID and creates a timeline event linking source to fork.",
    inputSchema: z.object({
      source_viz_id: z.string().describe("ID of the visualization to fork"),
      new_name: z
        .string()
        .optional()
        .describe("Optional name for the forked visualization"),
    }),
  },
  async ({ source_viz_id, new_name }) => {
    const displayName = new_name || `fork-of-${source_viz_id}`;

    const result = await callVizhubApi("fork-viz", {
      sourceVizId: source_viz_id,
      forkedVizName: displayName,
      content: `Forked visualization '${displayName}' from ${source_viz_id}`,
    });

    if (result.success) {
      const eventLink = getEventLink(result.data.eventId);
      return {
        content: [
          {
            type: "text",
            text: `✅ Visualization forked successfully`,
          },
          {
            type: "text",
            text: `🔗 ${eventLink}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${result.error.message}`,
          },
        ],
      };
    }
  }
);

// ============================================================================
// INGESTION TOOLS
// Bring external assets into the project
// ============================================================================

/**
 * Copy a file into a visualization
 * Event: FILE_COPIED_INTO_VIZ
 */
mcpServer.registerTool(
  "copy_file_into_viz",
  {
    description:
      "Copy an external file into a visualization with explicit source and destination paths. No arbitrary filesystem access — host validates security.",
    inputSchema: z.object({
      source_path: z.string().describe("Full path to source file (external to project)"),
      viz_id: z.string().describe("Target visualization ID"),
      target_path: z
        .string()
        .optional()
        .default("data/")
        .describe("Path within the viz where file will be placed"),
      format_hint: z
        .enum(["csv", "json"])
        .optional()
        .describe("Optional hint about file format (auto-detected if omitted)"),
    }),
  },
  async ({ source_path, viz_id, target_path, format_hint }) => {
    const targetFileName = source_path.split("/").pop();
    const fullTargetPath = `${target_path}${targetFileName}`;

    const result = await callVizhubApi("copy-file-into-viz", {
      sourceFilePath: source_path,
      targetVizId: viz_id,
      targetFilePath: fullTargetPath,
      formatHint: format_hint,
      content: `Copied file from '${source_path}' into visualization '${viz_id}' at path '${fullTargetPath}'`,
    });

    if (result.success) {
      const eventLink = getEventLink(result.data.eventId);
      return {
        content: [
          {
            type: "text",
            text: `✅ File copied into ${viz_id} at ${fullTargetPath}`,
          },
          {
            type: "text",
            text: `🔗 ${eventLink}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${result.error.message}`,
          },
        ],
      };
    }
  }
);

// ============================================================================
// AI MODIFICATION TOOLS
// Request AI-powered changes to visualizations
// ============================================================================

/**
 * Request an AI edit to a visualization
 * Event: AI_EDIT_REQUESTED
 *
 * This creates a request event for AI processing.
 */
mcpServer.registerTool(
  "request_ai_edit",
  {
    description:
      "Request an AI-powered edit to an existing visualization. AI processes the request and emits child timeline events for each change.",
    inputSchema: z.object({
      viz_id: z.string().describe("ID of the visualization to edit"),
      instruction: z
        .string()
        .describe("Natural language instruction for the AI (e.g., 'Make bars taller, use blue')"),
      scope: z
        .enum(["visual", "data", "interaction", "refactor"])
        .optional()
        .default("visual")
        .describe("Scope of the edit: visual style, data processing, interaction, or refactoring"),
      files: z
        .array(z.string())
        .optional()
        .describe("Optional: specific files to edit within the viz"),
    }),
  },
  async ({ viz_id, instruction, scope, files }) => {
    const result = await callVizhubApi("request-ai-edit", {
      editVizId: viz_id,
      instruction,
      scope,
      files,
      content: `AI edit request for visualization '${viz_id}': "${instruction}" (Scope: ${scope})`,
    });

    if (result.success) {
      const eventLink = getEventLink(result.data.eventId);
      return {
        content: [
          {
            type: "text",
            text: `✅ AI edit requested for ${viz_id}`,
          },
          {
            type: "text",
            text: `🔗 ${eventLink}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${result.error.message}`,
          },
        ],
      };
    }
  }
);

// ============================================================================
// METADATA & NARRATIVE TOOLS
// Manage naming and project documentation
// ============================================================================

/**
 * Rename a visualization
 * Event: VIZ_RENAMED
 */
mcpServer.registerTool(
  "rename_viz",
  {
    description: "Rename an existing visualization. Emits a VIZ_RENAMED timeline event.",
    inputSchema: z.object({
      viz_id: z.string().describe("ID of the visualization to rename"),
      new_name: z.string().describe("New name for the visualization"),
    }),
  },
  async ({ viz_id, new_name }) => {
    const result = await callVizhubApi("rename-viz", {
      renamedVizId: viz_id,
      newVizName: new_name,
      content: `Renamed visualization to '${new_name}'`,
    });

    if (result.success) {
      const eventLink = getEventLink(result.data.eventId);
      return {
        content: [
          {
            type: "text",
            text: `✅ Visualization renamed to "${new_name}"`,
          },
          {
            type: "text",
            text: `🔗 ${eventLink}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${result.error.message}`,
          },
        ],
      };
    }
  }
);

/**
 * Add a note to the project timeline
 * Event: PROJECT_NOTE_ADDED
 *
 * This turns the timeline into a narrative log, useful for:
 * - Decision tracking
 * - Teaching artifacts
 * - Client-visible commentary
 */
mcpServer.registerTool(
  "add_project_note",
  {
    description:
      "Add a note or decision log entry to the project timeline. Creates a PROJECT_NOTE_ADDED event. Useful for teaching, decisions, and client feedback.",
    inputSchema: z.object({
      message: z.string().describe("Note text to add to the timeline"),
      related_viz_id: z
        .string()
        .optional()
        .describe("Optional reference to a specific visualization"),
    }),
  },
  async ({ message, related_viz_id }) => {
    const result = await callVizhubApi("add-project-note", {
      content: message,
      relatedVizId: related_viz_id,
    });

    if (result.success) {
      const eventLink = getEventLink(result.data.eventId);
      return {
        content: [
          {
            type: "text",
            text: `✅ Note added to project timeline`,
          },
          {
            type: "text",
            text: `🔗 ${eventLink}`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `❌ Error: ${result.error.message}`,
          },
        ],
      };
    }
  }
);

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Connect via stdio
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
