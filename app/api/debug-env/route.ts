export const runtime = 'edge';

export async function GET() {
  return new Response(
    JSON.stringify({
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}
