/**
 * Structured logging utility for the VS Code extension.
 * Uses pino for JSON-structured logs, output to a VS Code output channel.
 */
import * as vscode from "vscode";
import pino, { type Logger } from "pino";

let outputChannel: vscode.OutputChannel;
let logger: Logger;

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Initialize the logger with a VS Code output channel.
 */
export function initLogger(level: LogLevel = "info"): Logger {
  outputChannel = vscode.window.createOutputChannel("Notebook Session Labs");

  // Custom destination that writes to VS Code output channel
  const destination = pino.destination({
    write(msg: string) {
      outputChannel.append(msg);
    },
    sync: true,
  });

  logger = pino(
    {
      level,
      name: "notebook-session-labs",
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );

  return logger;
}

/**
 * Get the current logger instance.
 */
export function getLogger(): Logger {
  if (!logger) {
    return initLogger();
  }
  return logger;
}

/**
 * Show the output channel in the VS Code UI.
 */
export function showOutputChannel(): void {
  if (outputChannel) {
    outputChannel.show(true);
  }
}

/**
 * Dispose of the logger and output channel.
 */
export function disposeLogger(): void {
  if (outputChannel) {
    outputChannel.dispose();
  }
}