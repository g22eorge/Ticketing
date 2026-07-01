export const runtime = 'nodejs';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'lib', 'auth.ts');
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const snippet = lines.slice(0, 60).join('\n');
    return new Response(snippet, { status: 200, headers: { 'content-type': 'text/plain' } });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
