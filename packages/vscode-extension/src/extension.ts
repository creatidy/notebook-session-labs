/**
 * Notebook Session Labs - VS Code Extension Entry Point
 *
 * Activates when a notebook is opened, starts the local bridge,
 * and registers commands for controlling the bridge lifecycle.
 */
import * as vscode from "vscode";
import { initLogger, getLogger, disposeLogger, showOutputChannel } from "./utils/logger.js";
import { startServer, stopServer, type BridgeServerInfo } from "./bridge/server.js";
import { DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT, DEFAULT_MAX_OUTPUT_SIZE, DEFAULT_BRIDGE_AUTH_MODE } from "@notebook-session-labs/shared";
import type { BridgeAuthMode } from "@notebook-session-labs/shared";
import { initExecutionMonitor } from "./notebookService.js";

let statusBarItem: vscode.StatusBarItem;
let currentBridgeInfo: BridgeServerInfo | null = null;

/**
 * Extension activation entry point.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Initialize logging
  const config = vscode.workspace.getConfiguration("notebookSessionLabs");
  const logLevel = config.get<string>("logging.level", "info");
  initLogger(logLevel as "debug" | "info" | "warn" | "error");

  const log = getLogger();
  log.info("Notebook Session Labs extension activating");

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = "notebookSessionLabs.showBridgeStatus";
  updateStatusBar(false);
  statusBarItem.show();

  // Initialize execution monitor for event-driven cell tracking
  context.subscriptions.push(initExecutionMonitor());

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "notebookSessionLabs.startBridge",
      startBridgeCommand,
    ),
    vscode.commands.registerCommand(
      "notebookSessionLabs.stopBridge",
      stopBridgeCommand,
    ),
    vscode.commands.registerCommand(
      "notebookSessionLabs.showBridgeStatus",
      showBridgeStatusCommand,
    ),
  );

  // Auto-start bridge if configured
  const autoStart = config.get<boolean>("bridge.autoStart", true);
  const bridgeEnabled = config.get<boolean>("bridge.enabled", true);
  if (autoStart && bridgeEnabled) {
    await startBridgeCommand();
  }

  log.info("Notebook Session Labs extension activated");
}

/**
 * Extension deactivation entry point.
 */
export async function deactivate(): Promise<void> {
  const log = getLogger();
  log.info("Notebook Session Labs extension deactivating");

  await stopServer();
  if (statusBarItem) {
    statusBarItem.dispose();
  }
  disposeLogger();
}

/**
 * Start the bridge server.
 */
async function startBridgeCommand(): Promise<void> {
  const log = getLogger();
  const config = vscode.workspace.getConfiguration("notebookSessionLabs");

  const host = config.get<string>("bridge.host", DEFAULT_BRIDGE_HOST);
  const port = config.get<number>("bridge.port", DEFAULT_BRIDGE_PORT);
  const maxOutputSize = config.get<number>("output.maxSize", DEFAULT_MAX_OUTPUT_SIZE);
  const includeImages = config.get<boolean>("output.includeImages", true);
  const authMode = config.get<BridgeAuthMode>("bridge.authMode", DEFAULT_BRIDGE_AUTH_MODE);

  try {
    currentBridgeInfo = await startServer(host, port, maxOutputSize, includeImages, authMode);
    updateStatusBar(true);

    log.info(
      { host: currentBridgeInfo.host, port: currentBridgeInfo.port, authMode: currentBridgeInfo.authMode },
      "Bridge started",
    );

    vscode.window.setStatusBarMessage(
      `Notebook Session Labs: Bridge running on port ${currentBridgeInfo.port} (token auth)`,
      5000,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Failed to start bridge");
    vscode.window.showErrorMessage(
      `Notebook Session Labs: Failed to start bridge: ${error}`,
    );
  }
}

/**
 * Stop the bridge server.
 */
async function stopBridgeCommand(): Promise<void> {
  const log = getLogger();
  try {
    await stopServer();
    currentBridgeInfo = null;
    updateStatusBar(false);
    log.info("Bridge stopped");
    vscode.window.setStatusBarMessage(
      "Notebook Session Labs: Bridge stopped",
      3000,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Failed to stop bridge");
    vscode.window.showErrorMessage(
      `Notebook Session Labs: Failed to stop bridge: ${error}`,
    );
  }
}

/**
 * Show bridge status information.
 */
function showBridgeStatusCommand(): void {
  showOutputChannel();

  if (currentBridgeInfo) {
    vscode.window.showInformationMessage(
      `Notebook Session Labs: Bridge running at http://${currentBridgeInfo.host}:${currentBridgeInfo.port} (token auth)`,
    );
  } else {
    vscode.window.showInformationMessage(
      "Notebook Session Labs: Bridge is not running",
    );
  }
}

/**
 * Update the status bar item.
 */
function updateStatusBar(running: boolean): void {
  if (running && currentBridgeInfo) {
    statusBarItem.text = `$(plug) Notebook Bridge (token)`;
    statusBarItem.tooltip = `Notebook Session Labs bridge running on port ${currentBridgeInfo.port}, token auth enabled`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(plug) Notebook Bridge (off)";
    statusBarItem.tooltip = "Notebook Session Labs bridge is not running";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
  }
}