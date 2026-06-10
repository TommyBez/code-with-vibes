import "server-only"
import type { Sandbox } from "@vercel/sandbox"

/**
 * The minimal "generic sandbox" shape that `bash-tool` drives when it isn't
 * handed one of its first-party adapters. We deliberately expose this instead
 * of letting `bash-tool` auto-detect a `@vercel/sandbox` instance: its built-in
 * Vercel adapter targets the older positional `runCommand(cmd, args)` API,
 * whereas this project runs `@vercel/sandbox` v2 (object-form `runCommand`,
 * `readFileToBuffer`, stream-based `readFile`).
 */
export interface BashToolSandbox {
  executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  readFile(path: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Uint8Array }>): Promise<void>
}

/** Adapt a live v2 `Sandbox` to the interface `bash-tool` expects. */
export function bashToolSandbox(sandbox: Sandbox): BashToolSandbox {
  return {
    async executeCommand(command) {
      const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", command] })
      const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
      return { stdout, stderr, exitCode: result.exitCode }
    },
    async readFile(path) {
      const buffer = await sandbox.readFileToBuffer({ path })
      if (buffer == null) throw new Error(`File not found: ${path}`)
      return buffer.toString("utf-8")
    },
    async writeFiles(files) {
      await sandbox.writeFiles(files.map((file) => ({ path: file.path, content: file.content })))
    },
  }
}
