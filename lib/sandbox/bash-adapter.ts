import "server-only"
import type { Sandbox } from "@vercel/sandbox"

/**
 * Minimal sandbox interface expected by `bash-tool`'s `createBashTool`.
 * (Re-declared locally to avoid importing internal types.)
 */
export interface BashToolSandbox {
  executeCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  readFile(path: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array))
  }
  return Buffer.concat(chunks).toString("utf-8")
}

/**
 * Adapt a `@vercel/sandbox` (v2) instance to the shape `bash-tool` expects.
 *
 * `bash-tool@1.x` detects a Vercel sandbox by duck-typing a `sandboxId`
 * property, which v2 dropped in favor of `name`. Rather than rely on that
 * detection, we pass an explicit adapter implementing the three methods the
 * toolkit needs. The method bodies mirror the SDK's own internal wrapper.
 */
export function toBashToolSandbox(vs: Sandbox): BashToolSandbox {
  return {
    async executeCommand(command: string) {
      const result = await vs.runCommand("bash", ["-c", command])
      const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()])
      return { stdout, stderr, exitCode: result.exitCode }
    },
    async readFile(path: string) {
      const stream = await vs.readFile({ path })
      if (stream === null) throw new Error(`File not found: ${path}`)
      return streamToString(stream)
    },
    async writeFiles(files) {
      await vs.writeFiles(
        files.map((f) => ({
          path: f.path,
          content: Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content),
        })),
      )
    },
  }
}
